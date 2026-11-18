import React, { useEffect, useState } from "react";

const API_BASE = (import.meta.env.VITE_RENDER_API_URL || "").replace(/\/+$/, "");
const OPENAI = "https://api.openai.com/v1";
const splitStory = (text) => text.split(/(?<=[.!?।؟])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
const newSeed = () => String(Math.floor(100000 + Math.random() * 900000));

function makeChunks(text, limit) {
  const sentences = text.match(/[^.!?।؟\n]+[.!?।؟]?/g) || [text];
  const result = [];
  let current = "";
  for (const item of sentences) {
    const sentence = item.trim();
    if (!sentence) continue;
    if (sentence.length > limit) {
      if (current) result.push(current), current = "";
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
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return window.btoa(binary);
}

async function apiError(response) {
  try {
    const data = await response.json();
    return new Error(data.error?.message || "API request failed (" + response.status + ")");
  } catch (_) {
    return new Error("API request failed (" + response.status + ")");
  }
}

export default function StoryVideoStudio() {
  const [story, setStory] = useState("");
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState("Cinematic & Emotional");
  const [aspect, setAspect] = useState("16:9");
  const [language, setLanguage] = useState("ur-PK");
  const [voice, setVoice] = useState("shimmer");
  const [apiKey, setApiKey] = useState("");
  const [youtubeToken, setYoutubeToken] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [seed, setSeed] = useState(() => localStorage.getItem("sher_story_master_seed") || newSeed());
  const [visualDNA, setVisualDNA] = useState(() => localStorage.getItem("sher_story_visual_dna") || "");
  const [characterNotes, setCharacterNotes] = useState(() => localStorage.getItem("sher_story_character_notes") || "");
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("اپنی کہانی پیسٹ کریں");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [jobId, setJobId] = useState("");

  useEffect(() => { localStorage.setItem("sher_story_master_seed", seed); }, [seed]);
  useEffect(() => { localStorage.setItem("sher_story_visual_dna", visualDNA); }, [visualDNA]);
  useEffect(() => { localStorage.setItem("sher_story_character_notes", characterNotes); }, [characterNotes]);

  function resetProject() {
    setSeed(newSeed());
    setVisualDNA("");
    setCharacterNotes("");
    setStory("");
    setTitle("");
    setScenes([]);
    setVideoUrl("");
    setThumbnailUrl("");
    setJobId("");
    setError("");
    setProgress(0);
    setStatus("نیا پروجیکٹ تیار ہے۔");
  }

  async function createVisualDNA() {
    if (visualDNA.trim()) return visualDNA.trim();
    setStatus("Master Character & Background DNA تیار ہو رہا ہے…");
    const response = await fetch(OPENAI + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey.trim() },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are a film continuity supervisor. Return a concise but highly specific visual continuity bible in English." },
          { role: "user", content:
            "Create a Master Character & Background Visual DNA for this complete story. Describe each recurring character's age, face, skin tone, eyes, hair, build, exact clothes, accessories and distinguishing traits. Describe recurring locations, architecture, lighting, palette, weather and art direction. Keep identities and details stable across all scenes. Do not invent unnecessary characters.\n\nProject continuity identifier: " + seed +
            "\nMood: " + mood +
            "\nAdditional character notes: " + characterNotes +
            "\nFull story:\n" + story.slice(0, 18000)
          }
        ]
      })
    });
    if (!response.ok) throw await apiError(response);
    const data = await response.json();
    const dna = data.choices?.[0]?.message?.content?.trim();
    if (!dna) throw new Error("Master Visual DNA موصول نہیں ہوا۔");
    setVisualDNA(dna);
    localStorage.setItem("sher_story_visual_dna", dna);
    return dna;
  }

  async function generateImage(sceneText, dna, index, total) {
    const prompt =
      "Generate one cinematic illustrated film frame. No text, captions, logos, watermark, borders or collage. " +
      "MASTER CHARACTER AND BACKGROUND LOCK — follow this visual bible carefully: " + dna +
      ". Project identifier: " + seed +
      ". Scene " + (index + 1) + " of " + total +
      ". Mood: " + mood +
      ". Action: " + sceneText +
      ". Preserve recurring characters' facial identity, age, hair, clothing, accessories, body proportions, location design, lighting and color palette exactly as described in the master bible.";
    const response = await fetch(OPENAI + "/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey.trim() },
      body: JSON.stringify({
        model: "gpt-image-2.5-flare",
        prompt,
        n: 1,
        size: aspect === "16:9" ? "1536x1024" : "1024x1536",
        quality: "medium",
        output_format: "jpeg"
      })
    });
    if (!response.ok) throw await apiError(response);
    const data = await response.json();
    const encoded = data.data?.[0]?.b64_json;
    if (!encoded) throw new Error("OpenAI image response میں Base64 تصویر موجود نہیں۔");
    return "data:image/jpeg;base64," + encoded;
  }

  async function generateAudio(text) {
    const chunks = makeChunks(text, 3800);
    const audio = [];
    for (let i = 0; i < chunks.length; i++) {
      setStatus("OpenAI آواز بنا رہا ہے: " + (i + 1) + " / " + chunks.length);
      const response = await fetch(OPENAI + "/audio/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey.trim() },
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          voice,
          input: chunks[i],
          instructions: language === "ur-PK"
            ? "Speak fluently and naturally in Urdu, with clear pronunciation and expressive cinematic narration."
            : "Speak fluently and naturally in Hindi, with clear pronunciation and expressive cinematic narration.",
          response_format: "mp3"
        })
      });
      if (!response.ok) throw await apiError(response);
      audio.push(toBase64(await response.arrayBuffer()));
      setProgress(10 + Math.round((i + 1) / chunks.length * 20));
    }
    return audio;
  }

  async function buildAndRender() {
    if (busy) return;
    setError("");
    if (!story.trim()) return setError("براہِ کرم اپنی مکمل کہانی درج کریں۔");
    if (!apiKey.trim()) {
      setShowSettings(true);
      return setError("پہلے OpenAI API Key درج کریں۔");
    }
    if (!API_BASE) return setError("VITE_RENDER_API_URL میں فعال Python Render سرور کا URL موجود نہیں۔");

    const parts = splitStory(story).slice(0, 30);
    if (!parts.length) return setError("کہانی سے مناظر نہیں بن سکے۔");

    setBusy(true);
    setProgress(2);
    setScenes([]);
    setVideoUrl("");
    setThumbnailUrl("");
    setJobId("");
    try {
      const dna = await createVisualDNA();
      const made = [];
      for (let i = 0; i < parts.length; i++) {
        setStatus("منظر " + (i + 1) + " / " + parts.length + " کی تصویر تیار ہو رہی ہے…");
        const image = await generateImage(parts[i], dna, i, parts.length);
        made.push({ id: i + 1, narration: parts[i], image });
        setScenes(made.slice());
        setProgress(30 + Math.round((i + 1) / parts.length * 35));
      }

      const audioSegments = await generateAudio(story);
      setStatus("Python FFmpeg سرور کو MP4 رینڈرنگ کی درخواست بھیجی جا رہی ہے…");
      const response = await fetch(API_BASE + "/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: story,
          scenes: made.map((scene) => ({ narration: scene.narration, image: scene.image })),
          language,
          gender: voice === "onyx" || voice === "echo" ? "male" : "female",
          rate: 0,
          aspect: aspect === "16:9" ? "landscape" : "shorts",
          audio_segments: audioSegments
        })
      });
      if (!response.ok) throw new Error("Python Render API (" + response.status + "): " + (await response.text()).slice(0, 500));
      const created = await response.json();
      setJobId(created.job_id);

      let completed = false;
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const check = await fetch(API_BASE + "/api/jobs/" + created.job_id);
        if (!check.ok) throw new Error("Render Job status دستیاب نہیں۔");
        const job = await check.json();
        setProgress(Math.max(65, Math.min(99, job.progress || 65)));
        setStatus(job.message || "ویڈیو بن رہی ہے…");
        if (job.status === "failed") throw new Error(job.message || "FFmpeg rendering ناکام ہوئی۔");
        if (job.status === "completed") {
          setVideoUrl(API_BASE + job.video);
          setThumbnailUrl(API_BASE + job.thumbnail);
          setProgress(100);
          setStatus("مکمل! MP4 ویڈیو تیار ہے۔");
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error("رینڈرنگ مقررہ وقت میں مکمل نہیں ہوئی۔");
    } catch (e) {
      setError(e.message || "ویڈیو تیار نہیں ہو سکی۔");
      setStatus("پروسیسنگ مکمل نہیں ہوئی۔");
    } finally {
      setBusy(false);
    }
  }

  async function uploadToYouTube() {
    if (!videoUrl || uploading) return;
    if (!youtubeToken.trim()) {
      setShowSettings(true);
      setError("YouTube OAuth Access Token درج کریں۔");
      return;
    }
    setUploading(true);
    setError("");
    try {
      setStatus("MP4 فائل حاصل کی جا رہی ہے…");
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) throw new Error("MP4 فائل سرور سے حاصل نہیں ہوئی۔");
      const blob = await videoResponse.blob();
      const metadata = {
        snippet: {
          title: (title.trim() || "SHER AI PRO Story Video").slice(0, 100),
          description: story.slice(0, 5000),
          categoryId: "24"
        },
        status: { privacyStatus: "private" }
      };
      const boundary = "sher_ai_pro_" + Date.now().toString(16);
      const crlf = "\r\n";
      const multipartBody = new Blob([
        "--" + boundary + crlf,
        "Content-Type: application/json; charset=UTF-8" + crlf + crlf,
        JSON.stringify(metadata) + crlf,
        "--" + boundary + crlf,
        "Content-Type: video/mp4" + crlf,
        "Content-Transfer-Encoding: binary" + crlf + crlf,
        blob,
        crlf + "--" + boundary + "--" + crlf
      ], { type: "multipart/related; boundary=" + boundary });
      setStatus("YouTube Data API v3 پر ویڈیو اپلوڈ ہو رہی ہے…");
      const response = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + youtubeToken.trim(),
            "Content-Type": "multipart/related; boundary=" + boundary
          },
          body: multipartBody
        }
      );
      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(result.error?.message || "YouTube اپلوڈ ناکام۔ OAuth token اور youtube.upload scope چیک کریں۔");
      setStatus("YouTube پر اپلوڈ مکمل۔ Video ID: " + result.id);
    } catch (e) {
      setError(e.message || "YouTube اپلوڈ ناکام ہوا۔");
      setStatus("YouTube اپلوڈ مکمل نہیں ہوا۔");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="story-app" dir="rtl">
      <header className="story-header">
        <div className="story-mark">✦</div>
        <div><h1>SHER AI PRO · STORY STUDIO</h1><p>Master Character Lock · OpenAI Media · Python FFmpeg</p></div>
        <button className="secondary" onClick={() => setShowSettings(!showSettings)}>سیٹنگز</button>
      </header>

      {showSettings && (
        <section className="story-panel">
          <h2>API سیٹنگز</h2>
          <label className="field-label" htmlFor="openai-key">OpenAI API Key</label>
          <input id="openai-key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          <label className="field-label" htmlFor="youtube-token">YouTube OAuth Access Token</label>
          <input id="youtube-token" type="password" autoComplete="off" value={youtubeToken} onChange={(e) => setYoutubeToken(e.target.value)} placeholder="OAuth access token" />
          <p className="notice">API keys مستقل طور پر محفوظ نہیں کیے جاتے۔ براؤزر سے براہِ راست OpenAI API استعمال کرنے میں آپ کی key آپ کے ڈیوائس/نیٹ ورک پر قابلِ مشاہدہ ہوتی ہے۔ YouTube کے لیے OAuth token میں youtube.upload scope ضروری ہے۔</p>
          <button className="primary" onClick={() => setShowSettings(false)}>بند کریں</button>
        </section>
      )}

      <section className="story-panel">
        <label className="field-label" htmlFor="story-text">اپنی مکمل کہانی پیسٹ کریں</label>
        <textarea id="story-text" value={story} onChange={(e) => setStory(e.target.value)} placeholder="یہاں مکمل اردو یا ہندی کہانی پیسٹ کریں…" />
        <div className="story-tools"><span>{story.length} حروف</span><button className="secondary" onClick={() => setStory("")}>صاف کریں</button></div>
      </section>

      <section className="story-panel">
        <div className="section-head"><h2>Master Character & Background Lock</h2><button className="secondary" onClick={resetProject}>نیا پروجیکٹ</button></div>
        <div className="format-row"><label htmlFor="video-title">ویڈیو ٹائٹل</label><input id="video-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="SHER AI PRO Story" /></div>
        <div className="format-row"><label htmlFor="mood">کہانی کا مزاج</label><select id="mood" value={mood} onChange={(e) => setMood(e.target.value)}><option>Cinematic & Emotional</option><option>Funny & Comedy</option><option>Horror & Dark Mystery</option><option>Action & Adventure</option></select></div>
        <div className="format-row"><label>Master Seed</label><b className="seed-value">{seed}</b></div>
        <label className="field-label" htmlFor="character-notes">کرداروں کی مستقل شکل اور لباس کی ہدایات</label>
        <textarea id="character-notes" value={characterNotes} onChange={(e) => setCharacterNotes(e.target.value)} placeholder="مرکزی کرداروں کے چہرے، بال، عمر، لباس اور ماحول کی تفصیل…" />
        <label className="field-label" htmlFor="visual-dna">محفوظ شدہ Visual DNA</label>
        <textarea id="visual-dna" value={visualDNA} onChange={(e) => setVisualDNA(e.target.value)} placeholder="پہلی مرتبہ AI خود Visual DNA تیار کرے گا؛ اگلے حصوں میں یہی برقرار رکھیں…" />
        <p className="notice">Seed اور Visual DNA اگلے حصوں کے لیے اس ڈیوائس پر محفوظ رہتے ہیں۔ یہ تسلسل بہتر کرتے ہیں، لیکن ٹیکسٹ پرامپٹ سے ہر تصویر میں چہرے کی 100% یکسانیت کی ضمانت ممکن نہیں۔</p>
        <div className="format-row"><label htmlFor="voice-language">آواز کی زبان</label><select id="voice-language" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ur-PK">اردو</option><option value="hi-IN">ہندی</option></select></div>
        <div className="format-row"><label htmlFor="voice-select">آواز</label><select id="voice-select" value={voice} onChange={(e) => setVoice(e.target.value)}><option value="shimmer">Shimmer</option><option value="nova">Nova</option><option value="alloy">Alloy</option><option value="onyx">Onyx</option><option value="echo">Echo</option><option value="fable">Fable</option></select></div>
        <div className="format-row"><label>ویڈیو سائز</label><div className="format-buttons"><button className={aspect === "16:9" ? "selected" : ""} onClick={() => setAspect("16:9")}>YouTube 16:9</button><button className={aspect === "9:16" ? "selected" : ""} onClick={() => setAspect("9:16")}>Shorts 9:16</button></div></div>
        <p className="notice">زیادہ سے زیادہ 30 مناظر فی رینڈر۔ ہر تصویر اور آواز کے لیے OpenAI API استعمال ہوگی، اس لیے استعمال کے مطابق API لاگت لگ سکتی ہے۔</p>
        <button className="primary main-action" onClick={buildAndRender} disabled={busy}>{busy ? "فلم تیار ہو رہی ہے…" : "🎬 Master Lock کے ساتھ MP4 بنائیں"}</button>
        <div className="progress-wrap"><div className="progress-label"><span>{status}</span><b>{progress}%</b></div><div className="progress"><i style={{ width: progress + "%" }} /></div></div>
      </section>

      {scenes.length > 0 && <section className="story-panel"><h2>مناظر ({scenes.length})</h2><div className="scene-strip">{scenes.map((scene) => <div className="scene-chip" key={scene.id}><b>{scene.id}</b><span>{scene.narration}</span><img src={scene.image} alt={"Scene " + scene.id} /></div>)}</div></section>}
      {error && <div className="error-box" role="alert">{error}</div>}
      {videoUrl && <section className="story-panel"><h2>تیار شدہ MP4 فلم</h2><video className="video-preview" src={videoUrl} controls playsInline /><a className="download-button" href={videoUrl} download="SHER-AI-PRO-Story.mp4">📥 MP4 ڈاؤن لوڈ کریں</a>{thumbnailUrl && <img className="thumbnail-preview" src={thumbnailUrl} alt="Video thumbnail" />}<button className="youtube-button" onClick={uploadToYouTube} disabled={uploading}>{uploading ? "YouTube اپلوڈ جاری ہے…" : "🚀 YouTube پر براہِ راست اپلوڈ کریں"}</button></section>}
      {jobId && <p className="job-note">Render Job ID: {jobId}</p>}
      <footer>OpenAI تصاویر اور وائس تیار کرتا ہے؛ موجودہ Python FFmpeg سرور MP4 بناتا ہے۔ مستقل Seed/Visual DNA کرداروں کی یکسانیت بہتر کرتے ہیں، اس کی مکمل ضمانت نہیں۔</footer>

      <style>{`
        *{box-sizing:border-box}.story-app{min-height:100vh;background:#090d16;color:#f6f2e9;padding:22px 14px 34px;font-family:system-ui,-apple-system,"Noto Sans Devanagari",sans-serif;max-width:850px;margin:auto}
        .story-header{display:flex;align-items:center;gap:13px;margin:8px auto 22px}.story-mark{width:48px;height:48px;flex:none;border-radius:16px;background:linear-gradient(140deg,#f1ce83,#9c6b2b);color:#14100a;display:grid;place-items:center;font-size:29px}.story-header h1{font-size:17px;letter-spacing:1px;margin:0;color:#f1ce83}.story-header p{margin:4px 0 0;color:#aeb7c8;font-size:12px}
        .story-panel{background:#121a29;border:1px solid #273247;border-radius:18px;padding:16px;margin:13px 0}.field-label{display:block;font-weight:700;margin:12px 0 8px}.story-panel textarea,.story-panel input,.story-panel select{width:100%;background:#090f1b;border:1px solid #344158;border-radius:10px;color:#fff;padding:12px;font:14px/1.7 system-ui;outline:none}.story-panel textarea{min-height:110px;resize:vertical}.story-panel textarea:focus,.story-panel input:focus,.story-panel select:focus{border-color:#d0a45e}
        .story-tools,.section-head,.format-row,.progress-label{display:flex;align-items:center;justify-content:space-between;gap:10px}.story-tools{margin-top:10px;color:#9ba8ba;font-size:12px}.section-head h2,.story-panel h2{font-size:16px;margin:0 0 12px}.format-row{margin-top:13px;padding-top:12px;border-top:1px solid #29354a;font-size:13px}.format-row>label{flex:1}.format-row select,.format-row input{max-width:58%}.seed-value{direction:ltr;color:#e6c58b}.primary,.secondary,.format-buttons button,.download-button,.youtube-button{border:0;border-radius:11px;padding:11px 15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:#d7b16d;color:#17120a}.secondary{background:#26354c;color:#e7edf6}.primary:disabled,.youtube-button:disabled{opacity:.55;cursor:wait}.main-action{width:100%;margin-top:16px;padding:15px}.format-buttons{display:flex;gap:6px}.format-buttons button{background:#27344a;color:#e5eaf1;padding:9px 11px;font-size:12px}.format-buttons button.selected{background:#d7b16d;color:#16120b}
        .notice{background:#302719;border:1px solid #725a35;color:#e9d4ae;border-radius:10px;padding:11px;font-size:12px;line-height:1.7;margin:14px 0}.progress-wrap{margin-top:16px}.progress-label{font-size:12px;color:#c7d0df}.progress-label span{overflow-wrap:anywhere}.progress{height:8px;background:#28364b;border-radius:20px;overflow:hidden;margin-top:8px}.progress i{display:block;height:100%;background:#d7b16d;transition:width .2s}.error-box{padding:12px;background:#4a2028;color:#ffdce0;border-radius:10px;margin:12px 0;overflow-wrap:anywhere}
        .video-preview{width:100%;max-height:65vh;background:#000;border-radius:12px}.download-button,.youtube-button{margin-top:12px;width:100%;background:#d7b16d;color:#17120a}.youtube-button{background:#d62839;color:#fff}.thumbnail-preview{width:100%;border-radius:10px;margin-top:14px}.scene-strip{display:grid;gap:9px}.scene-chip{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:center;background:#0b1220;border-radius:9px;padding:9px;font-size:12px;color:#dbe2ec}.scene-chip b{color:#d7b16d}.scene-chip span{overflow-wrap:anywhere}.scene-chip img{grid-column:1/-1;width:100%;max-height:240px;object-fit:contain;border-radius:8px}.job-note{text-align:center;color:#8391a7;font-size:10px}footer{text-align:center;color:#7f8da3;font-size:11px;line-height:1.7;padding:18px 8px}
        @media(min-width:650px){.story-app{padding:30px 24px}.story-panel{padding:22px}.story-header h1{font-size:20px}}
      `}</style>
    </main>
  );
}
