import React, { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_RENDER_API_URL || "").replace(/\/+$/, "");
const splitStory = (text) => text.split(/(?<=[.!?।؟])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const randomSeed = () => String(Math.floor(100000 + Math.random() * 900000));

export default function StoryVideoStudio() {
  const [story, setStory] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [mood, setMood] = useState("Drama");
  const [partNumber, setPartNumber] = useState("1");
  const [format, setFormat] = useState("landscape");
  const [language, setLanguage] = useState("hi-IN");
  const [gender, setGender] = useState("female");
  const [rate, setRate] = useState("0");
  const [seed, setSeed] = useState(() => localStorage.getItem("sher_locked_seed") || randomSeed());
  const [characterProfile, setCharacterProfile] = useState(() => localStorage.getItem("sher_locked_char") || "");
  const [lookLocked, setLookLocked] = useState(() => localStorage.getItem("sher_look_locked") !== "false");
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("اپنی کہانی پیسٹ کریں");
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [jobId, setJobId] = useState("");

  const sceneList = useMemo(() => scenes, [scenes]);

  useEffect(() => { localStorage.setItem("sher_locked_seed", seed); }, [seed]);
  useEffect(() => { localStorage.setItem("sher_locked_char", characterProfile); }, [characterProfile]);
  useEffect(() => { localStorage.setItem("sher_look_locked", String(lookLocked)); }, [lookLocked]);
  useEffect(() => () => {
    if (videoUrl.startsWith("blob:")) URL.revokeObjectURL(videoUrl);
    if (thumbnailUrl.startsWith("blob:")) URL.revokeObjectURL(thumbnailUrl);
  }, [videoUrl, thumbnailUrl]);

  function resetProject() {
    const nextSeed = randomSeed();
    setSeed(nextSeed);
    setCharacterProfile("");
    setPartNumber("1");
    setStory("");
    setVideoTitle("");
    setScenes([]);
    setVideoUrl("");
    setThumbnailUrl("");
    setJobId("");
    setError("");
    setStatus("نیا پروجیکٹ اور نیا Character Seed تیار ہے۔");
  }

  async function pasteStory() {
    try {
      if (!navigator.clipboard?.readText) throw new Error("Clipboard اجازت نہیں۔ کہانی کے خانے میں دیر تک دبائیں اور Paste منتخب کریں۔");
      const value = await navigator.clipboard.readText();
      if (!value.trim()) throw new Error("کلپ بورڈ خالی ہے۔");
      setStory(value);
      setError("");
    } catch (e) { setError(e.message || "کہانی پیسٹ نہیں ہو سکی۔"); }
  }

  function buildScenes() {
    setError("");
    const parts = splitStory(story);
    if (parts.length < 3) { setError("کم از کم تین جملوں والی کہانی درج کریں۔"); return; }
    const visualGuide = characterProfile.trim()
      ? "Recurring character and art direction: " + characterProfile.trim() + ". "
      : "Keep recurring characters visually coherent; cinematic illustrated story style. ";
    const moodGuide = "Mood: " + mood + ". ";
    const made = parts.slice(0, 60).map((line, i) => {
      const prompt = visualGuide + moodGuide + "Scene: " + line.slice(0, 260) + ". Consistent visual identity, no text, no watermark.";
      const image = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
        "?width=" + (format === "landscape" ? "1280" : "720") +
        "&height=" + (format === "landscape" ? "720" : "1280") +
        "&seed=" + encodeURIComponent(seed) + "&nologo=true";
      return { id: i + 1, narration: line, caption: line, image };
    });
    setScenes(made);
    setVideoUrl("");
    setThumbnailUrl("");
    setJobId("");
    setStatus(made.length + " مناظر تیار ہیں۔ اب آواز اور MP4 بنائیں۔");
  }

  async function exportVideo() {
    if (!sceneList.length || busy) return;
    if (!API_BASE) {
      setError("FFmpeg سرور منسلک نہیں۔ Vercel میں VITE_RENDER_API_URL کو اپنے فعال Render سروس URL پر سیٹ کرکے دوبارہ Deploy کریں۔");
      return;
    }
    setBusy(true);
    setError("");
    setProgress(1);
    setVideoUrl("");
    setThumbnailUrl("");
    try {
      setStatus("کہانی اور مناظر رینڈر سرور کو بھیجے جا رہے ہیں…");
      const response = await fetch(API_BASE + "/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: story,
          scenes: sceneList.map((s) => ({ narration: s.narration, image: s.image })),
          language, gender, rate: Number(rate),
          aspect: format
        })
      });
      if (!response.ok) throw new Error("سرور نے درخواست قبول نہیں کی (" + response.status + "): " + (await response.text()).slice(0, 300));
      const created = await response.json();
      setJobId(created.job_id);
      let completed = false;
      for (let i = 0; i < 900; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        const check = await fetch(API_BASE + "/api/jobs/" + created.job_id);
        if (!check.ok) throw new Error("رینڈر جاب کا اسٹیٹس دستیاب نہیں۔ سرور ری اسٹارٹ ہوا ہو سکتا ہے۔");
        const job = await check.json();
        setProgress(job.progress || 0);
        setStatus(job.message || "ویڈیو بن رہی ہے…");
        if (job.status === "failed") throw new Error(job.message || "رینڈرنگ ناکام ہو گئی۔");
        if (job.status === "completed") {
          setVideoUrl(API_BASE + job.video);
          setThumbnailUrl(API_BASE + job.thumbnail);
          setProgress(100);
          setStatus("MP4 ویڈیو اور تھمب نیل تیار ہیں۔");
          completed = true;
          break;
        }
      }
      if (!completed) throw new Error("رینڈرنگ مقررہ وقت میں مکمل نہیں ہوئی۔ Render لاگز اور مفت پلان کی حدود چیک کریں۔");
    } catch (e) {
      setError(e.message || "ویڈیو تیار نہیں ہو سکی۔");
    } finally { setBusy(false); }
  }

  return <main className="story-app" dir="rtl">
    <header className="story-header">
      <div className="story-mark">✦</div>
      <div><h1>SHER AI PRO · STORY STUDIO</h1><p>کہانی، خودکار اردو/ہندی آواز اور MP4 ویڈیو</p></div>
      <span className="free-tag">FREE-FIRST</span>
    </header>

    <section className="story-panel">
      <label className="field-label" htmlFor="story-input">اپنی کہانی پیسٹ کریں</label>
      <textarea id="story-input" value={story} onChange={(e) => setStory(e.target.value)} placeholder="یہاں اپنی مکمل ہندی یا اردو کہانی پیسٹ کریں…" />
      <div className="story-tools"><span>{story.trim().length} حروف</span><div className="story-tools-actions">
        <button className="secondary" onClick={pasteStory}>Paste</button>
        <button className="primary" onClick={buildScenes} disabled={!story.trim()}>مناظر تیار کریں</button>
      </div></div>
    </section>

    <section className="story-panel">
      <div className="section-head"><h2>پروجیکٹ اور کردار کا لاک</h2><button className="secondary" onClick={resetProject}>نیا پروجیکٹ</button></div>
      <div className="format-row"><label htmlFor="story-title">ویڈیو کا عنوان</label><input id="story-title" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="اختیاری عنوان" /></div>
      <div className="format-row"><label htmlFor="part-number">پارٹ نمبر</label><select id="part-number" value={partNumber} onChange={(e) => setPartNumber(e.target.value)}><option value="1">پارٹ 1</option><option value="2">پارٹ 2</option><option value="3">پارٹ 3</option></select></div>
      <div className="format-row"><label htmlFor="mood">کہانی کا مزاج</label><select id="mood" value={mood} onChange={(e) => setMood(e.target.value)}><option>Funny & Comedy</option><option>Drama</option><option>Horror & Mystery</option><option>Action & Adventure</option><option>Emotional</option></select></div>
      <div className="format-row"><label>Character Seed</label><b className="seed-value">{seed}</b></div>
      <div className="format-row"><label htmlFor="character-profile">کرداروں کی مستقل شکل، لباس اور ماحول</label><label className="lock-toggle"><input type="checkbox" checked={lookLocked} onChange={(e) => setLookLocked(e.target.checked)} /> لاک</label></div>
      <textarea id="character-profile" value={characterProfile} onChange={(e) => setCharacterProfile(e.target.value)} disabled={lookLocked} placeholder="مثلاً: مرکزی کردار 30 سالہ، گھنے سیاہ بال، نیلا کوٹ، گول چہرہ؛ مستقل رنگ اور ماحول…" />
      <p className="notice">Seed اور ایک ہی visual guide ہر منظر کے prompt میں استعمال ہوتے ہیں۔ یہ یکسانیت بہتر کرنے کی کوشش ہے، مگر AI تصویر بنانے والی سروس ہر بار بالکل ایک جیسا چہرہ آنے کی ضمانت نہیں دیتی۔ پارٹ 2 یا 3 میں وہی Seed اور کرداروں کی تفصیل برقرار رکھیں۔</p>
    </section>

    {scenes.length > 0 && <section className="story-panel">
      <div className="section-head"><h2>ویڈیو کی ترتیب</h2><span>{scenes.length} مناظر</span></div>
      <div className="scene-strip">{scenes.slice(0, 8).map((s, i) => <div className="scene-chip" key={s.id}><b>{i + 1}</b><span>{s.caption.slice(0, 55)}{s.caption.length > 55 ? "…" : ""}</span></div>)}{scenes.length > 8 && <small>مزید {scenes.length - 8} مناظر</small>}</div>
      <div className="format-row"><label htmlFor="voice-language">آواز کی زبان</label><select id="voice-language" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="hi-IN">ہندی</option><option value="ur-PK">اردو</option></select></div>
      <div className="format-row"><label htmlFor="voice-gender">آواز</label><select id="voice-gender" value={gender} onChange={(e) => setGender(e.target.value)}><option value="female">خاتون</option><option value="male">مرد</option></select></div>
      <div className="format-row"><label htmlFor="voice-rate">رفتار</label><select id="voice-rate" value={rate} onChange={(e) => setRate(e.target.value)}><option value="-15">آہستہ</option><option value="0">قدرتی</option><option value="12">تیز</option></select></div>
      <div className="format-row"><label>ویڈیو سائز</label><div className="format-buttons"><button className={format === "landscape" ? "selected" : ""} onClick={() => setFormat("landscape")}>YouTube 16:9</button><button className={format === "shorts" ? "selected" : ""} onClick={() => setFormat("shorts")}>Shorts 9:16</button></div></div>
      <p className="notice">آواز سرور پر خودکار طور پر بنے گی اور FFmpeg اسے MP4 میں شامل کرے گا۔ الگ MP3/WAV فائل اپ لوڈ نہیں کرنی پڑے گی۔</p>
      <div className="action-row"><button className="primary" onClick={exportVideo} disabled={busy}>{busy ? "ویڈیو بن رہی ہے…" : "آواز اور MP4 ویڈیو بنائیں"}</button></div>
      {busy && <div className="progress-wrap"><div className="progress-label"><span>{status}</span><b>{progress}%</b></div><div className="progress"><i style={{ width: progress + "%" }} /></div></div>}
    </section>}

    {error && <div className="error-box" role="alert">{error}</div>}
    {videoUrl && <section className="story-panel">
      <h2>{videoTitle.trim() || "پارٹ " + partNumber + " کی تیار شدہ ویڈیو"}</h2>
      <video className="video-preview" src={videoUrl} controls playsInline />
      <a className="download-button" href={videoUrl} download={"SHER-AI-Story-Part-" + partNumber + ".mp4"}>ویڈیو ڈاؤن لوڈ کریں (MP4)</a>
      {thumbnailUrl && <><img className="thumbnail-preview" src={thumbnailUrl} alt="Story thumbnail" /><a className="download-button secondary-download" href={thumbnailUrl} download="SHER-AI-Thumbnail.jpg">تھمب نیل ڈاؤن لوڈ کریں</a></>}
    </section>}
    {jobId && <p className="job-note">Render Job ID: {jobId}</p>}
    <footer>ویڈیو FFmpeg سرور پر تیار ہوتی ہے۔ Character Seed اور Visual Guide محفوظ رہتے ہیں؛ حتمی کردار کی یکسانیت تصویر بنانے والی سروس پر بھی منحصر ہے۔</footer>

    <style>{`
      *{box-sizing:border-box}.story-app{min-height:100vh;background:#090d16;color:#f6f2e9;padding:22px 14px 34px;font-family:system-ui,-apple-system,"Noto Sans Devanagari",sans-serif;max-width:850px;margin:auto}
      .story-header{display:flex;align-items:center;gap:13px;margin:8px auto 22px}.story-mark{width:48px;height:48px;border-radius:16px;background:linear-gradient(140deg,#f1ce83,#9c6b2b);color:#14100a;display:grid;place-items:center;font-size:29px}.story-header h1{font-size:17px;letter-spacing:1px;margin:0;color:#f1ce83}.story-header p{margin:4px 0 0;color:#aeb7c8;font-size:13px}.free-tag{margin-inline-start:auto;font-size:10px;color:#d8bd88;border:1px solid #6c5838;border-radius:20px;padding:5px 8px}
      .story-panel{background:#121a29;border:1px solid #273247;border-radius:18px;padding:16px;margin:13px 0}.field-label{display:block;font-weight:700;margin-bottom:10px}.story-panel textarea{width:100%;min-height:150px;background:#090f1b;border:1px solid #344158;border-radius:12px;color:#fff;padding:14px;font:15px/1.8 system-ui;resize:vertical;outline:none}.story-panel textarea:focus{border-color:#d0a45e}.story-tools,.section-head,.format-row,.action-row,.progress-label{display:flex;align-items:center;justify-content:space-between;gap:10px}.story-tools{margin-top:12px;color:#9ba8ba;font-size:12px}.story-tools-actions{display:flex;gap:8px}.primary,.secondary,.format-buttons button,.download-button{border:0;border-radius:11px;padding:11px 15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:#d7b16d;color:#17120a}.primary:disabled{opacity:.55;cursor:wait}.secondary{background:#26354c;color:#e7edf6}.section-head h2,.story-panel h2{font-size:16px;margin:0 0 12px}.seed-value{direction:ltr;color:#e6c58b}.lock-toggle{display:flex;align-items:center;gap:7px}.format-row{margin-top:14px;padding-top:12px;border-top:1px solid #29354a;font-size:13px}.format-row select,.format-row input:not([type=checkbox]){max-width:58%;background:#26354c;color:white;border:1px solid #40506a;padding:9px;border-radius:8px}.story-panel textarea:disabled{opacity:.72}.format-buttons{display:flex;gap:6px}.format-buttons button{background:#27344a;color:#e5eaf1;padding:9px 11px;font-size:12px}.format-buttons button.selected{background:#d7b16d;color:#16120b}.notice{background:#302719;border:1px solid #725a35;color:#e9d4ae;border-radius:10px;padding:11px;font-size:12px;line-height:1.7;margin:15px 0}.action-row{justify-content:flex-start;flex-wrap:wrap;margin-top:15px}.progress-wrap{margin-top:16px}.progress-label{font-size:12px;color:#c7d0df}.progress{height:8px;background:#28364b;border-radius:20px;overflow:hidden;margin-top:8px}.progress i{display:block;height:100%;background:#d7b16d;transition:width .2s}.error-box{padding:12px;background:#4a2028;color:#ffdce0;border-radius:10px;margin:12px 0}.video-preview{width:100%;max-height:65vh;background:#000;border-radius:12px}.download-button{margin-top:12px;background:#d7b16d;color:#17120a;width:100%}.secondary-download{background:#26354c;color:#fff}.thumbnail-preview{width:100%;border-radius:10px;margin-top:14px}.scene-strip{display:grid;gap:7px}.scene-chip{display:flex;gap:10px;align-items:center;background:#0b1220;border-radius:9px;padding:9px;font-size:12px;color:#dbe2ec}.scene-chip b{color:#d7b16d}.scene-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scene-strip small{color:#9aa8bc}.job-note{text-align:center;color:#8391a7;font-size:10px}footer{text-align:center;color:#7f8da3;font-size:11px;line-height:1.7;padding:18px 8px}@media(min-width:650px){.story-app{padding:30px 24px}.story-panel{padding:22px}.story-header h1{font-size:20px}}
    `}</style>
  </main>;
}
