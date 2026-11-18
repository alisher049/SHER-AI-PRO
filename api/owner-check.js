import {checkOwnerPin} from "./_owner-auth.js";
const OWNER="alishermeo049@gmail.com";
const MODEL="gemini-3.8-flash";
async function ownerFromRequest(req){
 const auth=req.headers.authorization||"";
 if(!auth.startsWith("Bearer ")||!process.env.VITE_SUPABASE_URL||!process.env.VITE_SUPABASE_ANON_KEY)return false;
 try{
  const response=await fetch(process.env.VITE_SUPABASE_URL.replace(/\/$/,"")+"/auth/v1/user",{headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return false;
  const user=await response.json();
  return user.email?.toLowerCase()===OWNER;
 }catch{return false}
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!(await ownerFromRequest(req)))return res.status(401).json({error:"AI Owner access is restricted to the authorized owner."});
 const pin=checkOwnerPin(req,req.body?.ownerPin);
 if(!pin.configured)return res.status(503).json({error:"Server-side Owner PIN is not configured. Set OWNER_PIN (8+ characters) in Vercel Environment Variables and redeploy."});
 if(!pin.ok)return res.status(403).json({error:"Server-side Owner PIN verification failed."});
 if(req.body?.action==="verify")return res.status(200).json({verified:true,model:MODEL});
 const checks=[
  {id:"owner-pin",name:"Server-side Owner PIN",status:"ok",detail:"OWNER_PIN verified by the server for this request."},
  {id:"supabase",name:"Supabase owner authentication",status:"ok",detail:"Owner session verified by Supabase Auth."},
  {id:"gemini-config",name:"Gemini API configuration",status:process.env.GEMINI_API_KEY?"ok":"error",detail:process.env.GEMINI_API_KEY?"Server-side Gemini key is configured.":"GEMINI_API_KEY is missing in Vercel server environment."},
  {id:"supabase-config",name:"Supabase server configuration",status:process.env.VITE_SUPABASE_URL&&process.env.VITE_SUPABASE_ANON_KEY?"ok":"error",detail:process.env.VITE_SUPABASE_URL&&process.env.VITE_SUPABASE_ANON_KEY?"Supabase URL and public anon key are present.":"VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing."},
  {id:"model",name:"Gemini 3.8 Flash live API",status:"skipped",detail:"Not tested because the server key is not configured."},
  {id:"client-features",name:"Client-side feature runtime",status:"skipped",detail:"Source files existing is not proof that every feature works on a real browser or Android device. Device, microphone, camera, file upload and live API flows require runtime testing."}
 ];
 if(process.env.GEMINI_API_KEY){
  try{
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent?key="+encodeURIComponent(process.env.GEMINI_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{role:"user",parts:[{text:"Reply with exactly: OK"}]}],generationConfig:{maxOutputTokens:8,temperature:0}}),signal:AbortSignal.timeout(18000)});
   const d=await r.json().catch(()=>({}));
   const ok=r.ok&&!!d.candidates?.[0]?.content?.parts?.some(p=>p.text);
   checks.find(x=>x.id==="model").status=ok?"ok":"error";
   checks.find(x=>x.id==="model").detail=ok?"Gemini 3.8 Flash responded successfully.":(d.error?.message||"Gemini returned no text response (HTTP "+r.status+").");
  }catch(e){checks.find(x=>x.id==="model").status="error";checks.find(x=>x.id==="model").detail=e.name==="TimeoutError"?"Gemini health check timed out.":e.message||"Gemini health check failed."}
 }
 const recommendations=[];
 return res.status(200).json({model:MODEL,checkedAt:new Date().toISOString(),checks,recommendations});
}