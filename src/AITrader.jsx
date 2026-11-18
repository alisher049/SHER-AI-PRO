import React, { useCallback, useEffect, useRef, useState } from "react";
import * as LWC from "lightweight-charts";
import { normalizeCandles, parseTraderResponse, summarizeVolume, tradePriceLines, TRADER_FRAMES } from "./traderUtils.js";

const MARKETS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD"];
const LABELS = { "1m":"1M", "3m":"3M", "5m":"5M", "15m":"15M", "1h":"1H", "4h":"4H", "1d":"1D", "1w":"1W" };

export default function AITrader({ onBack, session }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const linesRef = useRef([]);
  const candlesRef = useRef([]);
  const [market, setMarket] = useState("BTCUSDT");
  const [frame, setFrame] = useState("4h");
  const [candlesBusy, setCandlesBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [dataStatus, setDataStatus] = useState("لائیو مارکیٹ ڈیٹا لوڈ ہو رہا ہے…");
  const [source, setSource] = useState("");
  const [question, setQuestion] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState("");

  const clearLines = useCallback(() => {
    if (!seriesRef.current) return;
    for (const line of linesRef.current) {
      try { seriesRef.current.removePriceLine(line); } catch {}
    }
    linesRef.current = [];
  }, []);

  const drawAnalysis = useCallback((result) => {
    clearLines();
    if (!seriesRef.current) return;
    for (const item of tradePriceLines(result)) {
      try {
        linesRef.current.push(seriesRef.current.createPriceLine({
          price: item.price, color: item.color, lineWidth: 2,
          lineStyle: LWC.LineStyle?.Dashed ?? 2, axisLabelVisible: true, title: item.title
        }));
      } catch {}
    }
  }, [clearLines]);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const chart = LWC.createChart(hostRef.current, {
      width: Math.max(320, hostRef.current.clientWidth), height: Math.max(260, hostRef.current.clientHeight),
      layout: { background: { color: "#07111f" }, textColor: "#dbeafe" },
      grid: { vertLines: { color: "#142235" }, horzLines: { color: "#142235" } },
      rightPriceScale: { borderColor: "#26384d" }, timeScale: { borderColor: "#26384d", timeVisible: true, secondsVisible: false },
      crosshair: { mode: LWC.CrosshairMode?.Normal ?? 0 }
    });
    const series = chart.addCandlestickSeries({
      upColor: "#16a34a", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#16a34a", wickDownColor: "#ef4444"
    });
    chartRef.current = chart;
    seriesRef.current = series;
    const resize = () => {
      if (hostRef.current && chartRef.current === chart) chart.applyOptions({ width: Math.max(320, hostRef.current.clientWidth), height: Math.max(260, hostRef.current.clientHeight) });
    };
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(hostRef.current);
    } else window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      clearLines();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [clearLines]);

  const loadCandles = useCallback(async () => {
    setCandlesBusy(true);
    setError("");
    setDataStatus("تصدیق شدہ مارکیٹ کینڈلز حاصل ہو رہی ہیں…");
    try {
      const url = "/api/market-data?market=" + encodeURIComponent(market) + "&frame=" + encodeURIComponent(frame);
      const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "مارکیٹ ڈیٹا دستیاب نہیں۔");
      const rows = normalizeCandles(payload);
      candlesRef.current = rows;
      seriesRef.current?.setData(rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      chartRef.current?.timeScale().fitContent();
      clearLines();
      setSource(payload.source || payload.provider || "ماخذ کی تصدیق نہیں ہوئی");
      setDataStatus(rows.length + " درست کینڈلز موصول؛ آخری اپ ڈیٹ: " + new Date(payload.updatedAt || Date.now()).toLocaleTimeString());
    } catch (e) {
      candlesRef.current = [];
      seriesRef.current?.setData([]);
      clearLines();
      setSource("");
      setDataStatus("مارکیٹ ڈیٹا کی خرابی");
      setError(e.message || "مارکیٹ ڈیٹا لوڈ نہیں ہو سکا۔");
    } finally {
      setCandlesBusy(false);
    }
  }, [market, frame, clearLines]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  const scanMarket = async () => {
    if (scanBusy) return;
    if (!session?.access_token) { setError("تجزیے کے لیے مالک کے اکاؤنٹ میں دوبارہ سائن اِن کریں۔"); return; }
    if (candlesRef.current.length < 30) { setError("پہلے درست مارکیٹ کینڈلز لوڈ ہونے دیں۔"); return; }
    setScanBusy(true);
    setError("");
    setDataStatus("سات ٹائم فریمز کا ادارہ جاتی تجزیہ جاری ہے…");
    try {
      const volumeAnalysis = summarizeVolume(candlesRef.current);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({
          mode: "trader",
          language: "Urdu",
          prompt: (question.trim() || "موجودہ مارکیٹ کا مکمل ادارہ جاتی تجزیہ کریں۔ صرف Spot BUY یا WAIT دیں۔") +
            " منتخب چارٹ: " + market + " / " + frame + ". صرف بند شدہ کینڈلز اور فراہم کردہ حقیقی سطحوں پر انحصار کریں۔",
          traderData: { market, timeframe: frame, candles: candlesRef.current.slice(-240), volumeAnalysis }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "AI تجزیہ ناکام ہوا۔");
      const parsed = parseTraderResponse(payload.text);
      setAnalysis({ ...parsed, model: payload.model, technical360: payload.technical360 });
      drawAnalysis(parsed);
      setDataStatus("AI تجزیہ موصول؛ سرور کے سات ٹائم فریمز اور بند کینڈلز کی بنیاد پر");
    } catch (e) {
      setError(e.message || "تجزیہ مکمل نہیں ہو سکا۔");
      setDataStatus("تجزیہ مکمل نہیں ہوا؛ کوئی نیا سگنل نہیں دیا گیا۔");
    } finally {
      setScanBusy(false);
    }
  };

  const speak = () => {
    if (!analysis || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const text = [analysis.signal, analysis.marketNow, analysis.entryReason, analysis.sniperPlan, analysis.invalidation].filter(Boolean).join(". ");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ur-PK";
    utterance.rate = 0.94;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main dir="rtl" style={{ position:"fixed", inset:0, zIndex:30, display:"flex", flexDirection:"column", background:"#07111f", color:"#e5edf7", paddingBottom:"env(safe-area-inset-bottom)" }}>
      <header style={{ display:"flex", alignItems:"center", gap:10, padding:"max(28px,env(safe-area-inset-top)) 12px 10px", background:"#0b1728", borderBottom:"1px solid #203148" }}>
        <button type="button" onClick={onBack} aria-label="واپس" style={btnStyle}>←</button>
        <strong style={{ flex:1, fontSize:14 }}>SHER AI PRO · INSTITUTIONAL SPOT DESK</strong>
        <span style={{ color:"#fbbf24", fontSize:11 }}>BUY / WAIT</span>
      </header>
      <div style={{ display:"flex", gap:8, padding:"9px 10px", overflowX:"auto", background:"#0b1728" }}>
        <select aria-label="مارکیٹ" value={market} onChange={e=>{setMarket(e.target.value);setAnalysis(null);}} style={selectStyle}>{MARKETS.map(x=><option key={x}>{x}</option>)}</select>
        {TRADER_FRAMES.map(x=><button key={x} type="button" onClick={()=>{setFrame(x);setAnalysis(null);}} style={{...btnStyle, background:frame===x?"#d6a53a":"#17283d", color:frame===x?"#101827":"#dbeafe", padding:"7px 10px"}}>{LABELS[x]}</button>)}
        <button type="button" onClick={loadCandles} disabled={candlesBusy} style={btnStyle}>{candlesBusy?"…":"⟳"}</button>
      </div>
      <div style={{ padding:"6px 12px", fontSize:11, color:error?"#fca5a5":"#9fb3c9", background:"#0d1b2d" }}>{dataStatus}{source?" · ماخذ: "+source:""}</div>
      <div ref={hostRef} style={{ minHeight:260, flex:"1 1 38%", width:"100%" }} />
      <section style={{ overflowY:"auto", maxHeight:"48%", padding:"10px 12px 16px", borderTop:"1px solid #26384d", background:"#0b1728" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();scanMarket();}}} placeholder="مثلاً: کیا ابھی Spot Buy کا درست موقع ہے؟" style={{...inputStyle, flex:1}} />
          <button type="button" disabled={scanBusy||candlesBusy||!session?.access_token} onClick={scanMarket} style={{...btnStyle, background:"#d6a53a", color:"#111827", fontWeight:800, opacity:scanBusy?0.6:1}}>{scanBusy?"جانچ…":"اسکین"}</button>
        </div>
        {error&&<p role="alert" style={{color:"#fca5a5",fontSize:12}}>{error}</p>}
        {analysis&&<div style={{ marginTop:10, padding:12, border:"1px solid #2a405b", borderRadius:12, background:"#101f33" }}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
            <strong style={{fontSize:18,color:analysis.signal==="WAIT"?"#fbbf24":"#4ade80"}}>{analysis.signal}</strong>
            <button type="button" onClick={speak} style={btnStyle}>🔊 سنیں</button>
          </div>
          {analysis.consensus&&<p style={pStyle}>{typeof analysis.consensus==="string"?analysis.consensus:JSON.stringify(analysis.consensus)}</p>}
          {analysis.marketNow&&<p style={pStyle}><b>مارکیٹ کی صورتِ حال:</b> {analysis.marketNow}</p>}
          {analysis.institutionalTrap&&<p style={pStyle}><b>ممکنہ لیکویڈیٹی ٹریپ:</b> {analysis.institutionalTrap}</p>}
          {analysis.entryReason&&<p style={pStyle}><b>انٹری کی وجہ:</b> {analysis.entryReason}</p>}
          {analysis.entryZone&&<p style={pStyle}><b>خریداری زون:</b> {Array.isArray(analysis.entryZone)?analysis.entryZone.join(" – "):analysis.entryZone}</p>}
          {analysis.stopLoss&&<p style={pStyle}><b>اسٹرکچرل اسٹاپ:</b> {analysis.stopLoss}</p>}
          {analysis.tp1&&<p style={pStyle}><b>پہلا لیکویڈیٹی ہدف:</b> {analysis.tp1}</p>}
          {analysis.finalStructuralTarget&&<p style={pStyle}><b>آخری اسٹرکچرل ہدف:</b> {analysis.finalStructuralTarget}</p>}
          {analysis.sniperPlan&&<p style={pStyle}><b>مشروط منصوبہ:</b> {analysis.sniperPlan}</p>}
          {analysis.invalidation&&<p style={pStyle}><b>سیٹ اپ منسوخ ہونے کی شرط:</b> {analysis.invalidation}</p>}
          {analysis.notes&&<p style={pStyle}>{Array.isArray(analysis.notes)?analysis.notes.join(" · "):analysis.notes}</p>}
          {analysis.expertVotes.length>0&&<div style={{marginTop:8}}><b>پانچ ماہرین کی رائے</b>{analysis.expertVotes.map((v,i)=><p key={i} style={{...pStyle,margin:"4px 0"}}>{v.expert||"ماہر "+(i+1)}: {v.vote||"WAIT"} · {v.score??"—"}/100 — {v.reason||""}</p>)}</div>}
          <small style={{color:"#9fb3c9"}}>{analysis.educationalDisclaimer||"یہ تعلیمی تجزیہ ہے، مالی مشورہ نہیں۔ مارکیٹ میں نقصان کا خطرہ موجود ہے۔"} · ماڈل: {analysis.model||"AI"}</small>
        </div>}
      </section>
    </main>
  );
}

const btnStyle={border:"1px solid #344b66",borderRadius:9,background:"#17283d",color:"#e5edf7",padding:"8px 11px",fontSize:12,whiteSpace:"nowrap"};
const selectStyle={border:"1px solid #344b66",borderRadius:9,background:"#17283d",color:"#e5edf7",padding:"7px 10px",fontSize:12};
const inputStyle={minWidth:0,border:"1px solid #344b66",borderRadius:10,background:"#101f33",color:"#fff",padding:"11px 12px",fontSize:13};
const pStyle={fontSize:12,lineHeight:1.8,color:"#d6e1ef",margin:"8px 0"};
