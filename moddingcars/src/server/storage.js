// Build storage. v1 uses a JSON file so the app runs with zero setup.
// Anything implementing { create, get } can replace it (Postgres, SQLite,
// a KV store). Builds carry an ownerId so user accounts can be added later
// without migrating the data shape.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newId(length = 8) {
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}

export class JsonFileStore {
  constructor(file) {
    this.file = file;
    this.builds = null;
    this.writing = Promise.resolve();
  }

  async load() {
    if (this.builds) return;
    try {
      this.builds = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.builds = {};
    }
  }

  async create({ title, plan, ownerId = null }) {
    await this.load();
    let id = newId();
    while (this.builds[id]) id = newId();
    const build = { id, title, ownerId, createdAt: new Date().toISOString(), plan };
    this.builds[id] = build;
    await this.persist();
    return build;
  }

  async get(id) {
    await this.load();
    return this.builds[id] || null;
  }

  persist() {
    // Serialize writes; write to a temp file then rename so a crash never leaves half a file.
    this.writing = this.writing.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.builds));
      await fs.rename(tmp, this.file);
    });
    return this.writing;
  }
}
