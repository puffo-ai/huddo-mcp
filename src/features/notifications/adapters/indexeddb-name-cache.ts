import { openIdb } from "../../../utils/idb-open";

const DB_NAME = "puffo-name-cache";
const STORE = "names";

async function openCache(): Promise<IDBDatabase> {
  return openIdb(DB_NAME, 1, {
    onUpgradeNeeded: (db) => {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    },
  });
}

export async function getName(id: string): Promise<string | null> {
  try {
    const db = await openCache();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as string | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function clearAll(): Promise<void> {
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
  }
}

export async function setNames(
  entries: { id: string; name: string | null }[],
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const { id, name } of entries) {
        if (name === null) store.delete(id);
        else store.put(name, id);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
  }
}
