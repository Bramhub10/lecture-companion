/**
 * Tiny IndexedDB wrapper for crash-safe recording.
 *
 * As the MediaRecorder emits chunks we append each one here, so if the tab
 * crashes, the laptop sleeps, or the user closes the page mid-lecture, the audio
 * is still on disk and can be recovered on next load. Chunks are stored in order;
 * concatenating them all (including the first, which holds the container header)
 * reproduces a valid audio file.
 */

const DB_NAME = "lecture-companion";
const STORE = "chunks";
const META = "meta";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = fn(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

/** Append one recorded chunk. */
export async function appendChunk(chunk: Blob): Promise<void> {
  await tx(STORE, "readwrite", (s) => s.add(chunk));
}

/** Record metadata about the in-progress session (e.g. mime type, start time). */
export async function setMeta(key: string, value: unknown): Promise<void> {
  await tx(META, "readwrite", (s) => s.put(value, key));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return tx<T>(META, "readonly", (s) => s.get(key) as IDBRequest<T>);
}

/** Number of stored chunks — used to detect a recoverable recording. */
export async function chunkCount(): Promise<number> {
  return tx<number>(STORE, "readonly", (s) => s.count());
}

/** Reassemble all stored chunks into a single Blob of the given type. */
export async function assembleRecording(type: string): Promise<Blob> {
  const chunks = await tx<Blob[]>(STORE, "readonly", (s) => s.getAll() as IDBRequest<Blob[]>);
  return new Blob(chunks, { type });
}

/** Wipe the in-progress recording (call after a successful save). */
export async function clearRecording(): Promise<void> {
  await tx(STORE, "readwrite", (s) => s.clear());
  await tx(META, "readwrite", (s) => s.clear());
}
