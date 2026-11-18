import test from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, splitIntoChapters, makeScenes } from "../src/storyVideoUtils.js";

test("detects Urdu, Hindi, Punjabi and English scripts", () => {
  assert.equal(detectLanguage("یہ ایک اردو کہانی ہے"), "ur-PK");
  assert.equal(detectLanguage("यह हिंदी कहानी है"), "hi-IN");
  assert.equal(detectLanguage("ਮੈਂ ਪੰਜਾਬੀ ਬੋਲਦਾ ਹਾਂ"), "pa-IN");
  assert.equal(detectLanguage("This is an English story"), "en-US");
});

test("splits long stories into bounded chapters without losing words", () => {
  const words = Array.from({ length: 501 }, (_, i) => "لفظ" + i);
  const chapters = splitIntoChapters(words.join(" "), 220);
  assert.deepEqual(chapters.map((x) => x.split(/\s+/).length), [220, 220, 61]);
  assert.equal(chapters.join(" ").split(/\s+/).length, words.length);
  assert.deepEqual(splitIntoChapters("   "), []);
});

test("creates up to 30 short visual scenes and preserves narration", () => {
  const words = Array.from({ length: 220 }, (_, i) => "لفظ" + i);
  const scenes = makeScenes(words.join(" "), 2, "9:16", "cartoon");
  assert.ok(scenes.length > 1 && scenes.length <= 30);
  assert.equal(scenes.map((x) => x.narration).join(" ").split(/\s+/).length, words.length);
  assert.ok(scenes.every((x) => x.duration_sec >= 2.5 && x.duration_sec <= 4));
  assert.ok(scenes.every((x) => x.media_url.includes("width=1080&height=1920")));
  assert.ok(scenes.every((x) => x.media_url.includes("image.pollinations.ai")));
  assert.equal(scenes[0].effect, "punch_zoom");
  assert.equal(scenes[1].effect, "shake");
});

test("landscape scenes use 16:9 dimensions and stable per-chapter seeds", () => {
  const a = makeScenes("ایک مختصر منظر", 3, "16:9", "desi");
  const b = makeScenes("ایک مختصر منظر", 3, "16:9", "desi");
  assert.ok(a[0].media_url.includes("width=1920&height=1080"));
  assert.equal(a[0].media_url, b[0].media_url);
});
