# SHER AI PRO setup

## Environment
- `VITE_SUPABASE_URL`: Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Supabase anon/publishable key. Never use service_role in the browser.
- `GEMINI_API_KEY`: server-only Gemini key in Vercel Project Settings → Environment Variables.

## Supabase owner login
Create the owner account in Supabase Authentication → Users with email `alishermeo049@gmail.com` and a password. Disable public signups in Auth settings if this app is strictly owner-only. Use email/password; this app does not call OTP or magic-link flows. Add the deployed site and localhost to Auth URL configuration. The client checks the signed-in email; production APIs should also verify the Supabase access token and owner email before any privileged operation. Do not expose the service-role key.

## Vercel
Import `alisher049/SHER-AI-PRO`; framework Vite; build `npm run build`; output `dist`. Add the three environment variables above (Gemini key as server-only, not VITE_). Redeploy after changing env vars.

## Android APK
GitHub Actions builds a debug APK on every push to main and on manual dispatch. Open Actions → Android APK → latest successful run → Artifacts → `sher-ai-pro-debug-apk`. Debug APK is for testing/sideloading; a Play Store release needs a separately configured signing keystore.

## Notes / limits
Gemini and Pollinations have changing quotas/rate limits and are not guaranteed unlimited. Browser speech recognition/synthesis depends on device/browser support and network. Generated Studio previews are sandboxed HTML previews; review generated code before using it in production.


## Added features
- PDF/Image Vision: authenticated `/api/vision` endpoint; supports PDF, PNG, JPG and WEBP up to 15 MB. Gemini key remains server-side.
- QR generator: creates downloadable PNG codes in the browser.
- Daily tools: local-only expense tracker (browser storage), unit converter, calculator and notes.

The expense list is stored only in this browser's local storage; clearing browser data removes it. Do not upload sensitive documents unless you are comfortable processing them through Gemini.
