const DB_NAME = "sher-ai-video-library";
const STORE_NAME = "videos";
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("اس ڈیوائس میں محفوظ گیلری دستیاب نہیں۔"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("گیلری کھل نہیں سکی۔"));
  });
}

export async function saveVideoToGallery(blob, title = "SHER AI ویڈیو") {
  if (!(blob instanceof Blob) || blob.size < 10000) {
    throw new Error("ویڈیو فائل درست یا مکمل نہیں ہے، اسے گیلری میں محفوظ نہیں کیا گیا۔");
  }
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch { /* Browser may decline persistent storage. */ }
  }
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `video-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: String(title).trim().slice(0, 100) || "SHER AI ویڈیو",
    createdAt: new Date().toISOString(),
    size: blob.size,
    type: blob.type || "video/mp4",
    blob
  };
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("ویڈیو محفوظ نہیں ہو سکی۔"));
      tx.onabort = () => reject(tx.error || new Error("گیلری میں جگہ یا اجازت کا مسئلہ ہے۔"));
    });
  } finally {
    db.close();
  }
  return record;
}

export async function loadGalleryVideos() {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error || new Error("گیلری لوڈ نہیں ہو سکی۔"));
    });
  } finally {
    db.close();
  }
}
