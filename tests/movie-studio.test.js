import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "../src/movieStudioUtils.js";

test("duration choices are the five advertised options", () => assert.deepEqual(MOVIE_DURATIONS, [15, 30, 60, 90, 150]));

test("parser accepts plain and fenced JSON", () => {
  const data = { title: "آزمائشی فلم", scenes: [{ title: "آغاز", narration: "آواز", visual: "بارش" }] };
  assert.equal(parseStoryboardResponse(JSON.stringify(data)).title, "آزمائشی فلم");
  assert.equal(parseStoryboardResponse("```json\n" + JSON.stringify(data) + "\n```").scenes.length, 1);
});

test("parser rejects empty scenes and caps at 60", () => {
  assert.throws(() => parseStoryboardResponse('{"scenes":[]}'), /درست مناظر/);
  const scenes = Array.from({ length: 65 }, (_, i) => ({ title: "Scene " + i }));
  assert.equal(parseStoryboardResponse(JSON.stringify({ scenes })).scenes.length, 60);
});

test("parser fills optional scene fields safely", () => {
  const scene = parseStoryboardResponse(JSON.stringify({ scenes: [{ narration: "مکالمہ" }] })).scenes[0];
  assert.equal(scene.title, "منظر 1");
  assert.equal(scene.subtitle, "مکالمہ");
  assert.equal(scene.visual, "");
});

test("both exports preserve duration and honest MP4 notice", () => {
  const scenes = [{ title: "اختتام", narration: "کہانی ختم", subtitle: "ختم", visual: "سورج طلوع" }];
  const text = buildScriptText("ٹیسٹ", 30, scenes);
  assert.match(text, /30 منٹ/);
  assert.match(text, /کہانی ختم/);
  assert.match(text, /MP4 ویڈیو نہیں/);
  const json = JSON.parse(buildStoryboardJson("ٹیسٹ", 30, scenes));
  assert.equal(json.duration_minutes, 30);
  assert.equal(json.scenes.length, 1);
  assert.match(json.notice, /MP4/);
});

test("screen source exposes all four steps and existing AI endpoint", async () => {
  const source = await readFile(new URL("../src/MovieStudio.jsx", import.meta.url), "utf8");
  for (const phrase of ["کہانی پیسٹ کریں", "دورانیہ منتخب کریں", "فلم کا خاکہ تیار کریں", "فائل حاصل کریں"]) assert.ok(source.includes(phrase));
  assert.ok(source.includes('fetch("/api/chat"'));
});
