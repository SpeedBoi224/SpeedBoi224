// Data access for the static build (no server). The planner runs in the
// browser, and a saved build is packed into the link itself as
// "#build-<hex>", so links work on any static host and never expire.
// Hex keeps the hash to letters and digits, which every host passes through.

import { generatePlan } from '../src/engine/planner.js';
import { buildCatalog, defaultBuildTitle } from '../src/engine/catalog.js';

const TARGET = window.MC_TARGET || 'web';
// When the page runs inside a frame (e.g. a claude.ai artifact) its own URL
// is not the one to share; the build sets the public URL here.
const SHARE_BASE = window.MC_SHARE_BASE || '';
const HASH = /^#build-([zj])([0-9a-f]+)$/;

export const features = {
  print: TARGET !== 'artifact',
  nativeShare: TARGET !== 'artifact' && !!navigator.share,
};
export const homeHref = '#';

export const getCatalog = async () => buildCatalog();

export const createPlan = async (input) => generatePlan(input);

export async function saveBuild({ title, input }) {
  const plan = generatePlan(input); // validates
  const payload = { t: (title || '').trim().slice(0, 80), d: new Date().toISOString().slice(0, 10), i: plan.input };
  return { shareUrl: `${shareBase()}#build-${await encode(payload)}` };
}

export async function loadBuild() {
  const m = location.hash.match(HASH);
  if (!m) {
    if (/^#build-/.test(location.hash)) throw new Error('This build link is incomplete.');
    return null;
  }
  let data;
  try {
    data = await decode(m[1], m[2]);
  } catch {
    throw new Error('This build link is damaged.');
  }
  const plan = generatePlan(data.i);
  return { title: data.t || defaultBuildTitle(plan), createdAt: data.d, plan };
}

export const currentShareUrl = () => shareBase() + location.hash;

export function goHome() {
  location.hash = '';
}

export function onRouteChange(cb) {
  window.addEventListener('hashchange', cb);
}

function shareBase() {
  return SHARE_BASE || location.href.split('#')[0];
}

const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

// "z" = deflate-compressed JSON, "j" = plain JSON (browsers without CompressionStream).
async function encode(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') return 'z' + toHex(await pipe(bytes, new CompressionStream('deflate-raw')));
  return 'j' + toHex(bytes);
}

async function decode(kind, hex) {
  let bytes = fromHex(hex);
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes));
}
