import fs from "node:fs";
import path from "node:path";
import { assertValidStorageKey } from "./keys.js";

export class LocalStorageProvider {
  constructor(rootDir) {
    this.rootDir = rootDir;
    fs.mkdirSync(rootDir, { recursive: true });
  }

  resolveKey(storageKey) {
    const normalized = assertValidStorageKey(storageKey);
    return path.join(this.rootDir, normalized);
  }

  async saveFromBuffer(storageKey, buffer) {
    const filePath = this.resolveKey(storageKey);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return { storageKey, byteSize: buffer.length };
  }

  async readBuffer(storageKey) {
    const filePath = this.resolveKey(storageKey);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.promises.readFile(filePath);
  }

  async exists(storageKey) {
    return fs.existsSync(this.resolveKey(storageKey));
  }

  async delete(storageKey) {
    const filePath = this.resolveKey(storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }
}
