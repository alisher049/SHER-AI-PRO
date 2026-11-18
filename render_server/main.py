import asyncio
import base64
import binascii
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Literal

import edge_tts
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("RENDER_DATA_DIR", "/tmp/story-render-jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MAX_TEXT = int(os.getenv("MAX_TEXT_CHARS", "40000"))
MAX_SCENES = int(os.getenv("MAX_SCENES", "60"))
JOBS = {}

VOICES = {
    "hi-IN": {"female": "hi-IN-SwaraNeural", "male": "hi-IN-MadhurNeural"},
    "ur-PK": {"female": "ur-PK-UzmaNeural", "male": "ur-PK-AsadNeural"},
}

app = FastAPI(title="SHER AI PRO Story Render API", version="1.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class Scene(BaseModel):
    narration: str = Field(min_length=1, max_length=3000)
    image: str = Field(min_length=1, max_length=22_000_000)


class RenderRequest(BaseModel):
    text: str = Field(min_length=3, max_length=MAX_TEXT)
    scenes: list[Scene] = Field(min_length=1, max_length=MAX_SCENES)
    language: Literal["hi-IN", "ur-PK"] = "hi-IN"
    gender: Literal["female", "male"] = "female"
    rate: int = Field(default=0, ge=-30, le=30)
    aspect: Literal["landscape", "shorts"] = "landscape"
    audio_segments: list[str] | None = Field(default=None, max_length=20)


def run_ffmpeg(args):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                            capture_output=True, text=True, timeout=1800)
    if result.returncode:
        raise RuntimeError((result.stderr or "FFmpeg failed")[-2500:])


async def download_image(client, url, target):
    if url.startswith("data:image/"):
        try:
            header, encoded = url.split(",", 1)
            mime = header[5:].split(";", 1)[0].lower()
            if mime not in {"image/png", "image/jpeg", "image/webp"} or ";base64" not in header:
                raise ValueError("Unsupported image data URL.")
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Invalid Base64 scene image.") from exc
        if not raw or len(raw) > 15 * 1024 * 1024:
            raise ValueError("Scene image is empty or larger than 15 MB.")
        target.write_bytes(raw)
        return
    if not url.startswith("https://"):
        raise ValueError("Scene images must use HTTPS URLs or supported image data URLs.")
    response = await client.get(url, follow_redirects=True, timeout=45)
    response.raise_for_status()
    if len(response.content) > 15 * 1024 * 1024:
        raise ValueError("Scene image is larger than 15 MB.")
    if not response.headers.get("content-type", "").startswith("image/"):
        raise ValueError("Scene URL did not return an image.")
    target.write_bytes(response.content)


async def render_job(job_id, payload):
    work = DATA_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    JOBS[job_id].update(status="processing", progress=2, message="آواز تیار ہو رہی ہے")
    try:
        audio_path = work / "narration.mp3"
        if payload.audio_segments:
            audio_files = []
            total_audio_bytes = 0
            for index, encoded_audio in enumerate(payload.audio_segments):
                try:
                    audio_bytes = base64.b64decode(encoded_audio, validate=True)
                except (ValueError, binascii.Error) as exc:
                    raise ValueError("Invalid Base64 audio segment.") from exc
                total_audio_bytes += len(audio_bytes)
                if not audio_bytes or len(audio_bytes) > 8 * 1024 * 1024 or total_audio_bytes > 60 * 1024 * 1024:
                    raise ValueError("Audio upload exceeds the permitted size.")
                chunk_path = work / f"audio_{index:03d}.mp3"
                chunk_path.write_bytes(audio_bytes)
                audio_files.append(chunk_path)
            audio_list = work / "audio-list.txt"
            with audio_list.open("w", encoding="utf-8") as fp:
                for chunk_path in audio_files:
                    fp.write("file '" + str(chunk_path) + "'\n")
            run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(audio_list),
                        "-vn", "-c:a", "libmp3lame", "-q:a", "3", str(audio_path)])
        else:
            voice = VOICES[payload.language][payload.gender]
            communicate = edge_tts.Communicate(payload.text, voice, rate=f"{payload.rate:+d}%")
            await communicate.save(str(audio_path))
        if not audio_path.exists() or audio_path.stat().st_size < 1000:
            raise RuntimeError("Text-to-speech did not produce a usable audio file.")

        JOBS[job_id].update(progress=12, message="مناظر کی تصاویر حاصل ہو رہی ہیں")
        image_paths = []
        async with httpx.AsyncClient() as client:
            for i, scene in enumerate(payload.scenes):
                path = work / f"scene_{i:03d}.jpg"
                await download_image(client, scene.image, path)
                image_paths.append(path)
                JOBS[job_id].update(progress=12 + int(38 * (i + 1) / len(payload.scenes)),
                                    message=f"منظر {i + 1} / {len(payload.scenes)} تیار")

        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
                               capture_output=True, text=True, timeout=30)
        if probe.returncode:
            raise RuntimeError("Could not read narration duration.")
        total_duration = max(1.0, float(probe.stdout.strip()))
        weights = [max(1, len(s.narration)) for s in payload.scenes]
        weight_sum = sum(weights)
        concat = work / "scenes.txt"
        with concat.open("w", encoding="utf-8") as fp:
            for path, weight in zip(image_paths, weights):
                safe = str(path).replace("'", "'\\''")
                duration = total_duration * weight / weight_sum
                fp.write(f"file '{safe}'\nduration {duration:.4f}\n")
            safe = str(image_paths[-1]).replace("'", "'\\''")
            fp.write(f"file '{safe}'\n")

        width, height = (720, 1280) if payload.aspect == "shorts" else (1280, 720)
        video_path = work / "story-video.mp4"
        JOBS[job_id].update(progress=55, message="FFmpeg MP4 رینڈرنگ جاری ہے")
        vf = (f"scale={width}:{height}:force_original_aspect_ratio=increase,"
              f"crop={width}:{height},setsar=1,fps=25,format=yuv420p")
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat),
                    "-i", str(audio_path), "-vf", vf, "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
                    str(video_path)])
        if not video_path.exists() or video_path.stat().st_size < 10000:
            raise RuntimeError("MP4 output is missing or unexpectedly small.")

        thumb_path = work / "thumbnail.jpg"
        run_ffmpeg(["-ss", "1", "-i", str(video_path), "-frames:v", "1",
                    "-q:v", "2", str(thumb_path)])
        if not thumb_path.exists() or thumb_path.stat().st_size < 1000:
            raise RuntimeError("Thumbnail generation failed.")

        JOBS[job_id].update(status="completed", progress=100, message="MP4 اور تھمب نیل تیار ہیں",
                             video=f"/api/jobs/{job_id}/video",
                             thumbnail=f"/api/jobs/{job_id}/thumbnail",
                             video_size=video_path.stat().st_size,
                             thumbnail_size=thumb_path.stat().st_size)
    except Exception as exc:
        JOBS[job_id].update(status="failed", message=str(exc)[:1000])


