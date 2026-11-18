async function isOwner(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ") || !process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(process.env.VITE_SUPABASE_URL.replace(/\/$/, "") + "/auth/v1/user", {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: header },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    const user = await response.json();
    return user.email?.toLowerCase() === "alishermeo049@gmail.com";
  } catch { return false; }
}

function collectAudio(payload) {
  if (typeof payload?.output_audio?.data === "string") return payload.output_audio.data;
  const chunks = [];
  for (const step of payload?.steps || []) {
    for (const part of step?.content || []) {
      if (part?.type === "audio" && typeof part.data === "string") chunks.push(part.data);
    }
  }
  return chunks.join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await isOwner(req))) return res.status(403).json({ error: "Owner sign-in is required." });
  const text = String(req.body?.text || "").trim();
  const language = String(req.body?.language || "Urdu").slice(0, 30);
  const voice = String(req.body?.voice || "Kore");
  if (!text) return res.status(400).json({ error: "Narration text is required." });
  if (text.length > 3200) return res.status(413).json({ error: "Split narration into shorter scene-sized sections (maximum 3,200 characters)." });
  const voices = new Set(["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"]);
  const selectedVoice = voices.has(voice) ? voice : "Kore";
  const keys = [...new Set([process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_BACKUP].filter(Boolean))];
  if (!keys.length) return res.status(503).json({ error: "The existing Gemini API key is not configured." });
  const body = {
    model: "gemini-3.1-flash-tts-preview",
    input: [{
      type: "user_input",
      content: [{
        type: "text",
        text: "Read this narration aloud in natural " + language + ". Preserve the exact wording. Use expressive, clear storytelling delivery, with natural pauses. Narration:\\n" + text
      }]
    }],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24000 },
    generation_config: { speech_config: [{ voice: selectedVoice }] }
  };
  let lastError = "Speech generation failed.";
  for (const key of keys) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = payload.error?.message || "Gemini speech request failed (" + response.status + ").";
        if (response.status === 429 || response.status >= 500) continue;
        return res.status(response.status).json({ error: lastError });
      }
      const audio = collectAudio(payload);
      if (!audio) {
        lastError = "Gemini returned no audio data. Please retry this scene.";
        continue;
      }
      return res.status(200).json({ audio, mimeType: "audio/l16", sampleRate: 24000, channels: 1, voice: selectedVoice, model: "gemini-3.1-flash-tts-preview" });
    } catch (error) {
      lastError = error.name === "TimeoutError" ? "Speech generation timed out. Please retry." : (error.message || lastError);
    }
  }
  return res.status(502).json({ error: lastError });
}
