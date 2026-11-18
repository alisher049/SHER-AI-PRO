import React,{useState} from "react";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "./movieStudioUtils.js";



export default function MovieStudio({session}){
 const [story,setStory]=useState("");
 const [minutes,setMinutes]=useState(15);
 const [stage,setStage]=useState(1);
 const [busy,setBusy]=useState(false);
 const [scenes,setScenes]=useState([]);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const [title,setTitle]=useState("");

 async function prepareStory(){
  if(!story.trim()||busy)return;
  setBusy(true);setError("");setStatus("آپ کی کہانی کا اسکرپٹ اور کرداروں کا خاکہ تیار ہو رہا ہے…");
  try{
   const instruction="اہم: صارف پہلے سے اپنی مکمل کہانی دے رہا ہے۔ آپ نئی کہانی، نیا پلاٹ، نیا کردار، نیا موڑ، نیا انجام یا غیر متعلقہ واقعہ ہرگز ایجاد نہ کریں۔ صارف کے واقعات، کرداروں کے رشتے، ترتیب، مقصد اور انجام کو جوں کا توں بنیاد بنائیں۔ صرف فلمی پیشکش کے لیے منظر بندی، کیمرہ، مکالمے کی ادائیگی، ماحول اور کہانی کے اندر منطقی رابطہ واضح کریں؛ جہاں کہانی میں معلومات موجود نہ ہوں وہاں قیاس کو حقیقت بنا کر شامل نہ کریں، بلکہ visual میں غیر متعین لکھیں۔ "+minutes+" منٹ کی فلم کو بالکل 4 برابر حصوں میں تقسیم کریں، ہر حصہ "+(minutes/4)+" منٹ کا ہو؛ چاروں حصوں کے درمیان وقت، مقام، واقعات اور کرداروں کا تسلسل لازماً برقرار رکھیں۔ پہلے Character Bible بنائیں: ہر کردار کا مستقل نام، عمر، چہرہ، جلد، بال، قد، جسمانی ساخت، لباس، آواز، لہجہ، عادتیں، چلنے، بیٹھنے، اشاروں اور جذبات ظاہر کرنے کا انداز۔ پھر ہر منظر میں انہی شناختی تفصیلات کو حرف بہ حرف برقرار رکھیں؛ تبدیلی صرف اسی صورت میں جب اصل کہانی میں اس کی واضح وجہ اور وقت ہو۔ ہر منظر کے لیے part نمبر، وقت کی حد، عنوان، موجود کردار، مقام، دن/رات، لباس، جسمانی ایکشن، مکالمہ/narration، subtitle، visual اور پچھلے منظر سے continuity لکھیں۔ JSON میں title، character_bible، four_parts (بالکل چار عناصر)، scenes دیں۔ ہر scene میں یہ fields ہوں: part، start_minute، end_minute، title، characters، location، time_of_day، wardrobe، action، narration، subtitle، visual، continuity. ہر حصے کا دورانیہ برابر اور مناظر کی ٹائم لائن مسلسل ہو۔ صرف درست JSON واپس کریں، Markdown نہیں۔ یہ صرف تحریری منصوبہ ہے، MP4 فلم نہیں۔ اصل کہانی:\\n"+story.slice(0,14000);
   const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({language:"Urdu",messages:[{role:"user",parts:[{text:instruction}]}]})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"کہانی تیار نہیں ہو سکی");
   const parsed=parseStoryboardResponse(d.text);
   setTitle(parsed.title);
   setScenes(parsed.scenes);
   setStage(4);setStatus("آپ کا تحریری فلمی منصوبہ تیار ہے۔");
  }catch(e){setError(e.message||"کوئی خرابی پیش آئی");setStatus("")}
  finally{setBusy(false)}
 }
 function saveFile(filename,type,content){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 function downloadText(){
  const text=buildScriptText(title,minutes,scenes);
  saveFile("sher-ai-film-script.txt","text/plain;charset=utf-8",text);
 }
 function downloadJson(){
  saveFile("sher-ai-film-storyboard.json","application/json;charset=utf-8",buildStoryboardJson(title,minutes,scenes));
 }
 function resetStudio(){setStory("");setMinutes(15);setScenes([]);setTitle("");setError("");setStatus("");setStage(1)}
 const steps=["کہانی پیسٹ کریں","دورانیہ منتخب کریں","فلم کا خاکہ تیار کریں","فائل حاصل کریں"];
 return <main className="movie-studio" dir="rtl">
  <div className="movie-studio-head"><div className="movie-studio-mark">🎬</div><div><span className="movie-eyebrow">SHER AI PRO</span><h2>AI Movie Studio</h2><p>اپنی کہانی کو چار آسان مراحل میں تیار کریں</p></div></div>
  <div className="movie-stepper">{steps.map((x,i)=><div className={"movie-step "+(stage===i+1?"active":stage>i+1?"done":"")} key={x}><span>{stage>i+1?"✓":i+1}</span><small>{x}</small></div>)}</div>
  <section className="movie-panel">
   <div className="movie-panel-title"><span>مرحلہ {stage}</span><h3>{steps[stage-1]}</h3></div>
   {stage===1&&<><label className="movie-label" htmlFor="movie-story">اپنی مکمل کہانی یہاں پیسٹ کریں</label><textarea id="movie-story" className="movie-story-input" value={story} onChange={e=>setStory(e.target.value)} placeholder="یہاں اپنی مکمل کہانی لکھیں یا پیسٹ کریں…" rows={9}/><div className="movie-meta">{story.trim().length.toLocaleString()} حروف · زیادہ سے زیادہ 14,000 حروف</div><button className="movie-primary" disabled={!story.trim()} onClick={()=>{setError("");setStage(2)}}>اگلا مرحلہ ←</button></>}
   {stage===2&&<><p className="movie-help">اپنی مجوزہ فلم کا دورانیہ منتخب کریں۔</p><div className="movie-duration-grid">{MOVIE_DURATIONS.map(n=><button type="button" key={n} className={minutes===n?"selected":""} onClick={()=>setMinutes(n)}><b>{n}</b><small>منٹ</small></button>)}</div><div className="movie-selection">منتخب دورانیہ: <b>{minutes} منٹ</b></div><div className="movie-actions"><button className="movie-secondary" onClick={()=>setStage(1)}>واپس</button><button className="movie-primary" onClick={()=>setStage(3)}>اگلا مرحلہ ←</button></div></>}
   {stage===3&&<><div className="movie-summary"><div><small>کہانی</small><b>{story.trim().slice(0,90)}{story.trim().length>90?"…":""}</b></div><div><small>منتخب مجوزہ دورانیہ</small><b>{minutes} منٹ</b></div><div><small>تیاری</small><b>اسکرپٹ، کرداروں کی تفصیل اور مناظر کا تحریری خاکہ</b></div></div><p className="movie-notice">آپ کی موجودہ شرائط کے مطابق کوئی نیا ویڈیو انجن یا بیرونی سروس شامل نہیں کی جا رہی۔ اس مرحلے میں SHER AI PRO کے موجودہ چیٹ نظام سے تحریری اسکرپٹ اور زیادہ سے زیادہ 60 مناظر کا خاکہ بنے گا؛ MP4 فلم خودکار طور پر نہیں بنے گی۔</p><div className="movie-actions"><button className="movie-secondary" disabled={busy} onClick={()=>setStage(2)}>واپس</button><button className="movie-primary" disabled={busy||!story.trim()} onClick={prepareStory}>{busy?"تیاری جاری ہے…":"کہانی تیار کریں ✨"}</button></div>{status&&<p className="movie-status" role="status">{status}</p>}</>}
   {stage===4&&<><div className="movie-ready"><span>✓</span><h3>{title||"آپ کی کہانی"}</h3><p>تحریری اسکرپٹ اور {scenes.length} مناظر کا خاکہ تیار ہے۔</p></div><div className="movie-notice">واضح رہے: یہ ڈاؤن لوڈ ہونے والی تحریری فائلیں ہیں، تیار شدہ MP4 فلم نہیں۔ آپ کے کہنے کے مطابق کوئی نیا ویڈیو انجن، ویب سائٹ یا ادائیگی شامل نہیں کی گئی۔</div><div className="movie-actions"><button className="movie-secondary" onClick={resetStudio}>نئی کہانی</button><button className="movie-primary" onClick={downloadText}>⬇ اسکرپٹ ڈاؤن لوڈ کریں</button></div><button className="movie-secondary" style={{width:"100%",marginTop:8}} onClick={downloadJson}>اسٹوری بورڈ JSON بھی ڈاؤن لوڈ کریں</button><div className="movie-scene-list"><h4>تیار شدہ مناظر</h4>{scenes.map((x,i)=><article key={i}><b>{i+1}. {x.title}</b><p>{x.narration}</p><small>{x.visual}</small></article>)}</div></>}
   {error&&<p className="movie-error" role="alert">{error}</p>}
  </section>
  <p className="movie-footnote">موبائل کے لیے موزوں چار مرحلوں والا اسٹوڈیو۔ 15 سے 150 منٹ کا انتخاب مجوزہ کہانی کے دورانیے کی ہدایت ہے، تیار شدہ ویڈیو کی ضمانت نہیں۔</p>
 </main>;
}
