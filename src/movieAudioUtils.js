export function decodeBase64(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function splitNarration(text, maxLength = 3000) {
  const chars = Array.from(String(text || "").trim());
  if (!chars.length) return [];
  const chunks = [];
  let current = "";
  for (const char of chars) {
    if (Array.from(current).length >= maxLength) {
      const boundary = Math.max(current.lastIndexOf("۔"), current.lastIndexOf("!"), current.lastIndexOf("?"), current.lastIndexOf(" "));
      if (boundary > maxLength * 0.6) {
        chunks.push(current.slice(0, boundary + 1).trim());
        current = current.slice(boundary + 1).trimStart();
      } else {
        chunks.push(current);
        current = "";
      }
    }
    current += char;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function joinPcm16(chunks, silenceMs = 180, sampleRate = 24000, channels = 1) {
  const gapSamples = Math.max(0, Math.round(sampleRate * silenceMs / 1000)) * channels;
  const normalized = (chunks || []).map(chunk => chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || []))
    .filter(chunk => chunk.length >= 2);
  const total = normalized.reduce((sum, chunk) => sum + chunk.length - (chunk.length % 2), 0) + Math.max(0, normalized.length - 1) * gapSamples * 2;
  const output = new Uint8Array(total);
  let offset = 0;
  normalized.forEach((chunk, index) => {
    const length = chunk.length - (chunk.length % 2);
    output.set(chunk.subarray(0, length), offset);
    offset += length;
    if (index < normalized.length - 1) offset += gapSamples * 2;
  });
  return output.subarray(0, offset);
}

export function pcm16ToWav(pcm, sampleRate = 24000, channels = 1) {
  const data = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm || []);
  const usableLength = data.length - (data.length % 2);
  const buffer = new ArrayBuffer(44 + usableLength);
  const view = new DataView(buffer);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, "RIFF");
  view.setUint32(4, 36 + usableLength, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, usableLength, true);
  new Uint8Array(buffer, 44).set(data.subarray(0, usableLength));
  return new Blob([buffer], { type: "audio/wav" });
}

export function narrationText(scenes) {
  return (scenes || []).map(scene => String(scene?.narration || scene?.subtitle || "").trim()).filter(Boolean).join("\n\n");
}
