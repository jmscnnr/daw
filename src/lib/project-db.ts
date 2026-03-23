import type { Project } from "@/types/project";

const DB_NAME = "daw-projects";
const DB_VERSION = 1;
const STORE_NAME = "projects";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("modifiedAt", "modifiedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function saveProject(project: Project): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").put(project);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").get(id);
    req.onsuccess = () => resolve(req.result as Project | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export interface ProjectMeta {
  id: string;
  name: string;
  modifiedAt: number;
  trackCount: number;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readonly").index("modifiedAt").openCursor(null, "prev");
    const results: ProjectMeta[] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const p = cursor.value as Project;
        results.push({
          id: p.id,
          name: p.name,
          modifiedAt: p.modifiedAt,
          trackCount: p.tracks.length,
        });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}
