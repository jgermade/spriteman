/**
 * Project file storage.
 *
 * Backed by IndexedDB: projects routinely run into megabytes and `localStorage` caps out
 * around 5 MB per origin, where a failed write throws and is easy to lose silently.
 * Anything previously written to `localStorage` is migrated on first use, and that path
 * stays as a fallback for environments where IndexedDB is unavailable.
 */

const LEGACY_PREFIX = 'wasmfs:projects:';
const DB_NAME = 'spritemotion';
const DB_VERSION = 1;
const STORE = 'projects';

export interface FileEntry {
  name: string;
  updatedAt: number;
}

interface StoredProject {
  name: string;
  content: string;
  updatedAt: number;
}

/** Raised when a project cannot be persisted because the origin is out of storage. */
export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

const isQuotaError = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
};

const withJsonExtension = (name: string): string => (name.endsWith('.json') ? name : `${name}.json`);

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

class StorageService {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private migrated = false;

  private openDatabase(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });

    return this.dbPromise;
  }

  /** Moves anything left in the old `localStorage` namespace into IndexedDB, once. */
  private async migrateLegacyFiles(db: IDBDatabase): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;
    if (typeof localStorage === 'undefined') return;

    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
    }
    if (legacyKeys.length === 0) return;

    for (const key of legacyKeys) {
      const content = localStorage.getItem(key);
      if (content === null) continue;
      const name = withJsonExtension(key.slice(LEGACY_PREFIX.length));
      let updatedAt = Date.now();
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed._savedAt === 'number') updatedAt = parsed._savedAt;
      } catch {
        // Keep the default timestamp for unparseable content.
      }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ name, content, updatedAt } satisfies StoredProject);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        localStorage.removeItem(key);
      } catch {
        // Leave the legacy copy in place if the move fails; it is still readable.
      }
    }
  }

  private async getDb(): Promise<IDBDatabase | null> {
    const db = await this.openDatabase();
    if (db) await this.migrateLegacyFiles(db);
    return db;
  }

  public async listFiles(): Promise<FileEntry[]> {
    const db = await this.getDb();
    if (!db) return this.listFilesFromLocalStorage();

    try {
      const tx = db.transaction(STORE, 'readonly');
      const records = await request<StoredProject[]>(tx.objectStore(STORE).getAll() as IDBRequest<StoredProject[]>);
      return records
        .map((record) => ({ name: record.name.replace(/\.json$/, ''), updatedAt: record.updatedAt || 0 }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return this.listFilesFromLocalStorage();
    }
  }

  /**
   * Persists a project. Throws `StorageQuotaError` when the origin is out of space so the
   * caller can tell the user instead of losing the edit silently.
   */
  public async saveFile(name: string, content: string): Promise<void> {
    const filename = withJsonExtension(name);
    const record: StoredProject = { name: filename, content, updatedAt: Date.now() };
    const db = await this.getDb();

    if (db) {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        return;
      } catch (err) {
        if (isQuotaError(err)) {
          throw new StorageQuotaError(
            `Not enough storage left to save "${name}". Export the project to a file and free up space.`
          );
        }
        // Fall through to the localStorage path on any other IndexedDB failure.
      }
    }

    try {
      localStorage.setItem(LEGACY_PREFIX + filename, content);
    } catch (err) {
      if (isQuotaError(err)) {
        throw new StorageQuotaError(
          `Not enough storage left to save "${name}". Export the project to a file and free up space.`
        );
      }
      throw err;
    }
  }

  public async readFile(name: string): Promise<string | null> {
    const filename = withJsonExtension(name);
    const db = await this.getDb();

    if (db) {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const record = await request<StoredProject | undefined>(
          tx.objectStore(STORE).get(filename) as IDBRequest<StoredProject | undefined>
        );
        if (record) return record.content;
      } catch {
        // Fall through to the legacy location.
      }
    }

    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LEGACY_PREFIX + filename);
  }

  public async deleteFile(name: string): Promise<void> {
    const filename = withJsonExtension(name);
    const db = await this.getDb();

    if (db) {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(filename);
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      } catch {
        // Ignore: the legacy removal below is still attempted.
      }
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_PREFIX + filename);
    }
  }

  private listFilesFromLocalStorage(): FileEntry[] {
    const files: FileEntry[] = [];
    if (typeof localStorage === 'undefined') return files;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
      const name = key.slice(LEGACY_PREFIX.length).replace(/\.json$/, '');
      let updatedAt = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || '{}');
        if (parsed && typeof parsed._savedAt === 'number') updatedAt = parsed._savedAt;
      } catch {
        // Keep 0 so the entry sorts last.
      }
      files.push({ name, updatedAt });
    }
    return files.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export const storageService = new StorageService();
