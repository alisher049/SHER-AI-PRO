import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCandles, parseTraderResponse, summarizeVolume, tradePriceLines, TRADER_FRAMES } from "../src/traderUtils.js";
import { readFile } from "node:fs/promises";

const sampleCandles = (count = 40) => Array.from({length:count},(_,i)=>({
  time: 1700000000+i*60, open:100+i, high:102+i, low:99+i, close:101+i, volume:10
}));

test("trader supports the complete 1m to 1w timeframe set", () => {
  assert.deepEqual(TRADER_FRAMES, ["1m","3m","5m","15m","1h","4h","1d","1w"]);
});

test("market candle normalization sorts, deduplicates and validates OHLC", () => {
  const rows=sampleCandles();
  const result=normalizeCandles([rows[2],rows[0],rows[1],rows[1],{time:999,open:10,high:8,low:9,close:10}]);
  assert.equal(result.length,3);
  assert.deepEqual(result.map(x=>x.time),[rows[0].time,rows[1].time,rows[2].time]);
});

test("market candle normalization rejects insufficient or malformed history", () => {
  assert.throws(()=>normalizeCandles([{time:1,open:1,high:2,low:0,close:1}]),/30 درست کینڈلز/);
  assert.throws(()=>normalizeCandles({error:"offline"}),/فارمیٹ درست نہیں/);
});

test("trader response parser handles fenced JSON and limits expert votes", () => {
  const votes=Array.from({length:7},(_,i)=>({expert:"Expert "+i,vote:"BUY"}));
  const result=parseTraderResponse("```json\n"+JSON.stringify({signal:"STRONG BUY",expertVotes:votes})+"\n```");
  assert.equal(result.signal,"STRONG BUY");
  assert.equal(result.expertVotes.length,5);
});

test("invalid SELL signal is downgraded to WAIT for spot-buy-only UI", () => {
  const result=parseTraderResponse(JSON.stringify({signal:"STRONG SELL"}));
  assert.equal(result.signal,"WAIT");
});

test("chart lines use real numeric entry, invalidation and structural target levels", () => {
  const lines=tradePriceLines({signal:"STRONG BUY",entryZone:"62,000 - 62,200",stopLoss:"60,900",tp1:"64,000",finalStructuralTarget:"70,000"});
  assert.deepEqual(lines.map(x=>x.price),[62000,62200,60900,64000,70000]);
  assert.equal(tradePriceLines({signal:"WAIT",entryZone:"100",stopLoss:"90",targets:["120"]}).length,0);
});

test("volume helper does not label candle volume as verified order flow", () => {
  const rows=sampleCandles();
  rows[39].volume=100;
  const result=summarizeVolume(rows);
  assert.equal(result.surge,true);
  assert.match(result.note,/not exchange order-flow/);
  assert.equal(summarizeVolume(rows.slice(0,3)).sentiment,"UNKNOWN");
});

test("AI Trader UI sends the signed-in owner token to the institutional server mode", async () => {
  const source=await readFile(new URL("../src/AITrader.jsx",import.meta.url),"utf8");
  assert.ok(source.includes('mode: "trader"'));
  assert.ok(source.includes('Authorization: "Bearer " + session.access_token'));
  assert.ok(source.includes('traderData: { market, timeframe: frame, candles:'));
  assert.ok(source.includes('fetch("/api/market-data?market="'));
  assert.ok(source.includes("drawAnalysis(parsed)"));
});

test("every sidebar destination has a matching rendered panel", async () => {
  const app=await readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  const menu=app.slice(app.indexOf("const menuItems="),app.indexOf("const filteredMenuItems="));
  const ids=[...menu.matchAll(/id:"([^"]+)"/g)].map(x=>x[1]);
  for(const id of ids) assert.ok(app.includes('tab==="'+id+'"'),"Missing rendered panel for sidebar item: "+id);
  assert.ok(app.includes('tab==="tools"&&<div className="tools-grid">'));
  assert.ok(app.includes('tab==="remote"&&<div className="panel"><h2>QR Code Generator</h2>'));
});

test("AI Trader receives the authenticated app session", async () => {
  const app=await readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.ok(app.includes('<AITrader onBack={goBackToChat} session={session}'));
});
