import asyncio
import base64
import binascii
import os
import shutil
import subprocess
import uuid
import urllib.parse
from pathlib import Path
from typing import Literal

import edge_tts
import httpx
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("RENDER_DATA_DIR", "/tmp/story-render-jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
# Long-form support: each request may carry up to 100k narration characters.
MAX_TEXT_CHARS = max(3, min(int(os.getenv("MAX_TEXT_CHARS", "100000")), 100000))
# Keep per-chapter scene count bounded so FFmpeg jobs remain manageable.
MAX_SCENES = max(1, min(int(os.getenv("MAX_SCENES", "30")), 30))
MAX_AUDIO_BYTES = int(os.getenv("MAX_AUDIO_BYTES", str(60 * 1024 * 1024)))
MAX_MEDIA_BYTES = int(os.getenv("MAX_MEDIA_BYTES", str(30 * 1024 * 1024)))
JOBS = {}

VOICES = {
    "hi-IN": {"female": "hi-IN-SwaraNeural", "male": "hi-IN-MadhurNeural"},
    "ur-PK": {"female": "ur-PK-UzmaNeural", "male": "ur-PK-AsadNeural"},
    "pa-IN": {"female": "pa-IN-VaaniNeural", "male": "pa-IN-OjasNeural"},
    "en-US": {"female": "en-US-JennyNeural", "male": "en-US-GuyNeural"},
}

def detect_story_language(text: str, requested: str | None = None) -> str:
    """Best-effort script/dialect detection for Edge TTS voice selection."""
    if any(chr(0x0A00) <= ch <= chr(0x0A7F) for ch in text):
        return "pa-IN"
    if any(chr(0x0900) <= ch <= chr(0x097F) for ch in text):
        return "hi-IN"
    if any(chr(0x0600) <= ch <= chr(0x06FF) for ch in text):
        # Shahmukhi Punjabi and Urdu share a script; use common Punjabi vocabulary
        # as a heuristic, otherwise default to Urdu rather than guessing.
        punjabi_terms = ("مینوں", "تینوں", "ساڈا", "ساڈی", "تہاڈا", "ویکھ", "کِتھے", "نئیں", "ہوندا", "وچ")
        return "pa-IN" if any(term in text for term in punjabi_terms) else "ur-PK"
    return "en-US"


app = FastAPI(title="SHER AI PRO Story Render API", version="2.0.0")
origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "*").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins or ["*"], allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"],
                   allow_headers=["Content-Type"],
                   expose_headers=["Content-Disposition"])

class ViralScene(BaseModel):
    narration: str = Field(min_length=1, max_length=5000)
    media_url: str = Field(min_length=1, max_length=22_000_000)
    is_video: bool = False
    effect: Literal["punch_zoom", "shake", "zoom_out"] = "punch_zoom"
    meme_overlay_url: str | None = Field(default=None, max_length=7_000_000)
    meme_overlay_is_video: bool = False
    meme_text: str = Field(default="", max_length=100)
    sfx_type: Literal["none", "laugh", "whoosh", "pop", "boom"] = "none"
    subtitle_chunk: str = Field(default="", max_length=500)
    duration_sec: float = Field(default=3.0, ge=2.5, le=4.0)


