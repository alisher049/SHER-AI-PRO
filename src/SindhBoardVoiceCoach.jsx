import React,{useEffect,useRef,useState} from "react";

const COURSE_DATA={
 medium:[
  {text:"Journey",speakPrompt:"Batayiye, Journey ka matlab kya hai?",answer:"سفر",spellWord:"Journey",keywords:["safar","سفر","yatra","travel"]},
  {text:"Equality",speakPrompt:"Batayiye, Equality ka matlab kya hai?",answer:"برابری یا مساوات",spellWord:"Equality",keywords:["barabari","برابری","equal","مساوات"]},
  {text:"Messenger",speakPrompt:"Batayiye, Messenger ka matlab kya hai?",answer:"پیغمبر یا پیغام پہنچانے والا",spellWord:"Messenger",keywords:["paighambar","پیغمبر","rasool","رسول","paigham","پیغام"]},
  {text:"Ignorance",speakPrompt:"Batayiye, Ignorance ka matlab kya hai?",answer:"جہالت یا لاعلمی",spellWord:"Ignorance",keywords:["jahalat","جہالت","la ilmi","ناواقفیت"]},
  {text:"Brotherhood",speakPrompt:"Batayiye, Brotherhood ka matlab kya hai?",answer:"بھائی چارہ",spellWord:"Brotherhood",keywords:["bhai","بھائی","bhaichara","بھائی چارہ"]}
 ],
 hard:[
  {text:"All human beings are equal in the eyes of Allah.",speakPrompt:"Is jumle ka Urdu matlab batayiye: All human beings are equal in the eyes of Allah.",answer:"اللہ کی نظر میں تمام انسان برابر ہیں",spellWord:"Human",keywords:["insan","انسان","barabar","برابر","allah","اللہ","equal"]},
  {text:"The Holy Prophet taught the message of peace and love.",speakPrompt:"Is jumle ka matlab batayiye: The Holy Prophet taught the message of peace and love.",answer:"نبی پاک نے امن اور محبت کا پیغام سکھایا",spellWord:"Message",keywords:["aman","امن","mohabbat","محبت","pyar","پیار","paigham","پیغام"]},
  {text:"Before Islam, people lived in darkness and ignorance.",speakPrompt:"Is jumle ka matlab batayiye: Before Islam, people lived in darkness and ignorance.",answer:"اسلام سے پہلے لوگ اندھیرے اور جہالت میں رہتے تھے",spellWord:"Darkness",keywords:["andhera","اندھیرے","jahalat","جہالت","islam","اسلام"]},
  {text:"Treat women kindly and respect their rights.",speakPrompt:"Is jumle ka matlab batayiye: Treat women kindly and respect their rights.",answer:"عورتوں سے مہربانی سے پیش آئیں اور ان کے حقوق کا احترام کریں",spellWord:"Respect",keywords:["aurat","عورت","meharbani","مہربانی","izzat","عزت","احترام","haq","حق"]}
 ],
 pro:[
  {text:"Where did the Holy Prophet deliver his Last Sermon?",speakPrompt:"Pro Sawal: Where did the Holy Prophet deliver his Last Sermon? Yaani aap ne aakhri khutba kahan diya?",answer:"عرفات کے میدان میں (At Arafat)",spellWord:"Arafat",keywords:["arafat","عرفات","makkah","مکہ","pahar","پہاڑ"]},
  {text:"In which year was the Holy Prophet born?",speakPrompt:"Pro Sawal: In which year was the Holy Prophet born? Yaani aap ki paidaish kis saal hui?",answer:"571 عیسوی میں (In 571 A.D.)",spellWord:"Born",keywords:["571","پانچ سو اکہتر","makkah","مکہ"]},
  {text:"What is the only standard of superiority in Islam?",speakPrompt:"Pro Sawal: What is the only standard of superiority in Islam? Yaani Islam mein bartari ka mayar kya hai?",answer:"تقویٰ (Piety)",spellWord:"Piety",keywords:["taqwa","تقوی","تقویٰ","naik","نیک","amal","اعمال","piety"]},
  {text:"Why did the Holy Prophet migrate from Makkah to Madinah?",speakPrompt:"Pro Sawal: Why did the Holy Prophet migrate from Makkah to Madinah? Yaani hijrat kyun farmayi?",answer:"مکہ میں مخالفت اور تکالیف کے باعث مدینہ ہجرت فرمائی",spellWord:"Migrate",keywords:["mukhalfat","مخالفت","takleef","تکلیف","madinah","مدینہ","zulm","ظلم"]}
 ]
};
const LEVELS={medium:{label:"MEDIUM",urdu:"الفاظ",active:"active-medium"},hard:{label:"HARD",urdu:"جملے",active:"active-hard"},pro:{label:"PRO",urdu:"امتحانی سوالات",active:"active-pro"}};
export default function SindhBoardVoiceCoach({onBack}){
 const [level,setLevel]=useState("medium"),[indices,setIndices]=useState({medium:-1,hard:-1,pro:-1}),[status,setStatus]=useState("لیول منتخب کریں اور سبز NEXT بٹن دبائیں"),[spelling,setSpelling]=useState("نیچے NEXT دبائیں"),[listening,setListening]=useState(false),[supported,setSupported]=useState(true),[lastAnswer,setLastAnswer]=useState("");
 const recognitionRef=useRef(null),activeRef=useRef(false),runRef=useRef(0);
 const synth=typeof window!=="undefined"?window.speechSynthesis:null;
 const questions=COURSE_DATA[level],index=indices[level],current=index>=0?questions[index]:null;
 function stopAll(){runRef.current++;activeRef.current=false;if(synth)synth.cancel();if(recognitionRef.current){try{recognitionRef.current.abort()}catch{}}setListening(false)}
 function speak(text,lang="hi-IN",callback){if(!synth){callback?.();return}try{synth.cancel();const utter=new SpeechSynthesisUtterance(text);utter.lang=lang;utter.rate=.9;utter.onend=()=>callback?.();utter.onerror=()=>callback?.();synth.speak(utter)}catch{callback?.()}}
 useEffect(()=>()=>{runRef.current++;activeRef.current=false;if(synth)synth.cancel();if(recognitionRef.current){try{recognitionRef.current.abort()}catch{}}},[]);
 function changeLevel(next){stopAll();setLevel(next);setLastAnswer("");setSpelling("نیچے NEXT دبائیں");setStatus(`${LEVELS[next].label} لیول منتخب ہے۔ شروع کرنے کے لیے NEXT دبائیں۔`)}
 function startListening(item,runId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){setSupported(false);setSpelling(item.spellWord.toUpperCase().split("").join(" - "));setStatus("اس ڈیوائس یا براؤزر میں وائس ریکگنیشن دستیاب نہیں۔ Chrome میں مائیک کی اجازت دیں۔");return}
  const rec=new SR();recognitionRef.current=rec;rec.lang="ur-PK";rec.interimResults=false;rec.maxAlternatives=3;activeRef.current=true;setListening(true);setStatus("🎙️ مائیک آن ہے... اپنا جواب بولیں!");
  rec.onresult=e=>{if(runId!==runRef.current)return;activeRef.current=false;setListening(false);const answer=Array.from(e.results[0]||[]).map(x=>String(x.transcript||"").trim().toLowerCase()).join(" ");const ok=item.keywords.some(k=>answer.includes(k.toLowerCase()));const letters=item.spellWord.toUpperCase().split("").join(", ");setLastAnswer(answer||"جواب واضح نہیں");setSpelling(item.spellWord.toUpperCase().split("").join(" - "));
   if(ok){setStatus("✅ شاباش! آپ کا جواب درست ہے۔");speak(`Shabash! Bilkul sahi jawab. ${item.answer}. Spelling: ${letters}.`,"hi-IN")}
   else{setStatus(`💡 آپ نے کہا: "${answer||"جواب واضح نہیں"}" | درست جواب: "${item.answer}"`);speak(`Koi baat nahi. Sahi jawab hai: ${item.answer}. Spelling: ${letters}. Agla sawal sunne ke liye Next dabayein.`,"hi-IN")}
  };
  rec.onerror=()=>{if(runId!==runRef.current)return;activeRef.current=false;setListening(false);setSpelling(item.spellWord.toUpperCase().split("").join(" - "));setStatus(`مائیک یا آواز کی اجازت میں مسئلہ ہے۔ درست جواب: ${item.answer}`);};
  rec.onend=()=>{if(runId===runRef.current&&activeRef.current){activeRef.current=false;setListening(false);}};
  try{rec.start()}catch{activeRef.current=false;setListening(false);setStatus("مائیک شروع نہیں ہو سکا۔ اجازت چیک کریں اور دوبارہ NEXT دبائیں۔")}
 }
 function startNext(){stopAll();const next=(indices[level]+1)%questions.length;setIndices(old=>({...old,[level]:next}));setLastAnswer("");setSpelling("سوال سنیں...");const item=questions[next];setStatus("سوال پوچھا جا رہا ہے...");const runId=runRef.current;speak(item.speakPrompt,"hi-IN",()=>{if(runId===runRef.current)window.setTimeout(()=>startListening(item,runId),350)})}
 return <main className="sindh-voice-page" dir="rtl">
  <header className="sindh-voice-header"><button type="button" onClick={()=>{stopAll();onBack?.()}}>← واپس چیٹ پر</button><div><b>سندھ بورڈ — نہم جماعت</b><small>تین درجوں والا لائیو وائس کوچ</small></div></header>
  <section className="sindh-voice-card">
   <div className="sindh-level-bar" dir="ltr">{Object.keys(LEVELS).map(k=><button key={k} type="button" onClick={()=>changeLevel(k)} className={"sindh-level-btn "+(level===k?LEVELS[k].active:"")}>{LEVELS[k].label}</button>)}</div>
   <span className="sindh-voice-badge">9th Sindh Board · {LEVELS[level].label} · {LEVELS[level].urdu}</span>
   <div className="sindh-word" dir="ltr">{current?.text||`READY (${LEVELS[level].label})`}</div>
   <div className="sindh-spelling" dir="ltr">{spelling}</div>
   <div className={"sindh-mic "+(listening?"active":"")}>🎤</div>
   <div className="sindh-status" aria-live="polite">{status}</div>
   {lastAnswer&&<small className="sindh-last-answer">آپ کا جواب: {lastAnswer}</small>}
   {!supported&&<p className="sindh-support-note">وائس ریکگنیشن کے لیے Chrome یا مائیک سپورٹ کرنے والا براؤزر استعمال کریں۔</p>}
   <button className="sindh-next" type="button" onClick={startNext}>NEXT (اگلا سوال) ➔</button>
   <p className="sindh-progress">{index+1>0?index+1:0} / {questions.length} سوالات · ہر لیول کی پیش رفت الگ محفوظ ہے</p>
  </section>
 </main>
}
