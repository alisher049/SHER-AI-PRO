import asyncio
import base64
import binascii
import os
import shutil
import subprocess
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
MAX_SCENES = int(os.getenv("MAX_SCENES", "30"))
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(60 * 1024 * 1024)))
MAX_MEDIA_BYTES = int(os.getenv("MAX_MEDIA_BYTES", str(30 * 1024 * 1024)))
JOBS = {}

VOICES = {
    "hi-IN": {"female": "hi-IN-SwaraNeural", "male": "hi-IN-MadhurNeural"},
    "ur-PK": {"female": "ur-PK-UzmaNeural", "male": "ur-PK-AsadNeural"},
    "pa-IN": {"female": "pa-IN-VaaniNeural", "male": "pa-IN-OjasNeural"},
    "en-US": {"female": "en-US-JennyNeural", "male": "en-US-GuyNeural"},
}

app = FastAPI(title="SHER AI PRO Story Render API", version="2.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])


class ViralScene(BaseModel):
    narration: str = Field(min_length=1, max_length=5000)
    media_url: str = Field(min_length=1, max_length=22_000_000)
    is_video: bool = False
    effect: Literal["punch_zoom", "shake", "zoom_out"] = "punch_zoom"
    meme_overlay_url: str | None = None
    meme_text: str = Field(default="", max_length=100)
    sfx_type: Literal["none", "laugh", "whoosh", "pop", "boom"] = "none"
    subtitle_chunk: str = Field(default="", max_length=500)
    duration_sec: float = Field(default=3.0, ge=2.5, le=4.0)


class RenderRequest(BaseModel):
    text: str = Field(min_length=3, max_length=MAX_TEXT)
    scenes: list[ViralScene] = Field(min_length=1, max_length=MAX_SCENES)
    language: Literal["hi-IN", "ur-PK", "pa-IN", "en-US"] = "hi-IN"
    gender: Literal["female", "male"] = "female"
    rate: int = Field(default=0, ge=-30, le=30)
    aspect: Literal["landscape", "shorts"] = "landscape"
    audio_segments: list[str] | None = Field(default=None, max_length=20)


def run_ffmpeg(args, timeout=1800):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                            capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError((result.stderr or "FFmpeg failed")[-2500:])


def escape_drawtext(value: str) -> str:
    return (value.replace("\\", r"\\").replace("'", r"\\'")
            .replace(":", r"\\:").replace("%", r"\\%").replace(",", r"\\,")
            .replace("[", r"\\[").replace("]", r"\\]").replace("\n", " ")[:500])


async def download_media(source: str, target: Path, allowed_prefixes):
    if source.startswith("data:"):
        try:
            header, encoded = source.split(",", 1)
            mime = header[5:].split(";", 1)[0].lower()
            if mime not in allowed_prefixes or ";base64" not in header:
                raise ValueError("Unsupported media data URL.")
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Invalid Base64 media data.") from exc
        if not raw or len(raw) > MAX_MEDIA_BYTES:
            raise ValueError("Media is empty or exceeds the upload limit.")
        target.write_bytes(raw)
        return
    if not source.startswith("https://"):
        raise ValueError("Media URLs must use HTTPS or supported Base64 data URLs.")
    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        async with client.stream("GET", source) as response:
            response.raise_for_status()
            mime = response.headers.get("content-type", "").split(";", 1)[0].lower()
            if mime not in allowed_prefixes:
                raise ValueError(f"Unsupported media content type: {mime or 'unknown'}")
            size = 0
            with target.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_MEDIA_BYTES:
                        raise ValueError("Media exceeds the upload limit.")
                    output.write(chunk)


async def download_scene_media(scene: ViralScene, target: Path):
    allowed = {"video/mp4", "video/webm", "video/quicktime"} if scene.is_video else {
        "image/png", "image/jpeg", "image/webp"}
    await download_media(scene.media_url, target, allowed)


def build_viral_filter(width: int, height: int, effect: str = "punch_zoom",
                       subtitle_text: str = "", meme_text: str = "") -> str:
    # d=1 is deliberate: zoompan emits one frame per input frame, preserving clip duration.
    base = (f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
            f"crop={width * 2}:{height * 2},setsar=1")
    if effect == "shake":
        motion = (f"zoompan=z='1.10':x='iw/2-(iw/zoom/2)+sin(on*1.5)*10':"
                  f"y='ih/2-(ih/zoom/2)+cos(on*1.7)*8':d=1:s={width}x{height}:fps=30")
    elif effect == "zoom_out":
        motion = (f"zoompan=z='max(1.0,1.18-0.0015*on)':x='iw/2-(iw/zoom/2)':"
                  f"y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps=30")
    else:
        motion = (f"zoompan=z='min(1.0+0.0018*on,1.22)':x='iw/2-(iw/zoom/2)':"
                  f"y='ih/2-(ih/zoom/2)':d=1:s={width}x{height}:fps=30")
    filters = [base, motion, "eq=contrast=1.07:saturation=1.15", "format=yuv420p"]
    if subtitle_text:
        text = escape_drawtext(subtitle_text)
        filters.insert(-1, f"drawtext=text='{text}':fontcolor=white:bordercolor=black:borderw=3:"
                            f"fontsize={max(22, int(width * 0.045))}:x=(w-text_w)/2:y=h*0.78")
    if meme_text:
        text = escape_drawtext(meme_text)
        filters.insert(-1, f"drawtext=text='{text}':fontcolor=yellow:bordercolor=black:borderw=5:"
                            f"box=1:boxcolor=black@0.58:boxborderw=12:fontsize={max(26, int(width * 0.055))}:"
                            f"x=(w-text_w)/2:y=h*0.12")
    return ",".join(filters)


async def prepare_scene_clip(source: str, is_video: bool, target_mp4: Path, width: int,
                             height: int, duration: float, effect: str, subtitle: str,
                             meme_text: str = "", meme_overlay_url: str | None = None):
    raw_file = target_mp4.with_suffix(".raw.mp4" if is_video else ".raw.img")
    scene = ViralScene(narration="scene", media_url=source, is_video=is_video, effect=effect,
                       subtitle_chunk=subtitle, duration_sec=duration,
                       meme_text=meme_text, meme_overlay_url=meme_overlay_url)
    await download_scene_media(scene, raw_file)
    vf = build_viral_filter(width, height, effect, subtitle, meme_text)
    if is_video:
        run_ffmpeg(["-i", str(raw_file), "-t", str(duration), "-vf",
                    f"scale={width * 2}:{height * 2}:force_original_aspect_ratio=increase,"
                    f"crop={width * 2}:{height * 2},setsar=1,fps=30,"
                    f"eq=contrast=1.07:saturation=1.15" +
                    (f",drawtext=text='{escape_drawtext(subtitle)}':fontcolor=white:bordercolor=black:borderw=3:"
                     f"fontsize={max(22, int(width * 0.045))}:x=(w-text_w)/2:y=h*0.78" if subtitle else "") +
                    (f",drawtext=text='{escape_drawtext(meme_text)}':fontcolor=yellow:bordercolor=black:borderw=5:"
                     f"box=1:boxcolor=black@0.58:boxborderw=12:fontsize={max(26, int(width * 0.055))}:"
                     f"x=(w-text_w)/2:y=h*0.12" if meme_text else "") +
                    ",format=yuv420p", "-an", "-r", "30", "-c:v", "libx264",
                    "-preset", "veryfast", "-crf", "23", "-movflags", "+faststart", str(target_mp4)])
    else:
        run_ffmpeg(["-loop", "1", "-framerate", "30", "-t", str(duration), "-i", str(raw_file),
                    "-vf", vf, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target_mp4)])
    if meme_overlay_url:
        overlay = target_mp4.with_suffix(".meme.png")
        await download_media(meme_overlay_url, overlay, {"image/png", "image/jpeg", "image/webp"})
        overlaid = target_mp4.with_suffix(".overlay.mp4")
        run_ffmpeg(["-i", str(target_mp4), "-i", str(overlay), "-filter_complex",
                    f"[1:v]scale={int(width * 0.28)}:-1[ov];[0:v][ov]overlay=W-w-24:H-h-24:enable='between(t,0,{duration})'",
                    "-t", str(duration), "-an", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "23", "-pix_fmt", "yuv420p", str(overlaid)])
        overlaid.replace(target_mp4)


