export const TRADER_FRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1w"];

export function normalizeCandles(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.candles;
  if (!Array.isArray(rows)) throw new Error("مارکیٹ ڈیٹا کا فارمیٹ درست نہیں۔");
  const byTime = new Map();
  for (const row of rows) {
    const candle = Array.isArray(row)
      ? { time: Number(row[0]) > 1e12 ? Number(row[0]) / 1000 : Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) || 0 }
      : { time: Number(row?.time), open: Number(row?.open), high: Number(row?.high), low: Number(row?.low), close: Number(row?.close), volume: Number(row?.volume) || 0 };
    if (![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) continue;
    if (candle.high < candle.low || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) continue;
    candle.time = Math.floor(candle.time);
    byTime.set(candle.time, candle);
  }
  const result = [...byTime.values()].sort((a, b) => a.time - b.time);
  if (result.length < 30) throw new Error("کم از کم 30 درست کینڈلز دستیاب نہیں؛ سگنل جاری نہیں کیا جائے گا۔");
  return result;
}

export function parseTraderResponse(value) {
  const raw = String(value ?? "").trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI نے قابلِ مطالعہ تجزیاتی JSON واپس نہیں کیا۔");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const signal = String(parsed.signal || "WAIT").toUpperCase();
  if (!["STRONG BUY", "BUY", "WAIT"].includes(signal)) parsed.signal = "WAIT";
  else parsed.signal = signal;
  parsed.expertVotes = Array.isArray(parsed.expertVotes) ? parsed.expertVotes.slice(0, 5) : [];
  return parsed;
}

export function tradePriceLines(result) {
  if (!result || result.signal === "WAIT") return [];
  const lines = [];
  const add = (value, title, color) => {
    const n = Number(String(value ?? "").replace(/,/g, "").match(/-?\\d+(?:\\.\\d+)?/)?.[0]);
    if (Number.isFinite(n) && n > 0 && !lines.some(x => x.price === n)) lines.push({ price: n, title, color });
  };
  const entry = result.entryZone;
  if (Array.isArray(entry)) entry.forEach((v, i) => add(v, i ? "BUY ZONE HIGH" : "BUY ZONE LOW", "#0d9488"));
  else add(entry, "BUY ENTRY", "#0d9488");
  add(result.stopLoss, "STRUCTURAL INVALIDATION", "#dc2626");
  add(result.tp1, "TP1 · LIQUIDITY", "#2563eb");
  add(result.finalStructuralTarget, "FINAL LIQUIDITY RUNNER", "#7c3aed");
  if (!lines.some(x => /TP1/.test(x.title))) (result.targets || []).slice(0, 3).forEach((v, i) => add(v, "STRUCTURAL TP" + (i + 1), "#2563eb"));
  return lines;
}

export function summarizeVolume(candles) {
  const rows = candles.slice(-21);
  if (rows.length < 6) return { surge: false, ratio: null, sentiment: "UNKNOWN" };
  const last = rows.at(-1);
  const base = rows.slice(0, -1);
  const avg = base.reduce((sum, c) => sum + (Number(c.volume) || 0), 0) / base.length;
  const ratio = avg > 0 ? (Number(last.volume) || 0) / avg : null;
  return { surge: ratio !== null && ratio >= 2, ratio: ratio === null ? null : Number(ratio.toFixed(2)), sentiment: last.close > last.open ? "Bullish candle volume" : last.close < last.open ? "Bearish candle volume" : "Neutral candle volume", note: "Candle volume is not exchange order-flow or proof of whale activity." };
}
