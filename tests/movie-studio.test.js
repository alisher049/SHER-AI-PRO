import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "../src/movieStudioUtils.js";

const sample = () => ({ title: "آزمائشی فلم", characterBible: "مرکزی کردار: نیلا کوٹ، سیاہ بال",
  continuityRules: ["لباس ہر منظر میں یکساں رہے"],
  parts: Array.from({ length: 4 }, (_, i) => ({ title: "حصہ " + (i + 1),
    scenes: [{ title: "منظر " + (i + 1), narration: "اصل کہانی کا واقعہ", visual: "وہی کردار" }] })) });

test("duration choices are the five advertised options", () => assert.deepEqual(MOVIE_DURATIONS, [15, 30, 60, 90, 150]));
test("parser enforces four equal-duration parts and retains continuity bible", () => {
  const result = parseStoryboardResponse(JSON.stringify(sample()), 60);
  assert.equal(result.parts.length, 4);
  assert.deepEqual(result.parts.map(x => x.duration_minutes), [15, 15, 15, 15]);
  assert.equal(result.scenes.length, 4);
  assert.match(result.characterBible, /نیلا کوٹ/);
});
test("parser rejects missing or empty parts", () => {
  assert.throws(() => parseStoryboardResponse('{"parts":[]}'), /چاروں برابر حصے/);
  const data = sample(); data.parts[2].scenes = [];
  assert.throws(() => parseStoryboardResponse(JSON.stringify(data)), /حصہ 3 خالی/);
});
test("parser accepts fenced JSON and caps at 120 scenes", () => {
  const data = sample(); data.parts.forEach(p => p.scenes = Array.from({length: 30}, (_,i)=>({title:"S"+i})));
  const result = parseStoryboardResponse("```json\n" + JSON.stringify(data) + "\n```", 15);
  assert.equal(result.scenes.length, 120);
});
test("exports retain all four parts and honest MP4 notice", () => {
  const parsed = parseStoryboardResponse(JSON.stringify(sample()), 30);
  const text = buildScriptText(parsed.title, 30, parsed.parts, parsed.scenes, parsed.characterBible, parsed.continuityRules);
  assert.match(text, /چار برابر حصے/);
  assert.match(text, /لباس ہر منظر میں یکساں رہے/);
  assert.match(text, /MP4 ویڈیو نہیں/);
  const json = JSON.parse(buildStoryboardJson(parsed.title, 30, parsed.parts, parsed.scenes, parsed.characterBible, parsed.continuityRules));
  assert.equal(json.parts.length, 4);
  assert.equal(json.part_duration_minutes, 7.5);
});
test("Movie Studio source keeps four stages and existing AI endpoint", async () => {
  const source = await readFile(new URL("../src/MovieStudio.jsx", import.meta.url), "utf8");
  for (const phrase of ["کہانی پیسٹ کریں", "دورانیہ منتخب کریں", "فلم کا خاکہ تیار کریں", "فائل حاصل کریں"]) assert.ok(source.includes(phrase));
  assert.ok(source.includes('fetch("/api/chat"'));
  assert.ok(source.includes("آپ صارف کی دی ہوئی کہانی کے وفادار فلمی منصوبہ ساز ہیں"));
  assert.ok(source.includes("setParts(parsed.parts)"));
});
