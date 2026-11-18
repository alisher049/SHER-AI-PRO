export function detectLanguage(text) {
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(text)) {
    const punjabiWords = /میں نوں|تینوں|ساڈا|ساڈی|تہاڈا|ویکھ|کِتھے|اِتھے|نئیں|ہوندا|پیا|وچ/;
    return punjabiWords.test(text) ? "pa-IN" : "ur-PK";
  }
  return "en-US";
}

export function splitIntoChapters(text, maxWords = 220) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chapters = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chapters.push(words.slice(i, i + maxWords).join(" "));
  }
  return chapters;
}

export function makeScenes(chapter, chapterIndex, mode, visualStyle) {
  const words = String(chapter || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const count = Math.min(30, Math.max(1, Math.ceil(words.length / 8)));
  const size = Math.ceil(words.length / count);
  const groups = [];
  for (let i = 0; i < words.length; i += size) {
    groups.push(words.slice(i, i + size).join(" "));
  }
  const width = mode === "9:16" ? 720 : 1280;
  const height = mode === "9:16" ? 1280 : 720;
  const stylePrompt = visualStyle === "baby"
    ? "cute baby viral comedy, wholesome expressive toddler, bright playful cinematic scene"
    : visualStyle === "cartoon"
      ? "high quality 3D animated cartoon movie frame, expressive recurring characters, consistent faces, hairstyles and clothing, cinematic lighting"
      : "desi comedy, realistic cinematic film still, expressive South Asian faces, recurring characters with consistent faces, hairstyles and clothing";
  return groups.map((narration, idx) => ({
    narration,
    media_url: "https://image.pollinations.ai/prompt/" +
      encodeURIComponent(narration.slice(0, 240) + ", " + stylePrompt) +
      "?width=" + width + "&height=" + height + "&seed=" +
      (chapterIndex * 100 + idx + 1) + "&nologo=true",
    is_video: false,
    effect: ["punch_zoom", "shake", "zoom_out"][idx % 3],
    meme_text: /ہنس|مذاق|پاگل|حیران|funny|crazy|wtf/i.test(narration) ? "😂 WAIT FOR IT!" : "",
    sfx_type: /ہنس|مذاق|funny/i.test(narration) ? "laugh" : idx % 4 === 1 ? "whoosh" : "none",
    subtitle_chunk: narration.slice(0, 42),
    duration_sec: Math.min(4, Math.max(2.5, narration.split(/\s+/).length * 0.42))
  }));
}
