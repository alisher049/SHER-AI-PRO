import React, { useEffect, useRef, useState } from "react";
import { Clipboard } from "@capacitor/clipboard";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";

const API_BASE = (import.meta.env.VITE_RENDER_API_URL || "").replace(/\/+$/, "");
const OPENAI = "https://api.openai.com/v1";
const LANGUAGES = [
  { value: "auto", label: "Auto Detect" },
  { value: "ur-PK", label: "اردو" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "en-US", label: "English" },
  { value: "pa-IN", label: "ਪੰਜਾਬੀ" },
];
const splitStory = (value) => value.split(/(?<=[.!?।؟॥])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const makeSeed = () => String(Math.floor(100000 + Math.random() * 900000));

function chunksOf(value, limit = 3500) {
  const sentences = value.match(/[^.!?।؟॥\n]+[.!?।؟॥]?/g) || [value];
  const result = [];
  let current = "";
  for (const item of sentences) {
    const sentence = item.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      if (current) result.push(current), (current = "");
      for (let i = 0; i < sentence.length; i += limit) result.push(sentence.slice(i, i + limit));
    } else if ((current + " " + sentence).trim().length > limit) {
      if (current) result.push(current);
      current = sentence;
    } else current = (current + " " + sentence).trim();
  }
  if (current) result.push(current);
  return result;
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return window.btoa(binary);
}

async function readError(response) {
  try {
    const body = await response.json();
    return new Error(body.error?.message || body.detail || `Request failed (${response.status})`);
  } catch {
    return new Error(`Request failed (${response.status})`);
  }
}

function scriptLanguage(text) {
  if (/[\u0A00-\u0A7F]/.test(text)) return "pa-IN";
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(text)) return "ur-PK";
  return "";
}

