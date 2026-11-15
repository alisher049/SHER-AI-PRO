const YAHOO = {
  XAUUSD: { symbol: "XAUUSD=X", fallback: "GC=F", label: "Gold spot reference (Yahoo feed)" },
  EURUSD: { symbol: "EURUSD=X", label: "EUR/USD (Yahoo feed)" },
};
const CRYPTO = new Set(["BTCUSDT", "ETHUSDT"]);
const FRAMES = new Set(["1m", "3m", "5m", "15m", "1h", "4h"]);
function aggregate(rows, seconds) {
  const buckets = new Map();
  for (const c of rows) {
    const time = Math.floor(c.time / seconds) * seconds;
    const old = buckets.get(time);
    if (!old) buckets.set(time, { ...c, time });
    else { old.high = Math.max(old.high, c.high); old.low = Math.min(old.low, c.low); old.close = c.close; old.volume += c.volume || 0; }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
async function binance(symbol, interval) {
  const url = "https://api.binance.com/api/v3/klines?symbol=" + symbol + "&interval=" + interval + "&limit=500";
  const r = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("Binance market feed returned " + r.status);
  const rows = await r.json();
  return rows.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
}
async function yahoo(symbol, interval, range) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?interval=" + interval + "&range=" + range;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error("Yahoo market feed returned " + r.status);
  const body = await r.json(), result = body.chart?.result?.[0];
  if (!result) throw new Error(body.chart?.error?.description || "No Yahoo candles available");
  const q = result.indicators?.quote?.[0] || [];
  return (result.timestamp || []).map((t,i)=>({time:t,open:q.open?.[i],high:q.high?.[i],low:q.low?.[i],close:q.close?.[i],volume:q.volume?.[i]||0})).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite));
}
export default async function handler(req,res) {
  if (req.method !== "GET") return res.status(405).json({error:"Method not allowed"});
  const market=String(req.query?.market||"BTCUSDT").toUpperCase();
  const frame=String(req.query?.frame||"1m").toLowerCase();
  if (!FRAMES.has(frame) || !["BTCUSDT","ETHUSDT","XAUUSD","EURUSD"].includes(market)) return res.status(400).json({error:"Unsupported market or timeframe"});
  try {
    let candles, source, symbol=market;
    if (CRYPTO.has(market)) {
      candles=await binance(market,frame); source="Binance Spot public REST";
    } else {
      const cfg=YAHOO[market];
      const baseInterval=frame==="3m"?"1m":frame==="4h"?"60m":frame==="1h"?"60m":frame;
      const range=baseInterval==="1m"?"1d":baseInterval==="5m"||baseInterval==="15m"?"5d":"1mo";
      try { candles=await yahoo(cfg.symbol,baseInterval,range); }
      catch(e) { if (!cfg.fallback) throw e; symbol=cfg.fallback; candles=await yahoo(symbol,baseInterval,range); }
      if(frame==="3m") candles=aggregate(candles,180);
      if(frame==="4h") candles=aggregate(candles,14400);
      source=market==="XAUUSD"?(symbol==="GC=F"?"Yahoo Gold futures proxy (GC=F), not spot XAUUSD":"Yahoo XAUUSD reference"): "Yahoo Finance public chart feed";
    }
    if(!candles?.length) throw new Error("The selected feed returned no candles. Try another timeframe.");
    return res.status(200).json({market,frame,symbol,source,updatedAt:new Date().toISOString(),candles:candles.slice(-500)});
  } catch(e) {
    return res.status(502).json({error:e.message||"Market feed unavailable"});
  }
}
