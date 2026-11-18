import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "../src/movieStudioUtils.js";
import { joinPcm16, pcm16ToWav, narrationText, splitNarration } from "../src/movieAudioUtils.js";

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
  assert.ok(source.includes("{parts.map(part=>"));
  assert.ok(source.includes("part.duration_minutes"));
  assert.ok(source.includes("characterBible"));
  assert.ok(source.includes("continuityRules.map"));
  assert.ok(source.includes('fetch("/api/speech"'));
  assert.ok(source.includes("pcm16ToWav"));
  assert.ok(source.includes("تمام مناظر کی اردو آواز تیار کریں"));
  assert.ok(source.includes("مکمل اردو آواز ڈاؤن لوڈ کریں"));
});

test("speech endpoint uses existing owner session and Gemini TTS without a new key", async () => {
  const source = await readFile(new URL("../api/speech.js", import.meta.url), "utf8");
  assert.ok(source.includes('process.env.GEMINI_API_KEY'));
  assert.ok(source.includes('process.env.VITE_SUPABASE_URL'));
  assert.ok(source.includes('alishermeo049@gmail.com'));
  assert.ok(source.includes('gemini-3.1-flash-tts-preview'));
  assert.ok(source.includes('response_format: { type: "audio"'));
  assert.ok(source.includes('maximum 3,200 characters'));
  assert.ok(source.includes('collectAudio(payload)'));
});

test("audio utilities join PCM narration and create a valid WAV header", async () => {
  const joined = joinPcm16([new Uint8Array([1, 0, 2, 0]), new Uint8Array([3, 0])], 0);
  assert.deepEqual([...joined], [1, 0, 2, 0, 3, 0]);
  const wav = pcm16ToWav(joined, 24000, 1);
  const bytes = new Uint8Array(await wav.arrayBuffer());
  assert.equal(wav.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(bytes.slice(8, 12)), "WAVE");
  assert.equal(new DataView(bytes.buffer).getUint32(40, true), 6);
});
test("narration extraction keeps scene order and skips empty scenes", () => {
  assert.equal(narrationText([{narration:"پہلا منظر"},{subtitle:"دوسرا منظر"},{narration:""}]), "پہلا منظر\n\nدوسرا منظر");
  const chunks = splitNarration("الف".repeat(6501), 3000);
  assert.deepEqual(chunks.map(x => Array.from(x).length), [3000, 3000, 501]);
  assert.equal(chunks.join(""), "الف".repeat(6501));
});