def make_sfx(path: Path, kind: str):
    if kind == "none":
        return
    specs = {
        "laugh": ("sine=frequency=520:duration=0.34", "volume=0.16,tremolo=f=9:d=0.8"),
        "whoosh": ("anoisesrc=color=white:duration=0.45", "highpass=f=500,lowpass=f=5000,afade=t=in:d=0.04,afade=t=out:st=0.18:d=0.27,volume=0.22"),
        "pop": ("sine=frequency=850:duration=0.16", "afade=t=out:st=0.04:d=0.12,volume=0.22"),
        "boom": ("sine=frequency=95:duration=0.48", "lowpass=f=180,afade=t=out:st=0.12:d=0.36,volume=0.28"),
    }
    source, filters = specs[kind]
    run_ffmpeg(["-f", "lavfi", "-i", source, "-af", filters, "-ar", "44100",
                "-ac", "2", "-c:a", "libmp3lame", "-q:a", "6", str(path)])


async def render_job(job_id, payload):
    work = DATA_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    JOBS[job_id].update(status="processing", progress=2, message="آواز تیار ہو رہی ہے")
    try:
        audio_path = work / "narration.mp3"
        if payload.audio_segments:
            audio_files, total_audio_bytes = [], 0
            for index, encoded in enumerate(payload.audio_segments):
                try:
                    audio_bytes = base64.b64decode(encoded, validate=True)
                except (ValueError, binascii.Error) as exc:
                    raise ValueError("Invalid Base64 audio segment.") from exc
                total_audio_bytes += len(audio_bytes)
                if not audio_bytes or total_audio_bytes > MAX_AUDIO_BYTES:
                    raise ValueError("Audio upload exceeds the permitted size.")
                chunk_path = work / f"audio_{index:03d}.mp3"
                chunk_path.write_bytes(audio_bytes)
                audio_files.append(chunk_path)
            audio_list = work / "audio-list.txt"
            with audio_list.open("w", encoding="utf-8") as handle:
                for chunk in audio_files:
                    handle.write(f"file '{chunk.as_posix()}'\n")
            run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(audio_list), "-vn",
                        "-c:a", "libmp3lame", "-q:a", "3", str(audio_path)])
        else:
            speech = edge_tts.Communicate(payload.text, VOICES[payload.language][payload.gender],
                                          rate=f"{payload.rate:+d}%")
            await speech.save(str(audio_path))
        if not audio_path.exists() or audio_path.stat().st_size < 1000:
            raise RuntimeError("Text-to-speech did not produce a usable audio file.")

        width, height = (720, 1280) if payload.aspect == "shorts" else (1280, 720)
        clips, sfx_entries, cursor = [], [], 0.0
        for index, scene in enumerate(payload.scenes):
            clip = work / f"scene_{index:03d}.mp4"
            await prepare_scene_clip(scene.media_url, scene.is_video, clip, width, height,
                                     scene.duration_sec, scene.effect, scene.subtitle_chunk,
                                     scene.meme_text, scene.meme_overlay_url)
            clips.append(clip)
            if scene.sfx_type != "none":
                sfx = work / f"sfx_{index:03d}.mp3"
                make_sfx(sfx, scene.sfx_type)
                sfx_entries.append((sfx, int(cursor * 1000)))
            cursor += scene.duration_sec
            JOBS[job_id].update(progress=12 + int(55 * (index + 1) / len(payload.scenes)),
                                message=f"وائرل منظر {index + 1} / {len(payload.scenes)} تیار")

        concat = work / "clips.txt"
        with concat.open("w", encoding="utf-8") as handle:
            for clip in clips:
                handle.write(f"file '{clip.as_posix()}'\n")
        silent_video = work / "silent-story.mp4"
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(concat), "-an", "-c:v", "copy",
                    "-movflags", "+faststart", str(silent_video)])

        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=noprint_wrappers=1:nokey=1", str(silent_video)],
                               capture_output=True, text=True, timeout=30)
        if probe.returncode:
            raise RuntimeError("Could not read rendered video duration.")
        video_duration = max(1.0, float(probe.stdout.strip()))
        audio_inputs = ["-i", str(audio_path)]
        filters, mix_labels = [], ["[0:a]"]
        for idx, (sfx, delay) in enumerate(sfx_entries, start=1):
            audio_inputs += ["-i", str(sfx)]
            label = f"s{idx}"
            filters.append(f"[{idx}:a]adelay={delay}|{delay},volume=0.75[{label}]")
            mix_labels.append(f"[{label}]")
        audio_mix = ""
        if len(mix_labels) > 1:
            filters.append("".join(mix_labels) + f"amix=inputs={len(mix_labels)}:duration=first:dropout_transition=2[aout]")
            audio_mix = ";".join(filters)
        video_path = work / "story-video.mp4"
        JOBS[job_id].update(progress=78, message="آواز، SFX اور ویڈیو مکس ہو رہے ہیں")
        args = ["-i", str(silent_video), *audio_inputs]
        if audio_mix:
            args += ["-filter_complex", audio_mix, "-map", "0:v:0", "-map", "[aout]"]
        else:
            args += ["-map", "0:v:0", "-map", "1:a:0"]
        args += ["-t", str(video_duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
                 "-shortest", "-movflags", "+faststart", str(video_path)]
        run_ffmpeg(args)
        if not video_path.exists() or video_path.stat().st_size < 10000:
            raise RuntimeError("MP4 output is missing or unexpectedly small.")
        thumb_path = work / "thumbnail.jpg"
        run_ffmpeg(["-ss", "0.5", "-i", str(video_path), "-frames:v", "1", "-q:v", "2", str(thumb_path)])
        if not thumb_path.exists() or thumb_path.stat().st_size < 1000:
            raise RuntimeError("Thumbnail generation failed.")
        JOBS[job_id].update(status="completed", progress=100, message="وائرل MP4 اور تھمب نیل تیار ہیں",
                            video=f"/api/jobs/{job_id}/video", thumbnail=f"/api/jobs/{job_id}/thumbnail",
                            video_size=video_path.stat().st_size, thumbnail_size=thumb_path.stat().st_size)
    except Exception as exc:
        JOBS[job_id].update(status="failed", progress=100, message=str(exc)[:1000])


@app.get("/health")
async def health():
    return {"ok": True, "service": "sher-story-render", "ffmpeg": shutil.which("ffmpeg") is not None,
            "ffprobe": shutil.which("ffprobe") is not None, "languages": sorted(VOICES.keys()),
            "viral_scene_engine": True}


@app.post("/api/render", status_code=202)
async def create_render(payload: RenderRequest):
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
