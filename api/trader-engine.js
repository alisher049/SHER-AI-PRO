// Free-tier hybrid trade monitor. Invoke every 5 minutes from an external free cron
// using POST /api/trader-engine and Authorization: Bearer <CRON_SECRET>.
const BASE=(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||"").replace(/\/$/,"");
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
async function db(path,options={}){if(!BASE||!KEY)throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");const r=await fetch(BASE+"/rest/v1/"+path,{...options,headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});const body=await r.json().catch(()=>null);if(!r.ok)throw new Error("Supabase "+r.status+": "+JSON.stringify(body));return body}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 const secret=process.env.CRON_SECRET;if(!secret||req.headers.authorization!=="Bearer "+secret)return res.status(401).json({error:"Unauthorized"});
 try{
  const trades=await db("sher_trader_trades?status=eq.ACTIVE&select=*");
  let checked=0,closed=0,errors=[];
  const origin=process.env.APP_BASE_URL||(process.env.VERCEL_URL?"https://"+process.env.VERCEL_URL:"");
  if(!origin)throw new Error("APP_BASE_URL or VERCEL_URL is required");
  for(const t of trades||[]){
   try{
    const frame=t.timeframe||"1m",url=origin+"/api/market-data?market="+encodeURIComponent(t.market)+"&frame="+encodeURIComponent(frame);
    const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Market feed unavailable");
    const bars=(d.candles||[]).filter(c=>Number(c.time)>Number(t.signal_time)&&Number(c.time)+(frame==="1m"?60:frame==="3m"?180:frame==="5m"?300:frame==="15m"?900:frame==="1h"?3600:frame==="4h"?14400:frame==="1d"?86400:604800)<=Math.floor(Date.now()/1000));
    let result=null,hit=null;
    for(const c of bars){const sl=t.direction==="BUY"?c.low<=t.stop_loss:c.high>=t.stop_loss;const tp=t.direction==="BUY"?c.high>=t.target:c.low<=t.target;if(sl||tp){result=sl?"LOSS":"WIN";hit=c;break}}
    checked++;
    if(result&&hit){const risk=Math.abs(Number(t.entry)-Number(t.stop_loss)),reward=Math.abs(Number(t.target)-Number(t.entry));const rMultiple=risk>0?(result==="WIN"?reward/risk:-1):null;await db("sher_trader_trades?id=eq."+encodeURIComponent(t.id),{method:"PATCH",body:JSON.stringify({status:result,closed_at:new Date(Number(hit.time)*1000).toISOString(),exit_price:result==="WIN"?t.target:t.stop_loss,r_multiple:rMultiple,last_checked_at:new Date().toISOString(),feed_source:d.source})});closed++}
    else await db("sher_trader_trades?id=eq."+encodeURIComponent(t.id),{method:"PATCH",body:JSON.stringify({last_checked_at:new Date().toISOString(),feed_source:d.source})});
   }catch(e){errors.push({trade:t.id,error:e.message})}
  }
  return res.status(200).json({ok:true,checked,closed,errors,at:new Date().toISOString()});
 }catch(e){return res.status(500).json({error:e.message})}
}