@app.get("/health")
async def health():
    return {"ok": True, "service": "sher-story-render", "ffmpeg": shutil.which("ffmpeg") is not None,
            "ffprobe": shutil.which("ffprobe") is not None}


@app.post("/api/render", status_code=202)
async def create_render(payload: RenderRequest):
    if len(payload.scenes) > MAX_SCENES:
        raise HTTPException(413, f"زیادہ سے زیادہ {MAX_SCENES} مناظر کی اجازت ہے۔")
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "queued", "progress": 0, "message": "کام قطار میں شامل ہے"}
    asyncio.create_task(render_job(job_id, payload))
    return {"job_id": job_id, "status_url": f"/api/jobs/{job_id}"}


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "یہ رینڈر جاب موجود نہیں یا سرور ری اسٹارٹ ہوا ہے۔")
    return {"job_id": job_id, **job}


def job_file(job_id, filename):
    path = DATA_DIR / job_id / filename
    if not path.is_file():
        raise HTTPException(404, "فائل ابھی دستیاب نہیں۔")
    return path


@app.get("/api/jobs/{job_id}/video")
async def download_video(job_id: str):
    return FileResponse(job_file(job_id, "story-video.mp4"), media_type="video/mp4",
                        filename="SHER-AI-Story.mp4")


@app.get("/api/jobs/{job_id}/thumbnail")
async def download_thumbnail(job_id: str):
    return FileResponse(job_file(job_id, "thumbnail.jpg"), media_type="image/jpeg",
                        filename="SHER-AI-Thumbnail.jpg")
