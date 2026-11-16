import React,{useRef,useState} from "react";

const QUESTIONS=[
 "How do I introduce myself in a job interview?",
 "How can I politely ask someone for help?",
 "How do I describe my daily routine in English?",
 "How can I order food at a restaurant?",
 "How do I talk about my future plans?"
];
function cleanJson(value){return String(value||"").replace(/^\s*```(?:json)?\s*/i,"").replace(/\s*```\s*$/,"").trim()}
export default function EnglishCoach({session,lang="en",onBack}){
 const [input,setInput]=useState(""),[lesson,setLesson]=useState(null),[busy,setBusy]=useState(false),[listening,setListening]=useState(false),[error,setError]=useState(""),[slow,setSlow]=useState(false),[questionIndex,setQuestionIndex]=useState(0);
 const recognition=useRef(null),continuousRef=useRef(false),mountedRef=useRef(true);
 function speak(text,rate=1){if(!("speechSynthesis"in window)){setError("Text-to-speech is not available in this browser.");return}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text),voices=window.speechSynthesis.getVoices(),urdu=voices.find(v=>/^ur(-|_)/i.test(v.lang)),hindi=voices.find(v=>/^hi(-|_)/i.test(v.lang)),isUrdu=Array.from(String(text||"")).some(ch=>{const cp=ch.codePointAt(0);return cp>=1536&&cp<=1791});if(isUrdu){utterance.lang=urdu?.lang||hindi?.lang||"ur-PK";utterance.voice=urdu||hindi||null}else utterance.lang="en-US";utterance.rate=rate;utterance.onend=()=>{if(continuousRef.current&&recognition.current){try{recognition.current.start()}catch{}}};window.speechSynthesis.speak(utterance)}
 async function teach(value=input){const raw=String(value||"").trim();if(!raw||busy)return;setInput(raw);setBusy(true);setError("");try{
  const prompt="You are a kind, patient English teacher for a Pakistani Urdu-speaking learner. The learner may write Urdu, broken English, a word, or a full sentence. Return ONLY valid JSON (no markdown) with exactly these keys: youSaid (repeat learner input exactly), adviceUrdu (gentle Urdu explanation of what is wrong and why; if already correct, praise and explain briefly), correctEnglish (natural correct English translation/correction; for an isolated word give the best English equivalent), breakdown (array of objects with word, meaningUrdu, pronunciationUrdu; include every word in correctEnglish in order). pronunciationUrdu must be a simple Urdu-script sound guide, not IPA. Keep the lesson beginner-friendly. Learner text: "+raw;
  const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})},body:JSON.stringify({language:"Urdu and English",messages:[{role:"user",parts:[{text:prompt}]}]})});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Teacher request failed");const parsed=JSON.parse(cleanJson(data.text));if(!parsed.correctEnglish||!Array.isArray(parsed.breakdown))throw new Error("Teacher returned an incomplete lesson. Please try again.");setLesson({...parsed,youSaid:parsed.youSaid||raw});speak(parsed.correctEnglish,0.92);
 }catch(e){setError(e.message||"Could not prepare the lesson.");}finally{setBusy(false)}}
 function startMic(){const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){setError("Microphone recognition is not supported here. Please type your sentence or open the app in Chrome.");return}if(continuousRef.current){continuousRef.current=false;recognition.current?.stop();setListening(false);return}window.speechSynthesis?.cancel();continuousRef.current=true;const rec=new SpeechRecognition();recognition.current=rec;rec.lang="ur-PK";rec.continuous=true;rec.interimResults=false;rec.onstart=()=>{if(mountedRef.current)setListening(true)};rec.onend=()=>{if(!mountedRef.current)return;if(continuousRef.current){try{rec.start()}catch{setListening(false)}}else setListening(false)};rec.onerror=()=>{continuousRef.current=false;if(mountedRef.current){setListening(false);setError("Microphone permission denied or speech recognition unavailable.")}};rec.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){if(!e.results[i].isFinal)continue;const spoken=e.results[i][0]?.transcript||"";if(spoken.trim()){window.speechSynthesis?.cancel();setInput(spoken);teach(spoken);break}}};try{rec.start()}catch(e){continuousRef.current=false;setListening(false);setError(e.message)}}
 function nextQuestion(){const next=(questionIndex+1)%QUESTIONS.length;setQuestionIndex(next);setInput(QUESTIONS[next]);setLesson(null);setError("")}
 React.useEffect(()=>()=>{mountedRef.current=false;continuousRef.current=false;recognition.current?.stop();window.speechSynthesis?.cancel()},[]);
 return <main className="english-coach-page" dir="ltr">
  <header className="coach-topbar"><button type="button" onClick={onBack}>← Back to Chat</button><div><span>🎓</span><b>AI English Coach</b></div><small>SMART CLASSROOM</small></header>
  <div className="coach-scroll"><section className="coach-board"><div className="coach-board-title"><span>✦ YOUR PERSONAL ENGLISH CLASSROOM</span><span className="coach-live-dot">● LIVE LESSON</span></div>
   <div className="coach-input-row"><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Speak or type Urdu / English here… e.g. I am go to market" rows={2}/><button type="button" disabled={busy||!input.trim()} onClick={()=>teach()}>{busy?"Teaching…":"Teach me →"}</button></div>
   {error&&<p className="coach-error" role="alert">{error}</p>}
   {lesson?<div className="coach-lesson">
    <article className="coach-section coach-said"><label>1) YOU SAID</label><p dir="auto">{lesson.youSaid}</p></article>
    <article className="coach-section coach-advice"><label>2) TEACHER'S ADVICE · اصلاح</label><p dir="auto">{lesson.adviceUrdu}</p></article>
    <article className="coach-section coach-correct"><label>3) CORRECT ENGLISH</label><p>{lesson.correctEnglish}</p><button type="button" onClick={()=>speak(lesson.correctEnglish,0.72)}>🔊 Read correct sentence</button></article>
    <article className="coach-section coach-breakdown"><label>4) WORD-BY-WORD BREAKDOWN</label><div className="coach-word-grid">{lesson.breakdown.map((item,i)=><div className="coach-word-card" key={i}><b>{item.word}</b><span dir="rtl">{item.meaningUrdu}</span><small dir="rtl">تلفظ: {item.pronunciationUrdu}</small></div>)}</div></article>
   </div>:<div className="coach-empty"><div className="coach-chalk">A a</div><h2>Welcome to your English classroom!</h2><p>اپنا جملہ بولیں یا لکھیں۔ میں اسے درست کر کے آسان اردو میں سمجھاؤں گا۔</p><span>Examples: “I am fine” · “مجھے پانی چاہیے” · “He go school”</span></div>}
  </section>
  <section className="coach-controls"><div className="coach-orb-wrap"><button type="button" className={"coach-orb "+(listening?"is-listening":"")} onClick={startMic} aria-label="Tap to speak"><span>{listening?"🎙":"🎤"}</span><small>{listening?"LISTENING · TAP TO STOP":"START LIVE CONVERSATION"}</small></button></div>
   <div className="coach-actions"><button type="button" disabled={!lesson} onClick={()=>lesson&&speak(lesson.correctEnglish,1)}>🔊 Listen</button><button type="button" disabled={!lesson} onClick={()=>{setSlow(true);lesson&&speak(lesson.correctEnglish,.65)}}>🐢 Slow (آہستہ سنیں)</button><button type="button" onClick={nextQuestion}>➡️ Next Practice Question</button></div>
   <p className="coach-hint">Tip: You can also type your sentence in Urdu or English above.</p>
  </section></div>
 </main>
}
