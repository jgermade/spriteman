/**
 * Virtual WASMFS file storage service backed by local persistent storage.
 */

const WASMFS_PREFIX = 'wasmfs:projects:';

export interface FileEntry {
  name: string;
  updatedAt: number;
}

class StorageService {
  /**
   * Lists all stored project file names.
   */
  public async listFiles(): Promise<FileEntry[]> {
    const files: FileEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(WASMFS_PREFIX)) {
        const name = key.slice(WASMFS_PREFIX.length);
        let updatedAt = Date.now();
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed._savedAt) updatedAt = parsed._savedAt;
          }
        } catch {}
        files.push({ name, updatedAt });
      }
    }
    return files.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Saves a project file into the virtual WASMFS.
   */
  public async saveFile(name: string, content: string): Promise<void> {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    let toStore = content;
    try {
      const parsed = JSON.parse(content);
      parsed._savedAt = Date.now();
      toStore = JSON.stringify(parsed);
    } catch {}
    localStorage.setItem(WASMFS_PREFIX + filename, toStore);
  }

  /**
   * Reads a project file from the virtual WASMFS.
   */
  public async readFile(name: string): Promise<string | null> {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    return localStorage.getItem(WASMFS_PREFIX + filename);
  }

  /**
   * Deletes a project file from virtual WASMFS.
   */
  public async deleteFile(name: string): Promise<void> {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    localStorage.removeItem(WASMFS_PREFIX + filename);
  }
}

export const storageService = new StorageService();
