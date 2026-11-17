import React from "react";

export default function AIVoiceAcademy(){
  return (
    <section className="voice-academy-shell" aria-label="AI Voice Academy">
      <iframe
        title="SHER AI PRO — AI Voice Academy"
        src="/voice-academy.html"
        allow="microphone; autoplay"
        referrerPolicy="same-origin"
        style={{display:"block",width:"100%",height:"calc(100dvh - 112px)",minHeight:"620px",border:0,borderRadius:"16px",background:"#070b14"}}
      />
    </section>
  );
}
