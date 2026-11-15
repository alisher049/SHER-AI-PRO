const YAHOO = {
  XAUUSD: { symbol: "XAUUSD=X", fallback: "GC=F" },
  EURUSD: { symbol: "EURUSD=X" },
};
const CRYPTO = new Set(["BTCUSDT", "ETHUSDT"]);
const FRAMES = new Set(["1m","3m","5m","15m","1h","4h","1d","1w"]);
const BINANCE_INTERVAL = {"1m":"1m","3m":"3m","5m":"5m","15m":"15m","1h":"1h","4h":"4h","1d":"1d","1w":"1w"};
function aggregate(rows, seconds) {
  const buckets = new Map();
  for (const c of rows) {
    const time = Math.floor(c.time / seconds) * seconds;
    const old = buckets.get(time);
    if (!old) buckets.set(time, { ...c, time });
    else { old.high=Math.max(old.high,c.high);old.low=Math.min(old.low,c.low);old.close=c.close;old.volume+=(c.volume||0); }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
async function binance(symbol, interval, before) {
  const params=new URLSearchParams({symbol,interval:BINANCE_INTERVAL[interval],limit:"1000"});
  if(before)params.set("endTime",String((Number(before)*1000)-1));
  const r=await fetch("https://api.binance.com/api/v3/klines?"+params,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error("Binance market feed returned "+r.status);
  return (await r.json()).map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
}
async function yahoo(symbol, frame, before) {
  const interval=frame==="1w"?"1wk":frame==="1d"?"1d":frame==="4h"||frame==="1h"?"60m":frame==="3m"?"1m":frame;
  const end=before?Number(before):Math.floor(Date.now()/1000);
  const start=end-(frame==="1w"?10*365:frame==="1d"?10*365:frame==="4h"||frame==="1h"?730:frame==="1m"||frame==="3m"?7:60)*86400;
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval="+interval+"&period1="+start+"&period2="+end;
  const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error("Yahoo market feed returned "+r.status);
  const body=await r.json(),result=body.chart?.result?.[0];
  if(!result)throw new Error(body.chart?.error?.description||"No Yahoo candles available");
  const q=result.indicators?.quote?.[0]||[];
  let rows=(result.timestamp||[]).map((t,i)=>({time:t,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]||0})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
  if(frame==="3m")rows=aggregate(rows,180);
  if(frame==="4h")rows=aggregate(rows,14400);
  return rows;
}
export default async function handler(req,res) {
  if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
  const market=String(req.query?.market||"BTCUSDT").toUpperCase();
  const frame=String(req.query?.frame||"1m").toLowerCase();
  const before=req.query?.before?Number(req.query.before):null;
  if(!FRAMES.has(frame)||!["BTCUSDT","ETHUSDT","XAUUSD","EURUSD"].includes(market)|| (before!==null&&!Number.isFinite(before)))return res.status(400).json({error:"Unsupported market, timeframe or history cursor"});
  try{
    let candles,symbol=market,source;
    if(CRYPTO.has(market)){candles=await binance(market,frame,before);source="Binance public spot REST";}
    else{
      const cfg=YAHOO[market];
      try{candles=await yahoo(cfg.symbol,frame,before)}
      catch(e){if(!cfg.fallback)throw e;symbol=cfg.fallback;candles=await yahoo(symbol,frame,before)}
      if(frame==="1w")source="Yahoo weekly historical reference";
      else if(frame==="1d")source="Yahoo daily historical reference";
      else source=market==="XAUUSD"?(symbol==="GC=F"?"Yahoo Gold futures proxy (GC=F), not spot XAUUSD":"Yahoo XAUUSD reference"):"Yahoo Finance public FX reference";
    }
    if(!candles?.length)throw new Error("No candles returned for this history range.");
    return res.status(200).json({market,frame,symbol,source,updatedAt:new Date().toISOString(),hasMore:candles.length>=500,candles:candles.slice(-1000)});
  }catch(e){return res.status(502).json({error:e.message||"Market feed unavailable"})}
}