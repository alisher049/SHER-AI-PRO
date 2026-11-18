import React, { useEffect, useRef, useState } from "react";
import * as LWC from "lightweight-charts";

const PAIRS = ["BTCUSDT", "XAUUSD", "SOLUSDT", "ETHUSDT"];
const TFS = ["1M", "5M", "15M", "1H", "4H", "1D", "1W"];

function calcRSI(closes, period = 14) {
  if (closes.length <= period) return 50;
  let g = 0, l = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  return l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(1);
}

function calcEMA(closes, period) {
  if (!closes.length) return 0;
  const k = 2 / (period + 1);
  let e = closes[0];
  for (let i = 1; i < closes.length; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

function calcATR(candles, period = 14) {
  if (candles.length <= period) return 1;
  let s = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    s += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  return s / period;
}

export default function AITrader({ onBack }) {
  const boxRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);
  const dataRef = useRef([]);
  const htfRef = useRef("BULLISH");
  const recRef = useRef(null);
  const onRef = useRef(false);

  const [pair, setPair] = useState("BTCUSDT");
  const [tf, setTf] = useState("4H");
  const [talk, setTalk] = useState(false);
  const [dataStatus, setDataStatus] = useState("مارکیٹ ڈیٹا لوڈ ہو رہا ہے…");
  const [msg, setMsg] = useState("🔊 بٹن دبائیں — AI خود چارٹ پر Spot Buying زون مارک کر کے بات کرے گا");

  const clearLines = () => {
    if (!seriesRef.current) return;
    linesRef.current.forEach((x) => { try { seriesRef.current.removePriceLine(x); } catch {} });
    linesRef.current = [];
  };

  const addLine = (price, color, title, style = 0) => {
    if (!seriesRef.current || !Number.isFinite(+price)) return;
    linesRef.current.push(seriesRef.current.createPriceLine({ price: +price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }));
  };

  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[\u0600-\u06FF]/.test(text) ? "ur-PK" : /[\u0900-\u097F]/.test(text) ? "hi-IN" : "en-US";
    u.volume = 1.0;
    u.rate = 0.98;
    u.onend = () => { if (onRef.current) listen(); };
    window.speechSynthesis.speak(u);
  };

  const analyze = (data, query = "") => {
    if (!data || data.length < 25 || !seriesRef.current) return;
    clearLines();
    const closes = data.map((c) => c.close);
    const last = data[data.length - 1];
    const recent = data.slice(-40);
    const low = Math.min(...recent.map((c) => c.low));
    const high = Math.max(...recent.map((c) => c.high));
    const rsi = calcRSI(closes, 14);
    const atr = calcATR(data, 14);
    const ema200 = calcEMA(closes, Math.min(200, closes.length));
    const fib618 = +(high - (high - low) * 0.618).toFixed(2);

    let fvg = null;
    for (let i = data.length - 3; i >= Math.max(2, data.length - 18); i--) {
      if (data[i].low > data[i - 2].high) { fvg = +((data[i].low + data[i - 2].high) / 2).toFixed(2); break; }
    }

    const prevLow = Math.min(...data.slice(-22, -2).map((c) => c.low));
    const sweep = data.slice(-3).some((c) => c.low <= prevLow && c.close > prevLow);
    let score = 45 + (htfRef.current === "BULLISH" ? 15 : 0) + (last.close >= ema200 ? 10 : 0) + (rsi <= 46 ? 12 : 0) + (sweep ? 10 : 0) + (fvg ? 5 : 0);
    score = Math.min(98, score);

    const buyZone = last.close <= fib618 * 1.015 ? last.close : fib618;
    const sl = +(low - atr * 0.65).toFixed(2);
    const tp = +(buyZone + Math.max(atr * 0.5, Math.abs(buyZone - sl)) * 3.2).toFixed(2);

    addLine(low, "#16a34a", "SMC ORDER BLOCK", 0);
    addLine(fib618, "#10b981", "FIB 0.618 GOLDEN POCKET", 1);
    addLine(high, "#dc2626", "RESISTANCE / TP ZONE", 0);
    addLine(sl, "#f97316", "SPOT STOP LOSS", 2);
    addLine(tp, "#0284c7", "SPOT TARGET (1:3.2)", 2);
    if (fvg) addLine(fvg, "#8b5cf6", "BULLISH FVG", 1);

    const out = score >= 68 || /buy|spot|خرید/i.test(query)
      ? `${pair} (${tf}) Spot Buy سیٹ اپ (${score}/100): RSI ${rsi} ہے، Buy Zone ${buyZone.toFixed(2)}، Stop Loss ${sl} اور ٹارگٹ ${tp} مارک کر دیا گیا ہے۔`
      : `${pair} (${tf}) اسکور ${score}/100 (RSI ${rsi}): Spot خریداری کے لیے قیمت کے ${fib618} (Golden Pocket) تک آنے کا انتظار بہتر ہے، ٹارگٹ ${tp} ہے۔`;
    setMsg(out);
    speak(out);
  };

  const listen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !onRef.current) return;
    try {
      const r = new SR();
      r.lang = "ur-PK";
      r.onresult = (e) => {
        const t = e.results?.[0]?.[0]?.transcript || "";
        if (t) { setMsg(`آپ: "${t}"`); analyze(dataRef.current, t); }
      };
      r.onend = () => { if (onRef.current && !window.speechSynthesis.speaking) setTimeout(listen, 300); };
      recRef.current = r;
      r.start();
    } catch {}
  };

  const toggle = () => {
    const next = !talk;
    setTalk(next);
    onRef.current = next;
    if (next) { setMsg("🎧 سن رہا ہوں... بولیں!"); analyze(dataRef.current); listen(); }
    else { window.speechSynthesis?.cancel(); try { recRef.current?.stop(); } catch {} setMsg("🔇 اسپیکر بند ہے"); }
  };

  useEffect(() => {
    if (!boxRef.current) return;
    const chart = LWC.createChart(boxRef.current, { width: boxRef.current.clientWidth, height: boxRef.current.clientHeight, layout: { background: { color: "#ffffff" }, textColor: "#0f172a" }, grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } } });
    const opts = { upColor: "#16a34a", downColor: "#dc2626", borderVisible: false, wickUpColor: "#16a34a", wickDownColor: "#dc2626" };
    const series = chart.addCandlestickSeries(opts);
    seriesRef.current = series;

    const load = async () => {
      const sym = pair === "XAUUSD" ? "PAXGUSDT" : pair;
      const base = "https://api.binance.com/api/v3/klines";
      try {
        const [r1, r2] = await Promise.all([fetch(`${base}?symbol=${sym}&interval=${tf.toLowerCase()}&limit=150`), fetch(`${base}?symbol=${sym}&interval=1d&limit=60`)]);
        if (!r1.ok || !r2.ok) throw new Error(`مارکیٹ ڈیٹا سرور نے جواب ${r1.status}/${r2.status} دیا`);
        const raw = await r1.json();
        const dRaw = await r2.json();
        if (!Array.isArray(raw) || raw.length < 25) throw new Error("اس مارکیٹ کے لیے حقیقی کینڈل ڈیٹا دستیاب نہیں");
        if (Array.isArray(dRaw) && dRaw.length > 20) {
          const dc = dRaw.map((k) => Number(k[4]));
          htfRef.current = dc[dc.length - 1] >= calcEMA(dc, 21) ? "BULLISH" : "ACCUMULATION";
        }
        const rows = raw.map((k) => ({ time: Math.floor(Number(k[0]) / 1000), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) }));
        dataRef.current = rows;
        series.setData(rows);
        setDataStatus(pair === "XAUUSD" ? "ڈیٹا: PAXGUSDT گولڈ پراکسی (اصل XAUUSD نہیں)" : "لائیو مارکیٹ ڈیٹا موصول ہو گیا");
        chart.timeScale().fitContent();
        analyze(rows);
      } catch (error) {
        dataRef.current = [];
        series.setData([]);
        clearLines();
        const reason = error?.message || "مارکیٹ ڈیٹا دستیاب نہیں";
        setDataStatus(`ڈیٹا کی خرابی: ${reason}`);
        setMsg("حقیقی مارکیٹ ڈیٹا نہیں ملا؛ فرضی کینڈلز نہیں دکھائی جا رہیں۔");
      }
    };
    load();
    const resize = () => boxRef.current && chart.applyOptions({ width: boxRef.current.clientWidth, height: boxRef.current.clientHeight });
    window.addEventListener("resize", resize);
    return () => { onRef.current = false; window.speechSynthesis?.cancel(); try { recRef.current?.stop(); } catch {} window.removeEventListener("resize", resize); chart.remove(); };
  }, [pair, tf]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#fff", display: "flex", flexDirection: "column", paddingBottom: "calc(58px + env(safe-area-inset-bottom))", zIndex: 30 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", color: "#fff", padding: "max(34px, env(safe-area-inset-top)) 12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 18 }}>←</button>
          <select value={pair} onChange={(e) => setPair(e.target.value)} style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 8, padding: "4px 8px", fontWeight: 700 }}>
            {PAIRS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>SHER AI PRO · SPOT SMC</div>
        <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>{tf}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-around", background: "#0f172a", padding: "6px 8px" }}>
        {TFS.map((t) => (
          <button key={t} onClick={() => setTf(t)} style={{ background: tf === t ? "#eab308" : "transparent", color: tf === t ? "#000" : "#cbd5e1", border: "none", borderRadius: 12, padding: "3px 9px", fontSize: 12, fontWeight: 700 }}>
            {t}
          </button>
        ))}
      </div>
      <div style={{ padding: "5px 10px", fontSize: 11, color: dataStatus.startsWith("ڈیٹا کی خرابی") ? "#b91c1c" : "#475569", background: "#f8fafc" }}>{dataStatus}</div>
      <div ref={boxRef} style={{ flex: 1, width: "100%" }} />
      <div style={{ position: "fixed", left: 14, right: 14, bottom: "calc(68px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: 10, zIndex: 45 }}>
        <div style={{ flex: 1, background: "rgba(15,23,42,0.92)", color: "#fff", borderRadius: 14, padding: "10px 14px", fontSize: 12 }}>{msg}</div>
        <button onClick={toggle} style={{ width: 58, height: 58, borderRadius: "50%", background: talk ? "#16a34a" : "#0f172a", color: "#fff", border: talk ? "3px solid #86efac" : "2px solid #38bdf8", fontSize: 24 }}>
          {talk ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}