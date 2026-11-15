# SHER AI PRO

Bilingual Urdu/English AI workspace built with Vite, React, Supabase Auth, Gemini server API, Pollinations image generation, and Capacitor Android packaging.

## Setup
1. Copy `.env.example` to `.env` and set Supabase URL + anon key.
2. Set `GEMINI_API_KEY` only in Vercel server environment (never in browser).
3. Run `npm install && npm run dev`.
4. GitHub Actions builds a debug APK on push to `main` and via manual dispatch.

See `SETUP.md` for deployment and owner-only authentication setup.
