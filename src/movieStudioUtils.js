export const MOVIE_DURATIONS = [15, 30, 60, 90, 150];

export function parseStoryboardResponse(value, durationMinutes = 15) {
  const raw = String(value ?? "").replace(/^\\uFEFF/, "").replace(/^\x60{3}(?:json)?/i, "").replace(/\x60{3}$/, "").trim();
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.parts) || parsed.parts.length !== 4) {
    throw new Error("فلم کے چاروں برابر حصے درست طور پر موصول نہیں ہوئے");
  }
  const partMinutes = durationMinutes / 4;
  const parts = parsed.parts.map((part, index) => {
    if (!Array.isArray(part.scenes) || part.scenes.length === 0) {
      throw new Error("فلم کا حصہ " + (index + 1) + " خالی ہے");
    }
    return {
      number: index + 1,
      title: String(part.title || "حصہ " + (index + 1)),
      duration_minutes: partMinutes,
      scenes: part.scenes.map((scene, sceneIndex) => ({
        title: String(scene?.title || "منظر " + (sceneIndex + 1)),
        narration: String(scene?.narration || ""),
        subtitle: String(scene?.subtitle || scene?.narration || ""),
        visual: String(scene?.visual || ""),
        characterContinuity: String(scene?.characterContinuity || ""),
        movement: String(scene?.movement || ""),
        location: String(scene?.location || ""),
        sound: String(scene?.sound || ""),
      })),
    };
  });
  const scenes = parts.flatMap(part => part.scenes.map(scene => ({ ...scene, part: part.number })));
  if (!scenes.length || scenes.length > 120) throw new Error("مناظر کی تعداد درست نہیں");
  return { title: String(parsed.title || "میری کہانی"), duration_minutes: durationMinutes, parts, scenes,
    characterBible: String(parsed.characterBible || ""), continuityRules: Array.isArray(parsed.continuityRules) ? parsed.continuityRules.map(String) : [] };
}

export function buildScriptText(title, minutes, parts, scenes, characterBible = "", continuityRules = []) {
  return [title, "کل دورانیہ: " + minutes + " منٹ", "چار برابر حصے: ہر حصہ " + (minutes / 4) + " منٹ",
    "نوٹ: یہ تحریری اسکرپٹ اور اسٹوری بورڈ ہے، MP4 ویڈیو نہیں۔", "", "کرداروں کا مستقل ریکارڈ:", characterBible,
    "", "تسلسل کے اصول:", ...continuityRules, "",
    ...parts.flatMap(part => ["حصہ " + part.number + ": " + part.title + " (" + part.duration_minutes + " منٹ)",
      ...part.scenes.flatMap((scene, index) => ["منظر " + (index + 1) + ": " + scene.title,
        "آواز/مکالمہ: " + scene.narration, "سب ٹائٹل: " + scene.subtitle,
        "منظر کی تفصیل: " + scene.visual, "کردار کا تسلسل: " + scene.characterContinuity,
        "حرکت: " + scene.movement, "مقام: " + scene.location, "آواز: " + scene.sound, ""]), ""])
  ].join("\n");
}

export function buildStoryboardJson(title, minutes, parts, scenes, characterBible = "", continuityRules = []) {
  return JSON.stringify({ title, duration_minutes: minutes, part_count: 4, part_duration_minutes: minutes / 4,
    characterBible, continuityRules, parts, scenes, notice: "تحریری اسکرپٹ/اسٹوری بورڈ؛ MP4 ویڈیو نہیں۔" }, null, 2);
}