class RenderRequest(BaseModel):
    text: str = Field(min_length=3, max_length=MAX_TEXT_CHARS)
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
                             meme_text: str = "", meme_overlay_url: str | None = None,
                             meme_overlay_is_video: bool = False):
    raw_file = target_mp4.with_suffix(".raw.mp4" if is_video else ".raw.img")
    scene = ViralScene(narration="scene", media_url=source, is_video=is_video, effect=effect,
                       subtitle_chunk=subtitle, duration_sec=duration,
                       meme_text=meme_text, meme_overlay_url=meme_overlay_url,
                       meme_overlay_is_video=meme_overlay_is_video)
    await download_scene_media(scene, raw_file)
    vf = build_viral_filter(width, height, effect, subtitle, meme_text)
    if is_video:
        # Keep the generated source video moving, apply the same motion treatment,
        # pop-up captions and meme text used by still-image scenes, then trim it
        # to the short-form scene duration (2.5–4 seconds).
        run_ffmpeg(["-i", str(raw_file), "-t", str(duration), "-vf", vf,
                    "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    str(target_mp4)])
    else:
        run_ffmpeg(["-loop", "1", "-framerate", "30", "-t", str(duration), "-i", str(raw_file),
                    "-vf", vf, "-an", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
                    "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target_mp4)])
    if meme_overlay_url:
        overlay = target_mp4.with_suffix(".meme.mp4" if meme_overlay_is_video else ".meme.png")
        allowed = ({"video/mp4", "video/webm", "video/quicktime"} if meme_overlay_is_video
                   else {"image/png", "image/jpeg", "image/webp"})
        await download_media(meme_overlay_url, overlay, allowed)
        overlaid = target_mp4.with_suffix(".overlay.mp4")
        if meme_overlay_is_video:
            run_ffmpeg(["-i", str(target_mp4), "-stream_loop", "-1", "-i", str(overlay),
                        "-filter_complex",
                        f"[1:v]scale={int(width * 0.30)}:-1,setpts=PTS-STARTPTS[ov];"
                        f"[0:v][ov]overlay=W-w-24:H-h-24:enable='between(t,0,{min(1.6, duration):.2f})'",
                        "-t", str(duration), "-an", "-c:v", "libx264", "-preset", "veryfast",
                        "-crf", "23", "-pix_fmt", "yuv420p", str(overlaid)])
        else:
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

        width, height = (1080, 1920) if payload.aspect == "shorts" else (1920, 1080)
        clips, sfx_entries, cursor = [], [], 0.0
        for index, scene in enumerate(payload.scenes):
            clip = work / f"scene_{index:03d}.mp4"
            await prepare_scene_clip(scene.media_url, scene.is_video, clip, width, height,
                                     scene.duration_sec, scene.effect, scene.subtitle_chunk,
                                     scene.meme_text, scene.meme_overlay_url, scene.meme_overlay_is_video)
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
        filters, mix_labels = [], ["[1:a]"]
        for idx, (sfx, delay) in enumerate(sfx_entries, start=1):
            audio_inputs += ["-i", str(sfx)]
            label = f"s{idx}"
            filters.append(f"[{idx + 1}:a]adelay={delay}|{delay},volume=0.75[{label}]")
            mix_labels.append(f"[{label}]")
        audio_mix = ""
        if len(mix_labels) > 1:
            filters.append("".join(mix_labels) + f"amix=inputs={len(mix_labels)}:duration=first:dropout_transition=2[aout]")
            audio_mix = ";".join(filters)
        audio_probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                      "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
                                     capture_output=True, text=True, timeout=30)
        if audio_probe.returncode:
            raise RuntimeError("Could not read narration audio duration.")
        audio_duration = max(1.0, float(audio_probe.stdout.strip()))
        output_duration = max(video_duration, audio_duration)
        video_path = work / "story-video.mp4"
        JOBS[job_id].update(progress=78, message="آواز، SFX اور ویڈیو مکس ہو رہے ہیں")
        # Loop the montage rather than cutting off narration when a long story
        # contains more narration than the selected short scene clips.
        args = ["-stream_loop", "-1", "-i", str(silent_video), *audio_inputs]
        if audio_mix:
            args += ["-filter_complex", audio_mix, "-map", "0:v:0", "-map", "[aout]"]
        else:
            args += ["-map", "0:v:0", "-map", "1:a:0"]
        args += ["-t", str(output_duration), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
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


@app.get("/")
async def root():
    # Public deployment landing route: useful for confirming the correct Render service is deployed.
    return {"ok": True, "service": "sher-story-render", "health": "/health",
            "api_routes": ["/api/self-test", "/api/render-story", "/api/merge-chapters"]}


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


@app.get("/api/self-test")
async def run_full_self_test():
    report = {"server": "ONLINE", "ffmpeg": bool(shutil.which("ffmpeg")),
              "ffprobe": bool(shutil.which("ffprobe")), "edge_tts": False, "free_image": False}
    try:
        import edge_tts  # noqa: F401
        report["edge_tts"] = True
    except Exception as exc:
        report["edge_tts_error"] = str(exc)[:300]
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            # Probe the actual image-generation endpoint with a tiny test image.
            response = await client.get(
                "https://image.pollinations.ai/prompt/SHER-AI-self-test"
                "?width=64&height=64&seed=1&nologo=true"
            )
            mime = response.headers.get("content-type", "").split(";", 1)[0].lower()
            report["free_image"] = (
                response.status_code == 200
                and mime in {"image/jpeg", "image/png", "image/webp"}
                and len(response.content) > 1000
            )
            report["free_image_status"] = response.status_code
            report["free_image_content_type"] = mime
    except Exception as exc:
        report["free_image_error"] = str(exc)[:300]
    return report


async def fetch_unlimited_free_image(prompt: str, dest: Path, width: int, height: int):
    # Pollinations is a third-party service; availability and free limits may change.
    safe_prompt = urllib.parse.quote(
        f"{prompt}, hyper realistic cinematic, expressive face, detailed film still"
    )
    seed = int.from_bytes(__import__("hashlib").sha256(prompt.encode("utf-8")).digest()[:4], "big") % 999999
    urls = [
        f"https://image.pollinations.ai/prompt/{safe_prompt}?width={width}&height={height}&seed={seed}&nologo=true",
        f"https://image.pollinations.ai/prompt/{safe_prompt}?width=768&height=768&seed={seed + 1}&nologo=true",
    ]
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        for url in urls:
            try:
                response = await client.get(url)
                mime = response.headers.get("content-type", "").split(";", 1)[0].lower()
                if response.status_code == 200 and mime in {"image/jpeg", "image/png", "image/webp"} and len(response.content) > 2000:
                    dest.write_bytes(response.content)
                    return True
            except Exception:
                continue
    run_ffmpeg(["-f", "lavfi", "-i", f"color=c=0x1e293b:s={width}x{height}:d=1",
                "-frames:v", "1", str(dest)])
    return False


def build_viral_vf(width: int, height: int, effect: str, subtitle: str, meme_text: str) -> str:
    # Shared compatibility wrapper for the Part 2 filter builder.
    return build_viral_filter(width, height, effect, subtitle, meme_text)


@app.post("/api/render-story")
async def render_story_compat(payload: dict = Body(...)):
    story_scenes = payload.get("scenes") or []
    if not story_scenes:
        raise HTTPException(422, "کم از کم ایک منظر درکار ہے۔")
    if len(story_scenes) > MAX_SCENES:
        raise HTTPException(422, f"ایک چیپٹر میں زیادہ سے زیادہ {MAX_SCENES} مناظر ہو سکتے ہیں۔")
    aspect_ratio = payload.get("aspect_ratio", "16:9")
    aspect = "shorts" if aspect_ratio == "9:16" else "landscape"
    normalized = []
    for item in story_scenes:
        duration = min(4.0, max(2.5, float(item.get("duration_sec", 3.0))))
        normalized.append(ViralScene(
            narration=str(item.get("narration", " ")).strip() or " ",
            media_url=str(item.get("media_url", "")),
            is_video=bool(item.get("is_video", False)),
            effect=item.get("effect", "punch_zoom"),
            meme_text=str(item.get("meme_text", ""))[:100],
            sfx_type=item.get("sfx_type", "none"),
            subtitle_chunk=str(item.get("subtitle_chunk", ""))[:500],
            duration_sec=duration,
        ))
    text = " ".join(scene.narration for scene in normalized)
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(413, f"چیپٹر کا متن {MAX_TEXT_CHARS} حروف کی حد سے زیادہ ہے۔")
    language = detect_story_language(text, payload.get("language"))
    request_payload = RenderRequest(
        text=text[:MAX_TEXT_CHARS], scenes=normalized, language=language,
        gender="female", rate=0, aspect=aspect
    )
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"status": "processing", "progress": 0, "message": "چیپٹر رینڈر ہو رہا ہے"}
    await render_job(job_id, request_payload)
    job = JOBS[job_id]
    if job.get("status") != "completed":
        raise HTTPException(500, job.get("message", "چیپٹر رینڈرنگ ناکام ہوئی۔"))
    return {"video_url": job["video"], "job_id": job_id}


@app.post("/api/merge-chapters")
async def merge_movie_chapters(chapter_urls: list[str] = Body(..., embed=True)):
    if not chapter_urls or len(chapter_urls) > 100:
        raise HTTPException(422, "چیپٹرز کی تعداد 1 سے 100 کے درمیان ہونی چاہیے۔")
    chapter_files = []
    for url in chapter_urls:
        # Accept only videos created by this render server; never fetch arbitrary URLs.
        match = __import__("re").fullmatch(r"/api/jobs/([a-f0-9]{32})/video", str(url))
        if not match:
            raise HTTPException(400, "غیر معتبر چیپٹر ویڈیو لنک۔")
        chapter = DATA_DIR / match.group(1) / "story-video.mp4"
        if not chapter.is_file():
            raise HTTPException(404, "ایک یا زیادہ چیپٹر ویڈیوز دستیاب نہیں۔")
        chapter_files.append(chapter)

    job_id = uuid.uuid4().hex
    work = DATA_DIR / job_id
    work.mkdir(parents=True, exist_ok=True)
    list_file = work / "chapters.txt"
    with list_file.open("w", encoding="utf-8") as handle:
        for chapter in chapter_files:
            # All paths are generated inside DATA_DIR and validated above.
            handle.write(f"file '{chapter.as_posix()}'\n")
    final_mp4 = work / "story-video.mp4"
    try:
        run_ffmpeg(["-f", "concat", "-safe", "0", "-i", str(list_file),
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
                    str(final_mp4)])
        thumb = work / "thumbnail.jpg"
        run_ffmpeg(["-ss", "0.5", "-i", str(final_mp4), "-frames:v", "1", "-q:v", "2", str(thumb)])
    except Exception as exc:
        raise HTTPException(500, f"چیپٹرز جوڑنے میں ناکامی: {str(exc)[:500]}") from exc
    JOBS[job_id] = {"status": "completed", "progress": 100, "message": "تمام چیپٹرز جوڑ دیے گئے",
                    "video": f"/api/jobs/{job_id}/video", "thumbnail": f"/api/jobs/{job_id}/thumbnail"}
    return {"video_url": JOBS[job_id]["video"], "job_id": job_id}
