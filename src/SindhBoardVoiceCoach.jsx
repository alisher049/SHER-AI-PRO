import React,{useEffect,useRef,useState} from "react";

const WORDS=[
 {word:"Journey",meaning:"سفر",keywords:["safar","سفر","yatra","travel"]},
 {word:"Peace",meaning:"امن یا سکون",keywords:["aman","امن","sukoon","سکون","shanti"]},
 {word:"Messenger",meaning:"پیغمبر یا پیغام پہنچانے والا",keywords:["paighambar","پیغمبر","rasool","رسول","paigham","پیغام"]},
 {word:"Equality",meaning:"برابری",keywords:["barabari","برابری","equal","مساوات"]},
 {word:"Light",meaning:"روشنی",keywords:["roshni","روشنی","ujala","اجالا"]},
 {word:"Justice",meaning:"انصاف",keywords:["insaf","انصاف","adal","عدل"]},
 {word:"Brotherhood",meaning:"بھائی چارہ",keywords:["bhai","بھائی","bhaichara","بھائی چارہ"]},
 {word:"Ignorance",meaning:"جہالت یا لاعلمی",keywords:["jahalat","جہالت","la ilmi","ناواقفیت"]},
 {word:"Kindness",meaning:"مہربانی یا رحم دلی",keywords:["meharbani","مہربانی","raham","رحم","pyar","پیار"]},
 {word:"Humanity",meaning:"انسانیت",keywords:["insaniyat","انسانیت","insan","انسان"]}
];
export default function SindhBoardVoiceCoach({onBack}){
 const [index,setIndex]=useState(-1),[status,setStatus]=useState("شروع کرنے کے لیے نیچے سبز NEXT بٹن دبائیں"),[spelling,setSpelling]=useState("NEXT دبائیں"),[listening,setListening]=useState(false),[supported,setSupported]=useState(true),[lastAnswer,setLastAnswer]=useState("");
 const recognitionRef=useRef(null),activeRef=useRef(false),runRef=useRef(0);
 const synth=typeof window!=="undefined"?window.speechSynthesis:null;
 function stopAll(){runRef.current++;activeRef.current=false;if(synth)synth.cancel();if(recognitionRef.current){try{recognitionRef.current.abort()}catch{}}setListening(false)}
 function speak(text,lang="ur-PK",callback){if(!synth){callback?.();return} synth.cancel();const utter=new SpeechSynthesisUtterance(text);utter.lang=lang;utter.rate=.9;utter.onend=()=>callback?.();utter.onerror=()=>callback?.();synth.speak(utter)}
 useEffect(()=>()=>{stopAll()},[]);
 function startListening(item,runId){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){setSupported(false);setSpelling(item.word.toUpperCase().split("").join(" - "));setStatus("اس براؤزر میں وائس ریکگنیشن دستیاب نہیں۔ جواب ٹائپ کرنے کے لیے Chrome استعمال کریں۔");return}
  const rec=new SR();recognitionRef.current=rec;rec.lang="ur-PK";rec.interimResults=false;rec.maxAlternatives=3;activeRef.current=true;setListening(true);setStatus("🎙️ مائیک آن ہے... اپنا جواب بولیں!");
  rec.onresult=e=>{if(runId!==runRef.current)return;activeRef.current=false;setListening(false);const alternatives=Array.from(e.results[0]||[]).map(x=>String(x.transcript||"").trim().toLowerCase());const answer=alternatives.join(" ");const ok=item.keywords.some(k=>answer.includes(k.toLowerCase()));const letters=item.word.toUpperCase().split("").join(", ");setLastAnswer(answer);setSpelling(item.word.toUpperCase().split("").join(" - "));
   if(ok){setStatus(`✅ شاباش! "${item.word}" کا مطلب "${item.meaning}" ہے۔`);speak(`Shabash! Bilkul sahi jawab. ${item.word} ka matlab ${item.meaning} hai. Iski spelling hai: ${letters}.`,"hi-IN")}
   else{setStatus(`💡 آپ نے کہا: "${answer||"جواب واضح نہیں"}" | صحیح مطلب: "${item.meaning}"`);speak(`Koi baat nahi. Sahi jawab hai: ${item.word} ka matlab ${item.meaning} hai. Iski spelling hai: ${letters}. Agla lafz sunne ke liye Next dabayein.`,"hi-IN")}
  };
  rec.onerror=()=>{if(runId!==runRef.current)return;activeRef.current=false;setListening(false);setSpelling(item.word.toUpperCase().split("").join(" - "));setStatus(`مائیک یا آواز کی اجازت میں مسئلہ ہے۔ "${item.word}" کا مطلب "${item.meaning}" ہے۔`);};
  rec.onend=()=>{if(runId===runRef.current&&activeRef.current){activeRef.current=false;setListening(false);}};
  try{rec.start()}catch{activeRef.current=false;setListening(false);setStatus("مائیک شروع نہیں ہو سکا۔ دوبارہ NEXT دبائیں۔")}
 }
 function nextWord(){stopAll();const next=(index+1)%WORDS.length;setIndex(next);setLastAnswer("");setSpelling("سوال سنیں...");const item=WORDS[next];setStatus(`بتائیے "${item.word}" کا مطلب کیا ہے؟`);const runId=runRef.current;speak(`Batayiye, ${item.word} ka matlab kya hai?`,"hi-IN",()=>{if(runId===runRef.current)window.setTimeout(()=>startListening(item,runId),350)})}
 const current=index>=0?WORDS[index]:null;
 return <main className="sindh-voice-page" dir="rtl">
  <header className="sindh-voice-header"><button type="button" onClick={()=>{stopAll();onBack?.()}}>← واپس چیٹ پر</button><div><b>سندھ بورڈ — نہم جماعت</b><small>لائیو وائس انگلش کوچ</small></div></header>
  <section className="sindh-voice-card">
   <span className="sindh-voice-badge">9th Sindh Board · Live Voice Coach</span>
   <div className="sindh-word" dir="ltr">{current?.word||"READY"}</div>
   <div className="sindh-spelling" dir="ltr">{spelling}</div>
   <div className={"sindh-mic "+(listening?"active":"")}>🎤</div>
   <div className="sindh-status" aria-live="polite">{status}</div>
   {lastAnswer&&<small className="sindh-last-answer">آپ کا جواب: {lastAnswer}</small>}
   {!supported&&<p className="sindh-support-note">وائس ریکگنیشن کے لیے Chrome یا ایسا براؤزر استعمال کریں جو مائیک سپورٹ کرتا ہو۔</p>}
   <button className="sindh-next" type="button" onClick={nextWord}>NEXT (اگلا لفظ) ➔</button>
   <p className="sindh-progress">{index+1>0?index+1:0} / {WORDS.length} الفاظ · مکمل ہونے پر فہرست دوبارہ شروع ہوگی</p>
  </section>
 </main>
}