export default function StoryVideoStudio() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState("auto");
  const [aspect, setAspect] = useState("16:9");
  const [dark, setDark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seed] = useState(() => localStorage.getItem("sher_story_master_seed") || makeSeed());
  const [visualDNA, setVisualDNA] = useState(() => localStorage.getItem("sher_story_visual_dna") || "");
  const [characterSheet, setCharacterSheet] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { localStorage.setItem("sher_story_master_seed", seed); }, [seed]);
  useEffect(() => { localStorage.setItem("sher_story_visual_dna", visualDNA); }, [visualDNA]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  async function detectLanguage(text) {
    if (language !== "auto") return language;
    const byScript = scriptLanguage(text);
    if (byScript) return byScript;
    if (!apiKey.trim()) return "en-US";
    const response = await fetch(`${OPENAI}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini", temperature: 0,
        messages: [
          { role: "system", content: "Identify the primary language of the text. Reply with exactly one code: en-US, ur-PK, hi-IN, or pa-IN. Roman Urdu should be ur-PK; Roman Hindi should be hi-IN; Roman Punjabi should be pa-IN." },
          { role: "user", content: text.slice(0, 2500) },
        ],
      }),
    });
    if (!response.ok) throw await readError(response);
    const data = await response.json();
    const code = data.choices?.[0]?.message?.content?.trim();
    return ["en-US", "ur-PK", "hi-IN", "pa-IN"].includes(code) ? code : "en-US";
  }

  async function openAI(path, options = {}) {
    const response = await fetch(`${OPENAI}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${apiKey.trim()}`, ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...options.headers },
    });
    if (!response.ok) throw await readError(response);
    return response;
  }

  async function makeVisualDNA(story, mood) {
    if (visualDNA.trim()) return visualDNA.trim();
    const response = await openAI("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-4.1-mini", temperature: 0.2,
        messages: [
          { role: "system", content: "You are a film continuity supervisor. Return a detailed concise visual continuity bible in English." },
          { role: "user", content: `Create Master Character and Background Visual DNA. Define recurring characters' facial features, age, hair, clothing, accessories, body proportions and recurring locations, lighting, palette and art direction. Do not invent unnecessary characters. Keep all details stable. Seed: ${seed}. Mood: ${mood}. Story:\n${story.slice(0, 18000)}` },
        ],
      }),
    });
    const data = await response.json();
    const dna = data.choices?.[0]?.message?.content?.trim();
    if (!dna) throw new Error("Visual DNA تیار نہیں ہو سکا۔");
    setVisualDNA(dna);
    localStorage.setItem("sher_story_visual_dna", dna);
    return dna;
  }

  async function makeCharacterSheet(dna, mood) {
    const response = await openAI("/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-image-1", prompt: `Create a clean cinematic character reference sheet with full-body and close-up views of each recurring character. Preserve identical face, hair, age, skin tone, proportions, clothing and accessories. Add small location references. No words, labels, borders or watermark. Visual DNA: ${dna}. Seed: ${seed}. Mood: ${mood}`,
        n: 1, size: "1536x1024", quality: "high", output_format: "png",
      }),
    });
    const data = await response.json();
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) throw new Error("Master Character Sheet موصول نہیں ہوئی۔");
    const sheet = `data:image/png;base64,${encoded}`;
    setCharacterSheet(sheet);
    return sheet;
  }

  async function makeSceneImage(text, dna, sheet, index, total, ratio) {
    const binary = atob(sheet.split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", `Create cinematic film frame ${index + 1}/${total}. Use the supplied reference sheet as strict character identity reference. Do not redesign faces, clothing, proportions or recurring locations. No text, watermark or collage. Visual DNA: ${dna}. Scene: ${text}.`);
    form.append("size", ratio === "16:9" ? "1536x1024" : "1024x1536");
    form.append("quality", "medium");
    form.append("output_format", "jpeg");
    form.append("image", new Blob([bytes], { type: "image/png" }), "character-sheet.png");
    const response = await openAI("/images/edits", { method: "POST", body: form });
    const data = await response.json();
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) throw new Error("منظر کی تصویر موصول نہیں ہوئی۔");
    return `data:image/jpeg;base64,${encoded}`;
  }

  async function makeNarration(text, lang) {
    const parts = chunksOf(text, 3000);
    const audio = [];
    const prompts = {
      "ur-PK": "Speak naturally in Urdu with clear Pakistani Urdu pronunciation and expressive cinematic narration.",
      "hi-IN": "Speak naturally in Hindi with clear pronunciation and expressive cinematic narration.",
      "pa-IN": "Speak naturally in Punjabi (India) with clear Punjabi pronunciation and expressive cinematic narration.",
      "en-US": "Speak naturally in English with clear pronunciation and expressive cinematic narration.",
    };
    for (const part of parts) {
      const response = await openAI("/audio/speech", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "marin", input: part, instructions: prompts[lang], response_format: "mp3" }),
      });
      audio.push(toBase64(await response.arrayBuffer()));
    }
    return audio;
  }

  async function renderStory(story, lang) {
    if (!API_BASE) throw new Error("VITE_RENDER_API_URL میں Python Render سرور کا URL موجود نہیں۔");
    const parts = splitStory(story).slice(0, 30);
    if (!parts.length) throw new Error("کہانی سے مناظر نہیں بن سکے۔");
    const dna = await makeVisualDNA(story, "Cinematic & Emotional");
    const sheet = await makeCharacterSheet(dna, "Cinematic & Emotional");
    const scenes = [];
    for (let i = 0; i < parts.length; i++) {
      const image = await makeSceneImage(parts[i], dna, sheet, i, parts.length, aspect);
      scenes.push({ narration: parts[i], image });
    }
    const audioSegments = lang === "pa-IN" ? null : await makeNarration(story, lang);
    const response = await fetch(`${API_BASE}/api/render`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: story, scenes, language: lang, gender: "female", rate: 0, aspect: aspect === "16:9" ? "landscape" : "shorts", audio_segments: audioSegments }),
    });
    if (!response.ok) throw new Error(`Python Render API (${response.status}): ${(await response.text()).slice(0, 350)}`);
    const created = await response.json();
    for (let i = 0; i < 900; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const check = await fetch(`${API_BASE}/api/jobs/${created.job_id}`);
      if (!check.ok) throw new Error("Render job status دستیاب نہیں۔");
      const job = await check.json();
      if (job.status === "failed") throw new Error(job.message || "FFmpeg رینڈرنگ ناکام ہوئی۔");
      if (job.status === "completed") return { type: "video", url: `${API_BASE}${job.video}`, thumbnail: `${API_BASE}${job.thumbnail}` };
    }
    throw new Error("ویڈیو مقررہ وقت میں تیار نہیں ہوئی۔");
  }

  async function makeSingleImage(prompt, lang) {
    const languageHint = { "ur-PK": "", "hi-IN": "", "pa-IN": "", "en-US": "" }[lang];
    const response = await openAI("/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-image-1", prompt: `${prompt} ${languageHint} Create one polished image, no watermark.`, n: 1, size: aspect === "16:9" ? "1536x1024" : "1024x1536", quality: "high", output_format: "png" }),
    });
    const data = await response.json();
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) throw new Error("تصویر موصول نہیں ہوئی۔");
    return { type: "image", url: `data:image/png;base64,${encoded}` };
  }

  function isImagePrompt(text) {
    return /^(draw\b|create an image\b|generate an image\b|make an image\b|تصویر بناؤ|تصویر بنائیں|ایک تصویر|تصویر تیار کرو|تصویر تیار کریں|ਇੱਕ ਤਸਵੀਰ|ਤਸਵੀਰ ਬਣਾਓ)/i.test(text.trim());
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    setError("");
    if (!apiKey.trim()) { setShowSettings(true); setError("پہلے Settings میں OpenAI API Key درج کریں۔"); return; }
    setInput("");
    const userId = `${Date.now()}-user`;
    setMessages((old) => [...old, { id: userId, role: "user", text }]);
    setBusy(true);
    setMessages((old) => [...old, { id: `${Date.now()}-pending`, role: "assistant", pending: true, status: "Generating..." }]);
    try {
      const lang = await detectLanguage(text);
      const result = isImagePrompt(text) ? await makeSingleImage(text, lang) : await renderStory(text, lang);
      setMessages((old) => old.filter((m) => !m.pending).concat({ id: `${Date.now()}-result`, role: "assistant", result }));
    } catch (e) {
      setMessages((old) => old.filter((m) => !m.pending));
      setError(e.message || "درخواست مکمل نہیں ہو سکی۔");
    } finally { setBusy(false); inputRef.current?.focus(); }
  }

  async function pasteText() {
    try {
      const clip = await Clipboard.read();
      if (clip.value) setInput((old) => old ? `${old}\n${clip.value}` : clip.value);
    } catch {
      try { const value = await navigator.clipboard.readText(); if (value) setInput((old) => old ? `${old}\n${value}` : value); }
      catch { setError("کلپ بورڈ کی اجازت نہیں ملی؛ متن دستی طور پر پیسٹ کریں۔"); }
    }
  }

  async function downloadResult(result) {
    try {
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("فائل حاصل نہیں ہو سکی۔");
      const blob = await response.blob();
      if (Capacitor.isNativePlatform()) {
        const data = toBase64(await blob.arrayBuffer());
        const ext = result.type === "video" ? "mp4" : "png";
        await Filesystem.writeFile({ path: `SHER-AI-Story-${Date.now()}.${ext}`, data, directory: Directory.Documents, recursive: true });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.type === "video" ? "SHER-AI-Story.mp4" : "SHER-AI-Image.png"; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) { setError(`ڈاؤن لوڈ ناکام: ${e.message}`); }
  }

  return (
    <main className={`sher-chat ${dark ? "dark" : "light"}`}>
      <header className="topbar">
        <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark((v) => !v)}>{dark ? "🌙" : "☀️"}</button>
        <div className="top-actions">
          <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
          <button className="icon-btn" aria-label="Settings" onClick={() => setShowSettings((v) => !v)}>⚙️</button>
        </div>
      </header>

      {showSettings && <section className="settings-panel">
        <label htmlFor="openai-key">OpenAI API Key</label>
        <input id="openai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" />
        <label htmlFor="aspect">Video aspect ratio</label>
        <select id="aspect" value={aspect} onChange={(e) => setAspect(e.target.value)}><option>16:9</option><option>9:16</option></select>
        <p>API Key اس سیشن میں استعمال ہوگی اور مستقل محفوظ نہیں کی جاتی۔ OpenAI API کا استعمال مفت ہونے کی ضمانت نہیں؛ تصاویر اور آواز پر لاگت آ سکتی ہے۔</p>
        <button onClick={() => setShowSettings(false)}>Done</button>
      </section>}

      <section className="chat-area" aria-live="polite">
        {messages.length === 0 && <div className="welcome"><div className="brand-mark">✦</div><h1>SHER AI PRO</h1><p>اپنی کہانی لکھیں یا تصویر بنانے کی درخواست کریں</p></div>}
        {messages.map((message) => <div key={message.id} className={`message ${message.role}`}>
          {message.text && <div className="bubble">{message.text}</div>}
          {message.pending && <div className="generating">{message.status || "Generating..."}</div>}
          {message.result?.type === "image" && <div className="result-media"><img src={message.result.url} alt="Generated image" /><button className="download" onClick={() => downloadResult(message.result)} aria-label="Download image">⬇</button></div>}
          {message.result?.type === "video" && <div className="result-media"><video src={message.result.url} poster={message.result.thumbnail} controls playsInline /><button className="download" onClick={() => downloadResult(message.result)} aria-label="Download video">⬇</button></div>}
        </div>)}
        {error && <div className="error-text" role="alert">{error}</div>}
        {characterSheet && <details className="reference-sheet"><summary>Master Character Sheet</summary><img src={characterSheet} alt="Master Character Sheet" /></details>}
        <div ref={bottomRef} />
      </section>

      <footer className="composer-wrap">
        <div className="composer">
          <button className="icon-btn paste" onClick={pasteText} aria-label="Paste">📋</button>
          <textarea ref={inputRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask or paste your story..." />
          <button className="send" onClick={sendMessage} disabled={busy || !input.trim()} aria-label="Send">↑</button>
        </div>
        <small>AI-generated media may take time. OpenAI API charges may apply.</small>
      </footer>

      <style>{`
        *{box-sizing:border-box}.sher-chat{--bg:#090d16;--panel:#121a29;--text:#f6f2e9;--muted:#9ba8ba;--line:#29354a;min-height:100dvh;height:100dvh;display:flex;flex-direction:column;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans Devanagari",sans-serif;max-width:900px;margin:auto;overflow:hidden}.sher-chat.light{--bg:#f5f6f8;--panel:#fff;--text:#202633;--muted:#687386;--line:#dfe3e9}.topbar{padding:calc(env(safe-area-inset-top, 24px) + 12px) 14px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);flex:none}.top-actions{display:flex;align-items:center;gap:9px}.top-actions select,.settings-panel input,.settings-panel select{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:9px 11px;max-width:170px}.icon-btn{border:0;background:transparent;color:var(--text);font-size:20px;width:40px;height:40px;border-radius:50%;cursor:pointer}.icon-btn:active,.send:active{transform:scale(.96)}.settings-panel{margin:12px 14px;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:16px;display:grid;gap:9px;flex:none}.settings-panel label{font-size:13px;font-weight:700}.settings-panel input,.settings-panel select{width:100%;max-width:none}.settings-panel p{font-size:12px;line-height:1.6;color:var(--muted);margin:3px 0}.settings-panel button{justify-self:end;border:0;border-radius:9px;padding:9px 16px;background:#d7b16d;color:#17120a;font-weight:700}.chat-area{flex:1;overflow-y:auto;padding:20px 14px 18px;display:flex;flex-direction:column;gap:16px;scroll-behavior:smooth}.welcome{margin:auto;text-align:center;color:var(--muted)}.brand-mark{margin:auto;width:54px;height:54px;border-radius:18px;background:linear-gradient(140deg,#f1ce83,#9c6b2b);display:grid;place-items:center;color:#17120a;font-size:30px}.welcome h1{font-size:20px;letter-spacing:1.5px;color:var(--text);margin:14px 0 5px}.welcome p{font-size:13px}.message{display:flex;flex-direction:column;max-width:88%;gap:8px}.message.user{align-self:flex-end}.message.assistant{align-self:flex-start}.bubble{padding:11px 14px;border-radius:18px;background:var(--panel);border:1px solid var(--line);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere}.user .bubble{background:#28364b;color:#fff;border-color:#34455e}.generating{color:var(--muted);font-size:13px;padding:8px 2px}.result-media{position:relative;max-width:min(100%,650px)}.result-media img,.result-media video{display:block;max-width:100%;max-height:65vh;border-radius:14px;background:#000}.download{position:absolute;right:9px;bottom:9px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(8,12,18,.82);color:white;font-size:22px;cursor:pointer}.error-text{color:#e46e78;font-size:13px;padding:8px}.reference-sheet{font-size:12px;color:var(--muted)}.reference-sheet img{display:block;max-width:100%;margin-top:8px;border-radius:12px}.composer-wrap{padding:10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px);border-top:1px solid var(--line);flex:none;background:var(--bg)}.composer{display:flex;align-items:flex-end;gap:6px;padding:6px 7px;background:var(--panel);border:1px solid var(--line);border-radius:28px;min-height:54px}.composer textarea{flex:1;resize:none;max-height:140px;border:0;outline:0;background:transparent;color:var(--text);padding:11px 5px;font:14px/1.5 system-ui;min-width:0}.composer textarea::placeholder{color:var(--muted)}.paste{font-size:18px;flex:none}.send{flex:none;width:40px;height:40px;border:0;border-radius:50%;background:#d7b16d;color:#17120a;font-size:25px;font-weight:700;cursor:pointer}.send:disabled{opacity:.4;cursor:default}.composer-wrap small{display:block;text-align:center;color:var(--muted);font-size:10px;margin-top:7px}@media(min-width:700px){.chat-area{padding-left:26px;padding-right:26px}.composer-wrap{padding-left:24px;padding-right:24px}}
      `}</style>
    </main>
  );
}