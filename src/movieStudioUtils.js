export const MOVIE_DURATIONS = [15, 30, 60, 90, 150];

export function parseStoryboardResponse(value) {
  const raw = String(value ?? "").replace(/^\\uFEFF/, "").replace(/^\x60{3}(?:json)?/i, "").replace(/\x60{3}$/, "").trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) throw new Error("اے آئی سے درست مناظر موصول نہیں ہوئے");
  return {
    title: String(parsed.title || "میری کہانی"),
    scenes: parsed.scenes.slice(0, 60).map((scene, index) => ({
      title: String(scene?.title || "منظر " + (index + 1)),
      narration: String(scene?.narration || ""),
      subtitle: String(scene?.subtitle || scene?.narration || ""),
      visual: String(scene?.visual || ""),
    })),
  };
}

export function buildScriptText(title, minutes, scenes) {
  return [title, "دورانیہ: " + minutes + " منٹ", "نوٹ: یہ تحریری اسکرپٹ اور اسٹوری بورڈ ہے، MP4 ویڈیو نہیں۔", "",
    ...scenes.flatMap((scene, index) => ["منظر " + (index + 1) + ": " + scene.title, "آواز/مکالمہ: " + scene.narration,
      "سب ٹائٹل: " + scene.subtitle, "منظر کی تفصیل: " + scene.visual, ""])
  ].join("\n");
}

export function buildStoryboardJson(title, minutes, scenes) {
  return JSON.stringify({ title, duration_minutes: minutes, scenes, notice: "تحریری اسکرپٹ/اسٹوری بورڈ؛ MP4 ویڈیو نہیں۔" }, null, 2);
}
