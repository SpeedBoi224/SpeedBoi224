import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CARS } from '../data/cars.js';
import { GOALS, EXPERIENCE, LABOR, DEFAULT_LABOR_RATE } from '../data/goals.js';
import { createPlan } from '../engine/providers.js';
import { PlanInputError } from '../engine/planner.js';
import { currentUser, can } from './auth.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const MAX_BODY = 64 * 1024;
const BUILD_ID = /^[A-Za-z0-9]{6,16}$/;

export function createApp({ store, publicDir }) {
  const catalog = {
    cars: CARS.map(({ id, make, model, generations, directions }) => ({
      id,
      make,
      model,
      directions,
      generations: generations.map(({ id, name, years, engine, aspiration, drivetrain, transmissions }) => ({
        id, name, years, engine, aspiration, drivetrain, transmissions,
      })),
    })),
    goals: GOALS,
    experience: EXPERIENCE,
    labor: LABOR,
    defaultLaborRate: DEFAULT_LABOR_RATE,
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const user = await currentUser(req);

    if (p === '/api/catalog' && req.method === 'GET') return json(res, 200, catalog);

    if (p === '/api/plan' && req.method === 'POST') {
      const body = await readJson(req);
      return json(res, 200, await createPlan(body, { user }));
    }

    if (p === '/api/builds' && req.method === 'POST') {
      if (!can(user, 'save_build')) return json(res, 403, { error: 'Upgrade to save more builds.' });
      const body = await readJson(req);
      // Never trust a client-sent plan: regenerate from the inputs.
      const plan = await createPlan(body.input || {}, { user });
      const title = (typeof body.title === 'string' && body.title.trim().slice(0, 80)) || `${plan.car.make} ${plan.car.model} ${plan.goal.name} build`;
      const build = await store.create({ title, plan, ownerId: user?.id ?? null });
      return json(res, 201, { id: build.id, url: `/b/${build.id}` });
    }

    const apiBuild = p.match(/^\/api\/builds\/([^/]+)$/);
    if (apiBuild && req.method === 'GET') {
      const build = BUILD_ID.test(apiBuild[1]) ? await store.get(apiBuild[1]) : null;
      if (!build) return json(res, 404, { error: 'Build not found.' });
      const { ownerId, ...publicBuild } = build;
      return json(res, 200, publicBuild);
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'Not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed.' });

    const share = p.match(/^\/b\/([^/]+)$/);
    if (share || p === '/') {
      let html = await fs.readFile(path.join(publicDir, 'index.html'), 'utf8');
      if (share && BUILD_ID.test(share[1])) {
        const build = await store.get(share[1]);
        if (build) {
          const title = escapeHtml(`${build.title} · moddingcars.com`);
          const desc = escapeHtml(`${build.plan.car.label} — ${build.plan.goal.name} mod plan, staged by budget.`);
          html = html
            .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
            .replace(/(<meta name="description" content=")[^"]*/, `$1${desc}`)
            .replace(/(<meta property="og:title" content=")[^"]*/, `$1${title}`)
            .replace(/(<meta property="og:description" content=")[^"]*/, `$1${desc}`);
        }
      }
      return send(res, 200, html, MIME['.html']);
    }

    return serveStatic(res, publicDir, p);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof PlanInputError || err instanceof BadRequest) return json(res, 400, { error: err.message });
      console.error(err);
      json(res, 500, { error: 'Something went wrong. Please try again.' });
    });
  });
}

class BadRequest extends Error {}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new BadRequest('Request is too large.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new BadRequest('Invalid JSON.');
  }
}

async function serveStatic(res, publicDir, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return json(res, 400, { error: 'Bad path.' });
  }
  const file = path.join(publicDir, path.normalize(rel));
  if (!file.startsWith(publicDir + path.sep)) return json(res, 404, { error: 'Not found.' });
  try {
    const data = await fs.readFile(file);
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    return send(res, 200, data, type, 'public, max-age=300');
  } catch {
    return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

function json(res, status, body) {
  send(res, status, JSON.stringify(body), MIME['.json'], 'no-store');
}

function send(res, status, body, type, cache = 'no-cache') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(body);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
