# SHER AI PRO Story Render API

This service creates narration with Microsoft Edge TTS voices and renders an H.264/AAC MP4 plus JPEG thumbnail using FFmpeg.

## Deploy on Render
1. Push this repository branch, `story-video-studio`, to GitHub.
2. In Render choose **New + → Blueprint** and connect this repository.
3. Select branch `story-video-studio`; Render reads `render.yaml` and builds the Docker service.
4. Wait until the service is **Live**. Open `https://YOUR-SERVICE.onrender.com/health`; expect JSON with `"ok":true` and `"ffmpeg":true`.
5. In the Vercel project serving the app, add environment variable `VITE_RENDER_API_URL` with the base URL, e.g. `https://sher-ai-story-render.onrender.com` (no trailing slash), then redeploy the same branch.

## API
- `GET /health`
- `POST /api/render` JSON: `{ "text":"...", "scenes":[{"narration":"...","image":"https://..."}], "language":"hi-IN|ur-PK", "gender":"female|male", "rate":0, "aspect":"landscape|shorts" }`
- Poll `GET /api/jobs/{job_id}` until `status=completed`.
- Download `GET /api/jobs/{job_id}/video` and `GET /api/jobs/{job_id}/thumbnail`.

## Important free-plan limits
Render free services may sleep when idle, have limited CPU/RAM and ephemeral storage. Jobs are kept in process memory and files in `/tmp`; a service restart or sleep can interrupt a render and old downloads are not permanent. Long scripts and many scenes can exceed free compute/time limits. Edge TTS requires outbound internet and is an external service; voice availability and usage are not guaranteed by this project.
