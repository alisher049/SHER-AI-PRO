import React, { useEffect, useMemo, useRef, useState } from "react";

const splitStory = (text) => text.split(/(?<=[.!?।])\s+|\n+/).map(x => x.trim()).filter(Boolean);
const esc = (s) => String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

export default function App() {
  const [story, setStory] = useState("");
  const [format, setFormat] = useState("landscape");
  const [scenes, setScenes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("اپنی ہندی کہانی یہاں پیسٹ کریں");
  const [voice, setVoice] = useState(true);
  const [voiceRate, setVoiceRate] = useState(0.92);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [exportType, setExportType] = useState("");
  const canvasRef = useRef(null);
  const stopRef = useRef(false);
  const sceneList = useMemo(() => scenes, [scenes]);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); if (audioUrl) URL.revokeObjectURL(audioUrl); }, [videoUrl, audioUrl]);

  function buildScenes() {
    setError("");
    const parts = splitStory(story);
    if (parts.length < 3) { setError("براہِ کرم کم از کم تین جملوں والی مکمل کہانی پیسٹ کریں۔"); return; }
    const made = parts.map((line, i) => ({
      id: i + 1,
      narration: line,
      caption: line,
      visual: "cinematic illustration, dramatic story scene, " + line.slice(0, 180),
      image: "https://image.pollinations.ai/prompt/" + encodeURIComponent("cinematic story illustration, dramatic atmospheric scene, no text, " + line.slice(0, 180)) + "?width=1280&height=720&nologo=true"
    }));
    setScenes(made);
    setVideoUrl("");
    setStatus(made.length + " مناظر تیار ہیں۔ اب ویڈیو بنائیں۔");
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : "ur-PK";
    u.rate = Number(voiceRate);
    const voices = window.speechSynthesis.getVoices();
    const chosen = voices.find(v => v.lang.toLowerCase().startsWith(u.lang.slice(0,2)));
    if (chosen) u.voice = chosen;
    window.speechSynthesis.speak(u);
  }

  function onAudioSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) { setError("براہِ کرم MP3 یا WAV آڈیو فائل منتخب کریں۔"); return; }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setAudioDuration(0);
    setError("");
  }

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawFrame(ctx, scene, img, index, total, w, h, time) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#101827"); g.addColorStop(1, "#422b38");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (img) {
      const scale = Math.max(w / img.width, h / img.height);
      const iw = img.width * scale, ih = img.height * scale;
      const drift = Math.sin(time * 0.6) * 12;
      ctx.drawImage(img, (w-iw)/2 + drift, (h-ih)/2, iw, ih);
      ctx.fillStyle = "rgba(4,8,16,.48)"; ctx.fillRect(0,0,w,h);
    } else {
      ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = "#d6ad63"; ctx.font = "bold 38px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("SCENE " + (index + 1), w/2, h/2 - 28);
    }
    const band = h * .25;
    ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(0, h-band, w, band);
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    const font = Math.max(20, Math.round(w * .026));
    ctx.font = "600 " + font + "px sans-serif";
    const words = scene.caption.split(/\s+/), lines = []; let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > w*.86 && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 3), lineH = font * 1.45;
    shown.forEach((t,i) => ctx.fillText(t, w/2, h-band/2 - ((shown.length-1)*lineH)/2 + i*lineH));
    ctx.fillStyle = "#e4bd75"; ctx.fillRect(0, h-8, w * ((index + 1) / total), 8);
  }

  async function exportVideo() {
    if (!sceneList.length || busy) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.captureStream || !window.MediaRecorder) {
      setError("اس براؤزر میں ویڈیو ریکارڈنگ سپورٹ نہیں۔ براہِ کرم تازہ Chrome استعمال کریں۔"); return;
    }
    setBusy(true); setError(""); setProgress(0); setVideoUrl("");
    stopRef.current = false;
    const w = format === "shorts" ? 720 : 1280, h = format === "shorts" ? 1280 : 720;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(24);
    let audioContext = null;
    let audioElement = null;
    let audioStream = null;
    if (audioUrl) {
      audioElement = new Audio(audioUrl);
      await new Promise((resolve, reject) => { audioElement.onloadedmetadata = resolve; audioElement.onerror = () => reject(new Error("آڈیو فائل نہیں کھل سکی۔")); audioElement.load(); });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      const source = audioContext.createMediaElementSource(audioElement);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);
      audioStream = destination.stream;
      audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
    }
    const mime = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(x => MediaRecorder.isTypeSupported(x)) || "";
    let recorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType:mime, videoBitsPerSecond:4500000 } : undefined);
    } catch (e) { setBusy(false); setError("ویڈیو ریکارڈر شروع نہیں ہو سکا: " + e.message); return; }
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    const finished = new Promise(resolve => { recorder.onstop = () => resolve(); });
    const sceneImages = await Promise.all(sceneList.map(scene => loadImage(scene.image)));
    recorder.start(500);
    try {
      if (audioElement) await audioElement.play();
      const totalChars = sceneList.reduce((sum, scene) => sum + Math.max(1, scene.narration.length), 0);
      for (let i=0; i<sceneList.length; i++) {
        if (stopRef.current) break;
        setStatus("منظر " + (i+1) + " / " + sceneList.length + " تیار ہو رہا ہے");
        const img = sceneImages[i];
        const duration = audioElement ? audioElement.duration * (Math.max(1, sceneList[i].narration.length) / totalChars) : Math.max(4, Math.min(8, Math.ceil(sceneList[i].narration.length / 18)));
        const start = audioElement ? audioElement.currentTime : performance.now() / 1000;
        while ((audioElement ? audioElement.currentTime - start : performance.now() / 1000 - start) < duration && !stopRef.current && (!audioElement || !audioElement.ended)) {
          const elapsed = audioElement ? audioElement.currentTime - start : performance.now() / 1000 - start;
          drawFrame(ctx, sceneList[i], img, i, sceneList.length, w, h, elapsed);
          await new Promise(r => setTimeout(r, 1000/24));
        }
        setProgress(Math.round(((i+1)/sceneList.length)*100));
      }
      if (audioElement && !stopRef.current) {
        while (!audioElement.ended && !stopRef.current) {
          drawFrame(ctx, sceneList[sceneList.length - 1], null, sceneList.length - 1, sceneList.length, w, h, audioElement.currentTime);
          await new Promise(r => setTimeout(r, 1000/24));
        }
      }
    } catch (e) { setError("ویڈیو بناتے ہوئے مسئلہ: " + e.message); }
    recorder.stop(); await finished; stream.getTracks().forEach(t=>t.stop());
    if (audioStream) audioStream.getTracks().forEach(t=>t.stop());
    if (audioContext && audioContext.state !== "closed") await audioContext.close();
    if (chunks.length) {
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url); setExportType("webm");
      setStatus(audioUrl ? "آواز اور ویڈیو تیار ہیں۔" : "خاموش ویڈیو تیار ہے۔");
    } else setError("ویڈیو فائل تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔");
    setBusy(false);
  }

  function stopExport() { stopRef.current = true; setStatus("ویڈیو بنانا روکا جا رہا ہے…"); }
  function previewStory() {
    if (!sceneList.length) return;
    const text = sceneList.map(x=>x.narration).join(" ");
    speakText(text);
  }

  return <main className="story-app" dir="rtl">
    <header className="story-header"><div className="story-mark">✦</div><div><h1>AI STORY VIDEO STUDIO</h1><p>کہانی پیسٹ کریں، ویڈیو تیار کریں</p></div><span className="free-tag">FREE-FIRST</span></header>
    <section className="story-panel">
      <label className="field-label" htmlFor="story-input">اپنی ہندی کہانی پیسٹ کریں</label>
      <textarea id="story-input" value={story} onChange={e=>setStory(e.target.value)} placeholder="यहाँ अपनी पूरी हिंदी कहानी पेस्ट करें…\n\nکہانی کے جملے اور پیراگراف ترتیب سے رکھیں۔" />
      <div className="story-tools"><span>{story.trim().length} حروف</span><button className="primary" onClick={buildScenes} disabled={!story.trim()}>مناظر تیار کریں</button></div>
    </section>
    {scenes.length>0 && <section className="story-panel">
      <div className="section-head"><h2>ویڈیو کی ترتیب</h2><span>{scenes.length} مناظر</span></div>
      <div className="scene-strip">{scenes.slice(0,8).map((s,i)=><div className="scene-chip" key={s.id}><b>{i+1}</b><span>{s.caption.slice(0,55)}{s.caption.length>55?"…":""}</span></div>)}{scenes.length>8&&<small>مزید {scenes.length-8} مناظر</small>}</div>
      <div className="audio-upload"><label htmlFor="narration-audio">ویڈیو میں اپنی تیار کردہ آواز شامل کریں (MP3 / WAV)</label><input id="narration-audio" type="file" accept="audio/*" onChange={onAudioSelected} />{audioUrl && <audio src={audioUrl} controls onLoadedMetadata={e => setAudioDuration(e.currentTarget.duration)} />} {audioUrl && <small>آڈیو منتخب ہے: {Math.round(audioDuration)} سیکنڈ</small>}</div>
      <div className="format-row"><label>ویڈیو فارمیٹ</label><div className="format-buttons"><button className={format==="landscape"?"selected":""} onClick={()=>setFormat("landscape")}>YouTube 16:9</button><button className={format==="shorts"?"selected":""} onClick={()=>setFormat("shorts")}>Shorts 9:16</button></div></div>
      <div className="format-row"><label><input type="checkbox" checked={voice} onChange={e=>setVoice(e.target.checked)}/> ہندی آواز کا پیش نظارہ</label><select value={voiceRate} onChange={e=>setVoiceRate(e.target.value)}><option value=".82">آہستہ</option><option value=".92">قدرتی</option><option value="1.05">تیز</option></select></div>
      <p className="notice">اپنی narration MP3/WAV شامل کریں تو آواز ویڈیو میں شامل ہوگی۔ فائل شامل نہ کرنے پر ویڈیو خاموش ہوگی؛ براؤزر کا "کہانی سنیں" پیش نظارہ ڈاؤن لوڈ میں ریکارڈ نہیں ہوتا۔ فی الحال برآمد WebM ہے، MP4 نہیں۔</p>
      <div className="action-row"><button className="primary" onClick={exportVideo} disabled={busy}>{busy?"ویڈیو بن رہی ہے…":"ویڈیو بنائیں"}</button>{busy&&<button className="stop" onClick={stopExport}>روکیں</button>}{voice&&<button className="secondary" onClick={previewStory}>کہانی سنیں</button>}</div>
      {busy&&<div className="progress-wrap"><div className="progress-label"><span>{status}</span><b>{progress}%</b></div><div className="progress"><i style={{width:progress+"%"}}/></div></div>}
    </section>}
    {error&&<div className="error-box">{error}</div>}
    {videoUrl&&<section className="story-panel"><h2>ویڈیو کا پیش نظارہ</h2><video className="video-preview" src={videoUrl} controls playsInline/><a className="download-button" href={videoUrl} download={"story-video-"+Date.now()+".webm"}>ویڈیو ڈاؤن لوڈ کریں</a></section>}
    <canvas ref={canvasRef} className="render-canvas" />
    <footer>آپ کی کہانی آپ کے آلے پر تیار ہوتی ہے۔ بہتر نتائج کے لیے Chrome اور مستحکم انٹرنیٹ استعمال کریں۔</footer>
    <style>{`
      *{box-sizing:border-box}.story-app{min-height:100vh;background:#090d16;color:#f6f2e9;padding:22px 14px 34px;font-family:system-ui,-apple-system,"Noto Sans Devanagari",sans-serif;max-width:850px;margin:auto}
      .story-header{display:flex;align-items:center;gap:13px;margin:8px auto 22px}.story-mark{width:48px;height:48px;border-radius:16px;background:linear-gradient(140deg,#f1ce83,#9c6b2b);color:#14100a;display:grid;place-items:center;font-size:29px}.story-header h1{font-size:17px;letter-spacing:1px;margin:0;color:#f1ce83}.story-header p{margin:4px 0 0;color:#aeb7c8;font-size:13px}.free-tag{margin-inline-start:auto;font-size:10px;color:#d8bd88;border:1px solid #6c5838;border-radius:20px;padding:5px 8px}
      .story-panel{background:#121a29;border:1px solid #273247;border-radius:18px;padding:16px;margin:13px 0}.field-label{display:block;font-weight:700;margin-bottom:10px}.story-panel textarea{width:100%;min-height:230px;background:#090f1b;border:1px solid #344158;border-radius:12px;color:#fff;padding:14px;font:16px/1.8 system-ui;resize:vertical;outline:none}.story-panel textarea:focus{border-color:#d0a45e}.story-tools,.section-head,.format-row,.action-row,.progress-label{display:flex;align-items:center;justify-content:space-between;gap:10px}.story-tools{margin-top:12px;color:#9ba8ba;font-size:12px}.primary,.secondary,.stop,.format-buttons button,.download-button{border:0;border-radius:11px;padding:12px 16px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:#d7b16d;color:#17120a}.primary:disabled{opacity:.55;cursor:wait}.secondary{background:#26354c;color:#e7edf6}.stop{background:#7b3038;color:#fff}.section-head h2,.story-panel h2{font-size:16px;margin:0 0 12px}.section-head span{font-size:12px;color:#d7b16d}.scene-strip{display:grid;gap:7px}.scene-chip{display:flex;gap:10px;align-items:center;background:#0b1220;border-radius:9px;padding:9px;font-size:12px;color:#dbe2ec}.scene-chip b{color:#d7b16d}.scene-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scene-strip small{color:#9aa8bc}.format-row{margin-top:16px;padding-top:13px;border-top:1px solid #29354a;font-size:13px}.format-buttons{display:flex;gap:6px}.format-buttons button{background:#27344a;color:#e5eaf1;padding:9px 11px;font-size:12px}.format-buttons button.selected{background:#d7b16d;color:#16120b}.format-row select{background:#26354c;color:white;border:0;padding:8px;border-radius:8px}.audio-upload{display:grid;gap:8px;margin-top:15px;padding-top:13px;border-top:1px solid #29354a;font-size:12px;color:#d9e2ef}.audio-upload input{width:100%;font-size:12px}.audio-upload audio{width:100%;height:38px}.audio-upload small{color:#9dd8b4}.notice{background:#302719;border:1px solid #725a35;color:#e9d4ae;border-radius:10px;padding:11px;font-size:12px;line-height:1.7;margin:15px 0}.action-row{justify-content:flex-start;flex-wrap:wrap;margin-top:15px}.progress-wrap{margin-top:16px}.progress-label{font-size:12px;color:#c7d0df}.progress{height:8px;background:#28364b;border-radius:20px;overflow:hidden;margin-top:8px}.progress i{display:block;height:100%;background:#d7b16d;transition:width .2s}.error-box{padding:12px;background:#4a2028;color:#ffdce0;border-radius:10px;margin:12px 0}.video-preview{width:100%;max-height:65vh;background:#000;border-radius:12px}.download-button{margin-top:12px;background:#d7b16d;color:#17120a;width:100%}.render-canvas{position:fixed;left:-10000px;top:0;width:1px;height:1px}footer{text-align:center;color:#7f8da3;font-size:11px;line-height:1.7;padding:18px 8px}@media(min-width:650px){.story-app{padding:30px 24px}.story-panel{padding:22px}.story-header h1{font-size:20px}}
    `}</style>
  </main>;
}
