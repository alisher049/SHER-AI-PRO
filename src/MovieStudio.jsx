import React,{useState} from "react";
import { MOVIE_DURATIONS, parseStoryboardResponse, buildScriptText, buildStoryboardJson } from "./movieStudioUtils.js";
import { decodeBase64, joinPcm16, pcm16ToWav, splitNarration } from "./movieAudioUtils.js";



export default function MovieStudio({session}){
 const [story,setStory]=useState("");
 const [minutes,setMinutes]=useState(15);
 const [stage,setStage]=useState(1);
 const [busy,setBusy]=useState(false);
 const [scenes,setScenes]=useState([]);
 const [parts,setParts]=useState([]);
 const [characterBible,setCharacterBible]=useState("");
 const [continuityRules,setContinuityRules]=useState([]);
 const [error,setError]=useState("");
 const [status,setStatus]=useState("");
 const [title,setTitle]=useState("");
 const [audioBusy,setAudioBusy]=useState(false);
 const [audioProgress,setAudioProgress]=useState({done:0,total:0});
 const [audioBlob,setAudioBlob]=useState(null);

 async function prepareStory(){
  if(!story.trim()||busy)return;
  setBusy(true);setError("");setStatus("آپ کی کہانی کا اسکرپٹ اور کرداروں کا خاکہ تیار ہو رہا ہے…");
  try{
   const instruction="آپ صارف کی دی ہوئی کہانی کے وفادار فلمی منصوبہ ساز ہیں، نئی کہانی کے مصنف نہیں۔ اصل کہانی کے واقعات، کرداروں کے رشتے، ترتیب، انجام اور مقصد تبدیل نہ کریں؛ کوئی نیا کردار، واقعہ، موڑ یا ذیلی کہانی ایجاد نہ کریں۔ پہلے مستقل characterBible بنائیں جس میں کرداروں کی شناخت، چہرہ، بال، جسمانی ساخت، لباس، رنگ، آواز، لہجہ، عادات، چلنے کا انداز، جسمانی زبان اور تعلقات درج ہوں؛ جو بات اصل متن میں نہ ہو اسے نامعلوم لکھیں، خود سے حقیقت نہ بنائیں۔ continuityRules میں چہرے، لباس، آواز، زخم، اشیا، مقام، موسم، روشنی، وقت، کرداروں کی جگہ اور حرکت کے تسلسل کے اصول لکھیں۔ پوری "+minutes+" منٹ کی فلم کو لازماً چار برابر حصوں میں بانٹیں، ہر حصہ "+(minutes/4)+" منٹ کا ہو۔ parts لازماً چار ہوں، ہر حصے میں اسی کہانی کے واقعات کی درست ترتیب ہو اور ہر منظر میں کرداروں کی وہی شناخت، لباس، آواز اور حرکت برقرار رہے۔ ہر منظر کے لیے title، narration، subtitle، visual، characterContinuity، movement، location اور sound دیں۔ صرف JSON واپس کریں: {title:string,characterBible:string,continuityRules:string[],parts:[{title:string,scenes:[{title:string,narration:string,subtitle:string,visual:string,characterContinuity:string,movement:string,location:string,sound:string}]}]}۔ یہ تحریری اسٹوری بورڈ ہے، MP4 فلم نہیں۔ اصل کہانی:\\n"+story.slice(0,14000);
   const r=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({language:"Urdu",messages:[{role:"user",parts:[{text:instruction}]}]})});
   const d=await r.json();if(!r.ok)throw Error(d.error||"کہانی تیار نہیں ہو سکی");
   const parsed=parseStoryboardResponse(d.text,minutes);
   setAudioBlob(null);setAudioProgress({done:0,total:0});
   setTitle(parsed.title);
   setParts(parsed.parts);
   setScenes(parsed.scenes);
   setCharacterBible(parsed.characterBible);
   setContinuityRules(parsed.continuityRules);
   setStage(4);setStatus("آپ کا تحریری فلمی منصوبہ تیار ہے۔");
  }catch(e){setError(e.message||"کوئی خرابی پیش آئی");setStatus("")}
  finally{setBusy(false)}
 }
 function saveFile(filename,type,content){
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
 }
 function saveBlob(filename,blob){
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 async function generateNarration(){
  if(audioBusy||!scenes.length)return;
  if(!session?.access_token){setError("آواز بنانے کے لیے مالک کے اکاؤنٹ میں دوبارہ سائن اِن کریں۔");return;}
  const requests=scenes.flatMap((scene,index)=>splitNarration(String(scene.narration||scene.subtitle||"")).map(text=>({text,scene:index+1})));
  if(!requests.length){setError("اسٹوری بورڈ میں آواز کے لیے متن موجود نہیں۔");return;}
  setAudioBusy(true);setError("");setAudioBlob(null);setAudioProgress({done:0,total:requests.length});
  const pcm=[];
  try{
   for(let i=0;i<requests.length;i++){
    const item=requests[i];setStatus("منظر "+item.scene+" کی آواز تیار ہو رہی ہے… ("+(i+1)+"/"+requests.length+")");
    const response=await fetch("/api/speech",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},body:JSON.stringify({text:item.text,language:"Urdu",voice:"Kore"})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"آواز تیار نہیں ہو سکی۔");
    pcm.push(decodeBase64(data.audio));setAudioProgress({done:i+1,total:requests.length});
   }
   const wav=pcm16ToWav(joinPcm16(pcm,220,24000,1),24000,1);
   setAudioBlob(wav);setStatus("تمام مناظر کی اردو آواز تیار ہے۔ اسے الگ WAV فائل کے طور پر ڈاؤن لوڈ کیا جا سکتا ہے۔");
  }catch(e){setError(e.message||"آواز بناتے وقت خرابی پیش آئی۔");setStatus("");}
  finally{setAudioBusy(false);}
 }
 function downloadText(){
  const text=buildScriptText(title,minutes,parts,scenes,characterBible,continuityRules);
  saveFile("sher-ai-film-script.txt","text/plain;charset=utf-8",text);
 }
 function downloadJson(){
  saveFile("sher-ai-film-storyboard.json","application/json;charset=utf-8",buildStoryboardJson(title,minutes,parts,scenes,characterBible,continuityRules));
 }
 function resetStudio(){setStory("");setMinutes(15);setScenes([]);setParts([]);setCharacterBible("");setContinuityRules([]);setTitle("");setError("");setStatus("");setAudioBlob(null);setAudioProgress({done:0,total:0});setStage(1)}
 const steps=["کہانی پیسٹ کریں","دورانیہ منتخب کریں","فلم کا خاکہ تیار کریں","فائل حاصل کریں"];
 return <main className="movie-studio" dir="rtl">
  <div className="movie-studio-head"><div className="movie-studio-mark">🎬</div><div><span className="movie-eyebrow">SHER AI PRO</span><h2>AI Movie Studio</h2><p>اپنی کہانی کو چار آسان مراحل میں تیار کریں</p></div></div>
  <div className="movie-stepper">{steps.map((x,i)=><div className={"movie-step "+(stage===i+1?"active":stage>i+1?"done":"")} key={x}><span>{stage>i+1?"✓":i+1}</span><small>{x}</small></div>)}</div>
  <section className="movie-panel">
   <div className="movie-panel-title"><span>مرحلہ {stage}</span><h3>{steps[stage-1]}</h3></div>
   {stage===1&&<><label className="movie-label" htmlFor="movie-story">اپنی مکمل کہانی یہاں پیسٹ کریں</label><textarea id="movie-story" className="movie-story-input" value={story} onChange={e=>setStory(e.target.value)} placeholder="یہاں اپنی مکمل کہانی لکھیں یا پیسٹ کریں…" rows={9}/><div className="movie-meta">{story.trim().length.toLocaleString()} حروف · زیادہ سے زیادہ 14,000 حروف</div><button className="movie-primary" disabled={!story.trim()} onClick={()=>{setError("");setStage(2)}}>اگلا مرحلہ ←</button></>}
   {stage===2&&<><p className="movie-help">اپنی مجوزہ فلم کا دورانیہ منتخب کریں۔</p><div className="movie-duration-grid">{MOVIE_DURATIONS.map(n=><button type="button" key={n} className={minutes===n?"selected":""} onClick={()=>setMinutes(n)}><b>{n}</b><small>منٹ</small></button>)}</div><div className="movie-selection">منتخب دورانیہ: <b>{minutes} منٹ</b></div><div className="movie-actions"><button className="movie-secondary" onClick={()=>setStage(1)}>واپس</button><button className="movie-primary" onClick={()=>setStage(3)}>اگلا مرحلہ ←</button></div></>}
   {stage===3&&<><div className="movie-summary"><div><small>کہانی</small><b>{story.trim().slice(0,90)}{story.trim().length>90?"…":""}</b></div><div><small>منتخب مجوزہ دورانیہ</small><b>{minutes} منٹ</b></div><div><small>تیاری</small><b>اسکرپٹ، کرداروں کی تفصیل اور مناظر کا تحریری خاکہ</b></div></div><p className="movie-notice">آپ کی موجودہ شرائط کے مطابق کوئی نیا ویڈیو انجن یا بیرونی سروس شامل نہیں کی جا رہی۔ اس مرحلے میں SHER AI PRO کے موجودہ چیٹ نظام سے تحریری اسکرپٹ اور زیادہ سے زیادہ 60 مناظر کا خاکہ بنے گا؛ MP4 فلم خودکار طور پر نہیں بنے گی۔</p><div className="movie-actions"><button className="movie-secondary" disabled={busy} onClick={()=>setStage(2)}>واپس</button><button className="movie-primary" disabled={busy||!story.trim()} onClick={prepareStory}>{busy?"تیاری جاری ہے…":"کہانی تیار کریں ✨"}</button></div>{status&&<p className="movie-status" role="status">{status}</p>}</>}
   {stage===4&&<><div className="movie-ready"><span>✓</span><h3>{title||"آپ کی کہانی"}</h3><p>تحریری اسکرپٹ اور {scenes.length} مناظر کا خاکہ تیار ہے۔</p></div><div className="movie-notice">اس مرحلے میں اسکرپٹ، اسٹوری بورڈ اور مناظر کی اردو آواز تیار کی جا سکتی ہے۔ آواز WAV فائل ہوگی؛ یہ ابھی MP4 فلم یا حقیقی سینیمیٹک ویڈیو نہیں ہے۔ کوئی نیا ویڈیو انجن یا ادائیگی شامل نہیں کی گئی۔</div><div className="movie-actions"><button className="movie-secondary" onClick={resetStudio}>نئی کہانی</button><button className="movie-primary" onClick={downloadText}>⬇ اسکرپٹ ڈاؤن لوڈ کریں</button></div><button className="movie-secondary" style={{width:"100%",marginTop:8}} onClick={downloadJson}>اسٹوری بورڈ JSON بھی ڈاؤن لوڈ کریں</button><div className="movie-audio-tools"><button className="movie-primary" style={{width:"100%",marginTop:8}} disabled={audioBusy||!session?.access_token} onClick={generateNarration}>{audioBusy?"آواز تیار ہو رہی ہے…":"تمام مناظر کی اردو آواز تیار کریں"}</button>{audioProgress.total>0&&<p className="movie-status" role="status">آواز کے حصے: {audioProgress.done}/{audioProgress.total}</p>}{audioBlob&&<button className="movie-secondary" style={{width:"100%",marginTop:8}} onClick={()=>saveBlob("sher-ai-film-narration.wav",audioBlob)}>⬇ مکمل اردو آواز ڈاؤن لوڈ کریں (WAV)</button>}</div><div className="movie-scene-list"><h4>چار حصوں پر مشتمل فلمی منصوبہ</h4><div className="movie-summary"><div><small>کل دورانیہ</small><b>{minutes} منٹ</b></div><div><small>حصوں کی تعداد</small><b>4 حصے</b></div><div><small>ہر حصے کا دورانیہ</small><b>{minutes/4} منٹ</b></div></div>{parts.map(part=><section className="movie-part" key={part.number}><h4>حصہ {part.number}: {part.title}</h4><small>دورانیہ: {part.duration_minutes} منٹ · مناظر: {part.scenes.length}</small>{part.scenes.map((x,i)=><article key={i}><b>{i+1}. {x.title}</b><p>{x.narration}</p><small>{x.visual}</small><p><small>کردار: {x.characterContinuity} · حرکت: {x.movement} · مقام: {x.location} · آواز: {x.sound}</small></p></article>)}</section>)}<section className="movie-part"><h4>کرداروں کا مستقل ریکارڈ</h4><p>{characterBible||"اس کہانی کے لیے کرداروں کی تفصیل دستیاب نہیں۔"}</p><h4>تسلسل کے اصول</h4><ul>{continuityRules.map((rule,i)=><li key={i}>{rule}</li>)}</ul></section></div></>}
   {error&&<p className="movie-error" role="alert">{error}</p>}
  </section>
  <p className="movie-footnote">موبائل کے لیے موزوں چار مرحلوں والا اسٹوڈیو۔ 15 سے 150 منٹ کا انتخاب مجوزہ کہانی کے دورانیے کی ہدایت ہے، تیار شدہ ویڈیو کی ضمانت نہیں۔</p>
 </main>;
}
