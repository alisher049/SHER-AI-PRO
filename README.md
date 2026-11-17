# SHER AI PRO

Bilingual Urdu/English AI workspace built with Vite, React, Supabase Auth, Gemini server API, Pollinations image generation, and Capacitor Android packaging.

## Setup
1. Copy `.env.example` to `.env` and set Supabase URL + anon key.
2. Set `GEMINI_API_KEY` only in Vercel server environment (never in browser).
3. Run `npm install && npm run dev`.
4. GitHub Actions builds a debug APK on push to `main` and via manual dispatch.

See `SETUP.md` for deployment and owner-only authentication setup.

## Story Video Studio (story-video-studio branch)

- Paste a Hindi or Urdu story and generate one illustrated scene per sentence/paragraph.
- Choose YouTube 16:9 or Shorts 9:16 and a visual prompt style.
- For narration in the exported video, upload a prepared MP3/WAV file before exporting. The browser's speech preview is not embedded in the export.
- The browser currently exports WebM with captions and generated still-image scenes. It is not a full 3D character-animation renderer, and AI voice-file generation is not yet built in.
- Generated images require an internet connection. Long exports depend on the phone/browser memory and available storage.
