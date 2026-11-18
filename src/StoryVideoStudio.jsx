import React, { useEffect, useState } from "react";
import { detectLanguage, splitIntoChapters, makeScenes } from "./storyVideoUtils.js";

const MAX_STORY_CHARS = 100000;
const VIDEO_DB_NAME = "sher-ai-video-gallery";
const VIDEO_STORE = "videos";
function openVideoGalleryDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        const store = db.createObjectStore(VIDEO_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveGalleryVideo(video) {
  const db = await openVideoGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readwrite");
    tx.objectStore(VIDEO_STORE).put(video);
    tx.oncomplete = () => { db.close(); resolve(video); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function readGalleryVideos() {
  const db = await openVideoGalleryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE, "readonly");
    const request = tx.objectStore(VIDEO_STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result.sort((a, b) => b.createdAt - a.createdAt)); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

const API_BASE = (import.meta.env.VITE_RENDER_SERVER_URL || import.meta.env.VITE_RENDER_API_URL || "https://sher-ai-story-render.onrender.com").replace(/\/+$/, "");


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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [galleryError, setGalleryError] = useState("");
  const [galleryUrls, setGalleryUrls] = useState({});
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("sher_story_theme") === "dark");
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sher_story_history") || "[]").slice(0, 12); }
    catch { return []; }
  });
  useEffect(() => { localStorage.setItem("sher_story_history", JSON.stringify(history.slice(0, 12))); }, [history]);
  useEffect(() => { localStorage.setItem("sher_story_theme", darkMode ? "dark" : "light"); }, [darkMode]);
  useEffect(() => {
    readGalleryVideos().then(setGallery).catch(() => setGalleryError("اس ڈیوائس پر ویڈیو گیلری دستیاب نہیں ہو سکی۔"));
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  }, []);
  useEffect(() => {
    const urls = Object.fromEntries(gallery.map((item) => [item.id, URL.createObjectURL(item.blob)]));
    setGalleryUrls(urls);
    return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
  }, [gallery]);
  const showGallery = () => {
    setGalleryOpen(true);
    setSidebarOpen(false);
    readGalleryVideos().then(setGallery).catch(() => setGalleryError("گیلری لوڈ نہیں ہو سکی۔"));
  };
  const startNewVideo = () => {
    setStory("");
    setMessages([{ role: "ai", text: "اپنی کہانی نیچے پیسٹ کریں۔ میں مناظر، آواز، سب ٹائٹلز اور وائرل ایفیکٹس کے ساتھ ویڈیو تیار کروں گا۔" }]);
    setSidebarOpen(false);
  };
  const openSavedStory = (item) => {
    setStory(item.text);
    setMessages([{ role: "ai", text: "آپ کی محفوظ کہانی دوبارہ کھول دی گئی ہے۔ تبدیلی کریں یا ویڈیو تیار کریں۔" }]);
    setSidebarOpen(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicPin = params.get("access");
    if (!magicPin) return;
    params.delete("access");
    const cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "") + window.location.hash;
    window.history.replaceState({}, "", cleanUrl);
    fetch(serverUrl.replace(/\/+$/, "") + "/health", { headers: { "X-App-Access-PIN": magicPin } })
      .then((response) => {
        if (!response.ok) throw new Error("Magic link invalid or server unavailable.");
        localStorage.setItem("sher_story_access_pin", magicPin);
        localStorage.setItem("render_server_url", serverUrl.trim().replace(/\/+$/, ""));
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
      const reportText = "=== SHER AI DIAGNOSTIC REPORT ===
" + JSON.stringify(report, null, 2);
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(reportText);
        setMessages((old) => [...old, { role: "ai", text: "✅ تشخیصی رپورٹ کلپ بورڈ میں کاپی ہو گئی ہے۔" }]);
      } catch {
        setMessages((old) => [...old, { role: "ai", text: "تشخیصی رپورٹ:
" + reportText }]);
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
    setBusy(true);
    setHistory((old) => [{ id: Date.now(), text: userStory, title: userStory.slice(0, 42) || "نئی کہانی" }, ...old.filter((item) => item.text !== userStory)].slice(0, 12));
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
        const chapterUrl = data.video_url.startsWith("http") ? data.video_url : `${serverUrl.replace(/\/+$/, "")}${data.video_url.startsWith("/") ? "" : "/"}${data.video_url}`;
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
      setStory((current) => current === userStory ? "" : current);
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
    <div className={"studio-layout" + (darkMode ? " studio-dark" : "")} dir="rtl">
      {sidebarOpen && <button className="studio-scrim" aria-label="مینو بند کریں" onClick={() => setSidebarOpen(false)} />}
      <aside className={"studio-sidebar" + (sidebarOpen ? " studio-sidebar-open" : "")}>
        <div className="studio-brand"><span className="studio-brand-mark">✦</span><div><strong>SHER AI PRO</strong><small>VIDEO STUDIO</small></div><button className="studio-close" onClick={() => setSidebarOpen(false)} aria-label="بند کریں">×</button></div>
        <button className="studio-new" onClick={startNewVideo}>＋ نئی ویڈیو بنائیں</button>
        <button className="studio-new" onClick={showGallery}>🎞 ویڈیو گیلری ({gallery.length})</button>
        <div className="studio-history-title">حالیہ کہانیاں</div>
        <nav className="studio-history">{history.map((item) => <button key={item.id} onClick={() => openSavedStory(item)} title={item.title}>▤ <span>{item.title}</span></button>)}</nav>
        <div className="studio-side-bottom"><button onClick={() => setDarkMode((v) => !v)}>{darkMode ? "☀️ روشن تھیم" : "🌙 ڈارک تھیم"}</button><button onClick={lockApp}>🔒 لاک کریں</button></div>
      </aside>
      <div className="chat-shell" style={{ display: "flex", flexDirection: "column", height: "100dvh", minWidth: 0, flex: 1, background: darkMode ? "#171717" : "#fff", color: darkMode ? "#f5f5f5" : "#111" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid " + (darkMode ? "#333" : "#eee"), background: darkMode ? "#171717" : "#fff" }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><button className="studio-menu" onClick={() => setSidebarOpen(true)} aria-label="مینو کھولیں">☰</button><strong>SHER AI Studio</strong></div>
        <div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={() => setDarkMode((v) => !v)} className="studio-theme" aria-label="تھیم تبدیل کریں">{darkMode ? "☀️" : "🌙"}</button><button onClick={runCopyDiagnostic} disabled={busy} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid " + (darkMode ? "#444" : "#ddd"), background: darkMode ? "#252525" : "#f8fafc", color: darkMode ? "#eee" : "#222", fontSize: 12 }}>🔍 ٹیسٹ اور رپورٹ</button></div>
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
        {galleryOpen && <section style={{ border: "1px solid " + (darkMode ? "#444" : "#ddd"), borderRadius: 16, padding: 14, background: darkMode ? "#202020" : "#fafafa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <strong>🎞 میری ویڈیو گیلری</strong>
            <button onClick={() => setGalleryOpen(false)} style={{ border: "1px solid #aaa", borderRadius: 18, padding: "5px 12px", background: "transparent", color: "inherit" }}>بند کریں</button>
          </div>
          <p style={{ fontSize: 12, opacity: .75 }}>یہ ویڈیوز اسی ڈیوائس کی محفوظ گیلری میں رہیں گی۔</p>
          {galleryError && <p role="alert">{galleryError}</p>}
          {!gallery.length && <p>ابھی کوئی ویڈیو محفوظ نہیں۔ نئی ویڈیو بنائیں، وہ یہاں خود محفوظ ہو جائے گی۔</p>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
            {gallery.map((item) => <article key={item.id} style={{ minWidth: 0, border: "1px solid #8885", borderRadius: 12, padding: 9 }}>
              <video controls playsInline preload="metadata" src={galleryUrls[item.id]} style={{ width: "100%", aspectRatio: "9/16", maxHeight: 300, objectFit: "contain", background: "#000", borderRadius: 9 }} />
              <strong style={{ display: "block", marginTop: 7, fontSize: 13 }}>{item.title}</strong>
              <small>{new Date(item.createdAt).toLocaleString()}</small>
              <a href={galleryUrls[item.id]} download={"SHER-AI-" + item.id + ".mp4"} style={{ display: "inline-block", marginTop: 8, padding: "7px 12px", borderRadius: 18, background: "#d6ad55", color: "#17120a", textDecoration: "none", fontSize: 12 }}>⬇️ دوبارہ ڈاؤن لوڈ</a>
            </article>)}
          </div>
        </section>}
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
    </div>
  );
}