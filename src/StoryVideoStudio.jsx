import React, { useEffect, useState } from "react";

const MAX_STORY_CHARS = 100000;
const API_BASE = (import.meta.env.VITE_RENDER_SERVER_URL || import.meta.env.VITE_RENDER_API_URL || "https://sher-ai-story-render.onrender.com").replace(/\/+$/, "");

function detectLanguage(text) {
  if (/[\\u0A00-\\u0A7F]/.test(text)) return "pa-IN";
  if (/[\\u0900-\\u097F]/.test(text)) return "hi-IN";
  if (/[\\u0600-\\u06FF]/.test(text)) {
    const punjabiWords = /میں نوں|تینوں|ساڈا|ساڈی|تہاڈا|ویکھ|کِتھے|اِتھے|نئیں|ہوندا|پیا|وچ/;
    return punjabiWords.test(text) ? "pa-IN" : "ur-PK";
  }
  return "en-US";
}

function splitIntoChapters(text, maxWords = 220) {
  const words = text.trim().split(/\s+/);
  const chapters = [];
  for (let i = 0; i < words.length; i += maxWords) chapters.push(words.slice(i, i + maxWords).join(" "));
  return chapters;
}

function makeScenes(chapter, chapterIndex, mode, visualStyle) {
  const sentences = chapter.split(/(?<=[۔.!?؟])\s+/).map((s) => s.trim()).filter(Boolean);
  const count = Math.min(30, Math.max(1, sentences.length));
  const groups = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * sentences.length / count);
    const end = Math.floor((i + 1) * sentences.length / count);
    groups.push(sentences.slice(start, Math.max(start + 1, end)).join(" "));
  }
  return groups.map((sentence, idx) => ({
    narration: sentence,
    media_url: "https://image.pollinations.ai/prompt/" + encodeURIComponent(sentence.slice(0, 240) + (visualStyle === "baby" ? ", cute baby viral comedy, wholesome expressive toddler, bright playful cinematic scene" : visualStyle === "cartoon" ? ", high quality 3D animated cartoon movie frame, expressive characters, cinematic lighting" : ", desi comedy, realistic cinematic film still, expressive South Asian faces")) + "?width=" + (mode === "9:16" ? 720 : 1280) + "&height=" + (mode === "9:16" ? 1280 : 720) + "&seed=" + (chapterIndex * 100 + idx + 1) + "&nologo=true",
    is_video: false,
    effect: ["punch_zoom", "shake", "zoom_out"][idx % 3],
    meme_text: /ہنس|مذاق|پاگل|حیران|funny|crazy|wtf/i.test(sentence) ? "😂 WAIT FOR IT!" : "",
    sfx_type: /ہنس|مذاق|funny/i.test(sentence) ? "laugh" : idx % 4 === 1 ? "whoosh" : "none",
    subtitle_chunk: sentence.slice(0, 42),
    duration_sec: Math.min(4, Math.max(2.5, sentence.split(/\s+/).length * 0.42))
  }));
}

