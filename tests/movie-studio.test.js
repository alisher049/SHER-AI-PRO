import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "../src/movieStudioUtils.js";

const sample = {
  title: "آزمائشی فلم",
  characterBible: "علی: عمر 30، سیاہ بال، نیلا لباس، دھیمی آواز",
  continuityRules: ["کردار کا لباس بلاوجہ تبدیل نہ ہو"],
  parts: [1,2,3,4].map(n => ({
    title: "حصہ " + n,
    scenes: [{ title: "منظر " + n, narration: "مکالمہ " + n, subtitle: "سب ٹائٹل " + n,
      visual: "بارش", characterContinuity: "وہی کردار", movement: "آہستہ چلتا ہے",
      location: "گھر", sound: "بارش کی آواز" }]
  }))
};

test("duration choices are the five advertised options", () => assert.deepEqual(MOVIE_DURATIONS, [15, 30, 60, 90, 150]));

test("parser accepts plain and fenced JSON and enforces four equal parts", () => {
  assert.equal(parseStoryboardResponse(JSON.stringify(sample), 60).parts.length, 4);
  assert.equal(parseStoryboardResponse("```json\n" + JSON.stringify(sample) + "\n```", 60).scenes.length, 4);
  assert.equal(parseStoryboardResponse(JSON.stringify(sample), 60).parts[0].duration_minutes, 15);
});

test("parser rejects missing or empty parts", () => {
  assert.throws(() => parseStoryboardResponse('{"parts":[]}', 60), /چاروں برابر حصے/);
  const invalid = { ...sample, parts: sample.parts.map((part, i) => i === 2 ? { ...part, scenes: [] } : part) };
  assert.throws(() => parseStoryboardResponse(JSON.stringify(invalid), 60), /خالی ہے/);
});

test("parser retains character bible and continuity fields", () => {
  const parsed = parseStoryboardResponse(JSON.stringify(sample), 30);
  assert.match(parsed.characterBible, /علی/);
  assert.equal(parsed.continuityRules.length, 1);
  assert.equal(parsed.scenes[0].characterContinuity, "وہی کردار");
  assert.equal(parsed.scenes[0].movement, "آہستہ چلتا ہے");
});

test("both exports preserve four parts, details and honest MP4 notice", () => {
  const parsed = parseStoryboardResponse(JSON.stringify(sample), 60);
  const text = buildScriptText(parsed.title, 60, parsed.parts, parsed.scenes, parsed.characterBible, parsed.continuityRules);
  assert.match(text, /ہر حصہ 15 منٹ/);
  assert.match(text, /کرداروں کا مستقل ریکارڈ/);
  assert.match(text, /MP4 ویڈیو نہیں/);
  const json = JSON.parse(buildStoryboardJson(parsed.title, 60, parsed.parts, parsed.scenes, parsed.characterBible, parsed.continuityRules));
  assert.equal(json.part_count, 4);
  assert.equal(json.part_duration_minutes, 15);
  assert.equal(json.scenes.length, 4);
  assert.match(json.characterBible, /علی/);
});

test("screen source exposes four stages and existing AI endpoint", async () => {
  const source = await readFile(new URL("../src/MovieStudio.jsx", import.meta.url), "utf8");
  for (const phrase of ["کہانی پیسٹ کریں", "دورانیہ منتخب کریں", "فلم کا خاکہ تیار کریں", "فائل حاصل کریں"]) assert.ok(source.includes(phrase));
  assert.ok(source.includes('fetch("/api/chat"'));
});
