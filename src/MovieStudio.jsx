import React,{useMemo,useState} from "react";

const DURATIONS=[15,30,60,90,150];

export default function MovieStudio({session}){
 const [story,setStory]=useState("");
 const [minutes,setMinutes]=useState(15);
 const [stage,setStage]=useState(1);
 const [busy,setBusy]=useState(false);
 const [scenes,setScenes]=useState([]);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const [title,setTitle]=useState("");
 const sceneCount=useMemo(()=>Math.ceil(minutes*60/12),[minutes]);

 async function prepareStory(){
  if(!story.trim())return;
  setBusy(true);setError("");setStatus("کہانی کا خاکہ اور مناظر تیار کیے جا رہے ہیں…");
  try{
   const prompt="Create a detailed original Urdu-language film storyboard based on this story. Target duration: "+minutes+" minutes. Return strict JSON only: {title:string, scenes:[{title:string,narration:string,subtitle:string,visual:string}]} . Create a compact but complete scene plan (up to 60 scenes), with coherent character descriptions repeated consistently in visual descriptions. Do not claim to render a video. Story:\n"+story.slice(0,14000);
   const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({language:"Urdu",messages:[{role:"user",parts:[{text:prompt}]}]})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"کہانی تیار نہیں ہو سکی");
   const raw=String(d.text||"").replace(/```json/gi,"").replace(/```/g,"").trim();
   const parsed=JSON.parse(raw);
   if(!Array.isArray(parsed.scenes)||!parsed.scenes.length)throw Error("AI سے درست مناظر موصول نہیں ہوئے");
   setTitle(String(parsed.title||"میری کہانی"));
   setScenes(parsed.scenes.slice(0,60).map((x,i)=>({title:String(x.title||"منظر "+(i+1)),narration:String(x.narration||""),subtitle:String(x.subtitle||x.narration||""),visual:String(x.visual||"")})));
   setStage(4);setStatus("کہانی کا اسکرپٹ اور منظرنامہ تیار ہے۔");
  }catch(e){setError(e.message||"کوئی خرابی پیش آئی");setStatus("")}
  finally{setBusy(false)}
 }
 function downloadPlan(){
  const payload={title,duration_minutes:minutes,scenes,notice:"یہ منظرنامہ/اسکرپٹ ہے، MP4 ویڈیو نہیں۔"};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sher-ai-movie-storyboard.json";a.click();URL.revokeObjectURL(url);
 }
 const steps=["کہانی پیسٹ کریں","دورانیہ منتخب کریں","فلم کا خاکہ تیار کریں","فائل حاصل کریں"];
 return <main className="movie-studio">
  <div className="movie-studio-head"><div className="movie-studio-mark">🎬</div><div><span className="movie-eyebrow">SHER AI PRO</span><h2>AI Movie Studio</h2><p>اپنی کہانی کو چار آسان مراحل میں تیار کریں</p></div></div>
  <div className="movie-stepper">{steps.map((x,i)=><div className={"movie-step "+(stage===i+1?"active":stage>i+1?"done":"")} key={x}><span>{stage>i+1?"✓":i+1}</span><small>{x}</small></div>)}</div>
  <section className="movie-panel">
   <div className="movie-panel-title"><span>مرحلہ {stage}</span><h3>{steps[stage-1]}</h3></div>
   {stage===1&&<><label className="movie-label" htmlFor="movie-story">اپنی مکمل کہانی یہاں پیسٹ کریں</label><textarea id="movie-story" className="movie-story-input" value={story} onChange={e=>setStory(e.target.value)} placeholder="یہاں اپنی کہانی لکھیں یا پیسٹ کریں…" rows={9}/><div className="movie-meta">{story.trim().length.toLocaleString()} حروف</div><button className="movie-primary" disabled={!story.trim()} onClick={()=>setStage(2)}>اگلا مرحلہ <span>←</span></button></>}
   {stage===2&&<><p className="movie-help">آپ اپنی فلم کا دورانیہ منتخب کریں۔</p><div className="movie-duration-grid">{DURATIONS.map(n=><button type="button" key={n} className={minutes===n?"selected":""} onClick={()=>setMinutes(n)}><b>{n}</b><small>منٹ</small></button>)}</div><div className="movie-selection">منتخب دورانیہ: <b>{minutes} منٹ</b></div><div className="movie-actions"><button className="movie-secondary" onClick={()=>setStage(1)}>واپس</button><button className="movie-primary" onClick={()=>setStage(3)}>اگلا مرحلہ ←</button></div></>}
   {stage===3&&<><div className="movie-summary"><div><small>کہانی</small><b>{story.trim().slice(0,90)}{story.trim().length>90?"…":""}</b></div><div><small>منتخب دورانیہ</small><b>{minutes} منٹ</b></div><div><small>منظرنامے کا ہدف</small><b>{sceneCount} مختصر مناظر تک</b></div></div><p className="movie-notice">اس مرحلے میں اے آئی کہانی کا اسکرپٹ، کرداروں کی تفصیل اور مناظر کا خاکہ تیار کرے گا۔ مکمل ویڈیو رینڈرنگ ابھی منسلک نہیں ہے۔</p><div className="movie-actions"><button className="movie-secondary" disabled={busy} onClick={()=>setStage(2)}>واپس</button><button className="movie-primary" disabled={busy} onClick={prepareStory}>{busy?"تیاری جاری ہے…":"کہانی تیار کریں ✨"}</button></div>{status&&<p className="movie-status">{status}</p>}</>}
   {stage===4&&<><div className="movie-ready"><span>✓</span><h3>{title||"آپ کی کہانی"}</h3><p>اسکرپٹ اور {scenes.length} مناظر کا خاکہ تیار ہے۔</p></div><div className="movie-notice">اہم وضاحت: فی الحال ڈاؤن لوڈ ہونے والی فائل کہانی کا منظرنامہ ہے، تیار شدہ MP4 فلم نہیں۔ ویڈیو رینڈرنگ اور گیلری میں MP4 محفوظ کرنے کا نظام ابھی بنانا باقی ہے۔</div><div className="movie-actions"><button className="movie-secondary" onClick={()=>setStage(1)}>نئی کہانی</button><button className="movie-primary" onClick={downloadPlan}><span>⬇</span> منظرنامہ ڈاؤن لوڈ کریں</button></div><div className="movie-scene-list"><h4>تیار شدہ مناظر</h4>{scenes.map((x,i)=><article key={i}><b>{i+1}. {x.title}</b><p>{x.narration}</p><small>{x.visual}</small></article>)}</div></>}
   {error&&<p className="movie-error" role="alert">{error}</p>}
  </section>
  <p className="movie-footnote">یہ اسٹوڈیو موبائل اسکرین کے مطابق بنایا گیا ہے۔ طویل فلم کی اصل ویڈیو فائل کے لیے اگلے مرحلے میں رینڈرنگ انجن درکار ہوگا۔</p>
 </main>;
}
