import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server/app.js';
import { JsonFileStore } from '../src/server/storage.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server, baseUrl, dir;

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mc-'));
  server = createApp({ store: new JsonFileStore(path.join(dir, 'builds.json')), publicDir: path.join(root, 'public') });
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const input = {
  car: { modelId: 'bmw-335i', genId: 'e9x-n54', transmission: 'manual' },
  budget: 6000, goal: 'street', labor: 'shop', laborRate: 140, experience: 'new',
  existingMods: [{ name: 'JB4', link: 'https://example.com' }],
};
const post = (p, body) => fetch(baseUrl + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('catalog lists the five launch cars', async () => {
  const data = await (await fetch(baseUrl + '/api/catalog')).json();
  assert.equal(data.cars.length, 5);
  assert.ok(data.cars.every((c) => c.directions.length >= 3));
});

test('plan endpoint validates input', async () => {
  const bad = await post('/api/plan', { ...input, budget: 5 });
  assert.equal(bad.status, 400);
  const ok = await post('/api/plan', input);
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).stages.length > 0);
});

test('save, load and share a build', async () => {
  const res = await post('/api/builds', { title: 'My <N54>', input, plan: { evil: true } });
  assert.equal(res.status, 201);
  const { id, url } = await res.json();
  assert.equal(url, `/b/${id}`);

  const build = await (await fetch(`${baseUrl}/api/builds/${id}`)).json();
  assert.equal(build.title, 'My <N54>');
  assert.ok(build.plan.stages.length, 'plan regenerated server-side');
  assert.equal(build.plan.evil, undefined);
  assert.equal('ownerId' in build, false);

  const page = await (await fetch(baseUrl + url)).text();
  assert.match(page, /<title>My &lt;N54&gt; · moddingcars\.com<\/title>/);
});

test('unknown builds and paths 404; traversal blocked', async () => {
  assert.equal((await fetch(baseUrl + '/api/builds/doesnotexist')).status, 404);
  assert.equal((await fetch(baseUrl + '/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await fetch(baseUrl + '/styles.css')).status, 200);
});