export default function StoryVideoStudio() {
  const [story, setStory] = useState("");
  const [mode, setMode] = useState("9:16");
  const [visualStyle, setVisualStyle] = useState("desi");
  const [messages, setMessages] = useState([
    { role: "ai", text: "اپنی کہانی نیچے پیسٹ کریں۔ میں مناظر، آواز، سب ٹائٹلز اور وائرل ایفیکٹس کے ساتھ ویڈیو تیار کروں گا۔" }
  ]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem("render_server_url") || API_BASE);
  const [accessPin, setAccessPin] = useState(() => localStorage.getItem("sher_story_access_pin") || "");
  const [pinInput, setPinInput] = useState("");
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem("sher_story_access_pin")));
  const [pinError, setPinError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicPin = params.get("access");
    if (!magicPin) return;
    params.delete("access");
    const cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    window.history.replaceState({}, "", cleanUrl);
    fetch(serverUrl.replace(/\\/+$/, "") + "/health", { headers: { "X-App-Access-PIN": magicPin } })
      .then((response) => {
        if (!response.ok) throw new Error("Magic link invalid or server unavailable.");
        localStorage.setItem("sher_story_access_pin", magicPin);
        localStorage.setItem("render_server_url", serverUrl.trim().replace(/\\/+$/, ""));
        setAccessPin(magicPin);
        setUnlocked(true);
      })
      .catch(() => setPinError("Magic link درست نہیں یا سرور دستیاب نہیں۔"));
  }, []);

  const unlockApp = async () => {
    const candidate = pinInput.trim();
    if (!candidate || !serverUrl.trim()) {
      setPinError("سرور URL اور Secret PIN درج کریں۔");
      return;
    }
    try {
      const response = await fetch(serverUrl.replace(/\/+$/, "") + "/health", {
        headers: { "X-App-Access-PIN": candidate }
      });
      if (!response.ok) throw new Error(response.status === 401 ? "Secret PIN درست نہیں۔" : "سرور سے رابطہ ناکام۔");
      localStorage.setItem("sher_story_access_pin", candidate);
      localStorage.setItem("render_server_url", serverUrl.trim().replace(/\/+$/, ""));
      setAccessPin(candidate);
      setUnlocked(true);
      setPinError("");
      setPinInput("");
    } catch (error) { setPinError(error.message); }
  };

  const lockApp = () => {
    localStorage.removeItem("sher_story_access_pin");
    setAccessPin("");
    setUnlocked(false);
    setPinInput("");
    setMenuOpen(false);
  };

  const authorizedFetch = (url, options = {}) => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), "X-App-Access-PIN": accessPin }
  });

  const runCopyDiagnostic = async () => {
    setBusy(true);
    try {
      const response = await authorizedFetch(serverUrl.replace(/\/+$/, "") + "/api/self-test");
      if (!response.ok) throw new Error("Server returned " + response.status);
      const report = { time: new Date().toISOString(), serverUrl, mode, tests: await response.json() };
      const reportText = "=== SHER AI DIAGNOSTIC REPORT ===\n" + JSON.stringify(report, null, 2);
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(reportText);
        setMessages((old) => [...old, { role: "ai", text: "✅ تشخیصی رپورٹ کلپ بورڈ میں کاپی ہو گئی ہے۔" }]);
      } catch {
        setMessages((old) => [...old, { role: "ai", text: "تشخیصی رپورٹ:\n" + reportText }]);
      }
    } catch (error) {
      setMessages((old) => [...old, { role: "ai", text: "❌ سرور ٹیسٹ ناکام: " + error.message }]);
    } finally { setBusy(false); }
  };

  const handleGenerate = async () => {
    if (!story.trim() || busy) return;
    if (!serverUrl.trim()) {
      setMessages((old) => [...old, { role: "ai", text: "پہلے Render Server URL سیٹ کریں۔" }]);
      setMenuOpen(true);
      return;
    }
    const userStory = story.trim();
    if (userStory.length > MAX_STORY_CHARS) {
      setMessages((old) => [...old, { role: "ai", text: `کہانی ${MAX_STORY_CHARS.toLocaleString()} حروف کی حد سے زیادہ ہے۔ براہِ کرم اسے مختصر کریں۔` }]);
      return;
    }
    setStory("");
    setBusy(true);
    setMessages((old) => [...old, { role: "user", text: userStory }, { role: "ai", text: "⏳ ویڈیو کے مناظر، آواز اور ایڈیٹنگ تیار ہو رہی ہے..." }]);
    try {
      const chapters = splitIntoChapters(userStory);
      const chapterUrls = [];
      const language = detectLanguage(userStory);
      for (let c = 0; c < chapters.length; c++) {
        const scenes = makeScenes(chapters[c], c, mode, visualStyle);
        const response = await authorizedFetch(serverUrl.replace(/\/+$/, "") + "/api/render-story", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenes, aspect_ratio: mode, auto_tts: true, language, visual_style: visualStyle })
        });
        if (!response.ok) throw new Error("Chapter " + (c + 1) + ": " + await response.text());
        const data = await response.json();
        if (!data.video_url) throw new Error("Chapter " + (c + 1) + " کا ویڈیو لنک موصول نہیں ہوا۔");
        chapterUrls.push(data.video_url);
        setMessages((old) => old.map((msg, i) => i === old.length - 1 ? { ...msg, text: "⏳ چیپٹر " + (c + 1) + "/" + chapters.length + " تیار ہو گیا ہے..." } : msg));
      }
      let finalPath = chapterUrls[0];
      if (chapterUrls.length > 1) {
        const mergeResponse = await authorizedFetch(serverUrl.replace(/\/+$/, "") + "/api/merge-chapters", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_urls: chapterUrls })
        });
        if (!mergeResponse.ok) throw new Error("Chapters merge: " + await mergeResponse.text());
        finalPath = (await mergeResponse.json()).video_url;
      }
      const finalUrl = finalPath.startsWith("http") ? finalPath : serverUrl.replace(/\/+$/, "") + finalPath;
      // Fetch the protected media with the PIN header; the native video element
      // then plays the local object URL without leaking the PIN in a query string.
      const mediaResponse = await authorizedFetch(finalUrl);
      if (!mediaResponse.ok) throw new Error("ویڈیو ڈاؤن لوڈ کرنے کے لیے سرور نے اجازت نہیں دی۔");
      const playableUrl = URL.createObjectURL(await mediaResponse.blob());
      setMessages((old) => [...old.slice(0, -1), { role: "ai", text: "🎬 آپ کی ویڈیو مکمل تیار ہے!", videoUrl: playableUrl }]);
    } catch (error) {
      setMessages((old) => [...old.slice(0, -1), { role: "ai", text: "❌ مسئلہ: " + error.message }]);
    } finally { setBusy(false); }
  };

  if (!unlocked) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0b0b0d", color: "#fff" }}>
        <div style={{ width: "100%", maxWidth: 380, display: "grid", gap: 14, padding: 24, border: "1px solid #34343a", borderRadius: 22, background: "#17171b" }}>
          <div style={{ textAlign: "center", fontSize: 38 }}>🔒</div>
          <h2 style={{ margin: 0, textAlign: "center" }}>اجازت نامہ</h2>
          <p style={{ margin: 0, textAlign: "center", color: "#b9b9c2" }}>Secret PIN درج کریں</p>
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="Render Server URL" style={{ boxSizing: "border-box", width: "100%", padding: 12, borderRadius: 10, border: "1px solid #45454d", background: "#24242a", color: "#fff" }} />
          <input type="password" inputMode="numeric" autoComplete="current-password" value={pinInput} onChange={(e) => setPinInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") unlockApp(); }} placeholder="Secret Access PIN" style={{ boxSizing: "border-box", width: "100%", padding: 12, borderRadius: 10, border: "1px solid #45454d", background: "#24242a", color: "#fff" }} />
          {pinError && <p style={{ margin: 0, color: "#ff8585", fontSize: 13 }}>{pinError}</p>}
          <button onClick={unlockApp} style={{ padding: 12, border: 0, borderRadius: 12, background: "#d6ad55", color: "#17120a", fontWeight: 700 }}>🔓 اجازت دیں</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#fff", color: "#111" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #eee" }}>
        <strong>SHER AI Studio</strong>
        <button onClick={runCopyDiagnostic} disabled={busy} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid #ddd", background: "#f8fafc", fontSize: 12 }}>🔍 ٹیسٹ اور رپورٹ</button>
      </header>
      {menuOpen && (
        <div style={{ padding: 12, background: "#f8fafc", borderBottom: "1px solid #eee", display: "grid", gap: 9 }}>
          <button onClick={lockApp} style={{ padding: 9, borderRadius: 12, background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>🔒 Lock / لاگ آؤٹ</button>
          <label style={{ fontSize: 12 }}>Render Server URL</label>
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://your-render-server.example" style={{ padding: 9, border: "1px solid #ddd", borderRadius: 9 }} />
          <button onClick={() => { localStorage.setItem("render_server_url", serverUrl.trim().replace(/\/+$/, "")); setMenuOpen(false); }} style={{ padding: 8, borderRadius: 12 }}>سرور محفوظ کریں</button>
          <div style={{ display: "grid", gap: 7 }}>
            <strong style={{ fontSize: 13 }}>🎨 ویڈیو اسٹائل</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setVisualStyle("desi")} style={{ padding: "7px 10px", borderRadius: 14, border: visualStyle === "desi" ? "2px solid #b7791f" : "1px solid #ddd" }}>😂 Desi Comedy (Realistic)</button>
              <button onClick={() => setVisualStyle("baby")} style={{ padding: "7px 10px", borderRadius: 14, border: visualStyle === "baby" ? "2px solid #b7791f" : "1px solid #ddd" }}>👶 Cute Baby Viral</button>
              <button onClick={() => setVisualStyle("cartoon")} style={{ padding: "7px 10px", borderRadius: 14, border: visualStyle === "cartoon" ? "2px solid #b7791f" : "1px solid #ddd" }}>🎬 3D Cartoon Movie</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setMode("9:16"); setMenuOpen(false); }} style={{ padding: "6px 12px", borderRadius: 16, background: mode === "9:16" ? "#111" : "#fff", color: mode === "9:16" ? "#fff" : "#111" }}>📱 Shorts (9:16)</button>
            <button onClick={() => { setMode("16:9"); setMenuOpen(false); }} style={{ padding: "6px 12px", borderRadius: 16, background: mode === "16:9" ? "#111" : "#fff", color: mode === "16:9" ? "#fff" : "#111" }}>🎬 طویل فلم (16:9)</button>
          </div>
        </div>
      )}
      <main style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", background: msg.role === "user" ? "#f1f5f9" : "transparent", padding: msg.role === "user" ? "10px 14px" : 0, borderRadius: 18 }}>
            <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{msg.text}</p>
            {msg.videoUrl && <div style={{ marginTop: 10 }}>
              <video src={msg.videoUrl} controls playsInline style={{ width: "100%", borderRadius: 16, background: "#000" }} />
              <div style={{ display: "flex", gap: 16, marginTop: 8, justifyContent: "flex-end" }}>
                <a href={msg.videoUrl} download="sher-ai-video.mp4" style={{ textDecoration: "none", padding: "6px 14px", borderRadius: 20, background: "#111", color: "#fff", fontSize: 13 }}>⬇️ Download</a>
                <button onClick={() => navigator.share?.({ url: msg.videoUrl })} style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid #ddd", background: "#fff", fontSize: 13 }}>🔗 Share</button>
              </div>
            </div>}
          </div>
        ))}
      </main>
      <footer style={{ padding: "10px 14px", borderTop: "1px solid #eee", paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f4f4f5", borderRadius: 28, padding: "6px 12px" }}>
          <button onClick={() => setMenuOpen((value) => !value)} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer" }}>+</button>
          <textarea rows={1} value={story} onChange={(e) => setStory(e.target.value)} placeholder="اپنی کہانی یہاں پیسٹ کریں..." style={{ flex: 1, border: "none", background: "transparent", resize: "none", outline: "none", fontSize: 15 }} />
          <button onClick={handleGenerate} disabled={busy || !story.trim()} style={{ border: "none", background: "#111", color: "#fff", borderRadius: "50%", width: 36, height: 36, cursor: "pointer" }}>↑</button>
        </div>
      </footer>
    </div>
  );
}
