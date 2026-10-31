// Builds a server-free version of the site into dist/:
//   dist/index.html     full page for any static host (GitHub Pages, Netlify…)
//   dist/artifact.html  same app as page content for a claude.ai artifact
// Each ES module is wrapped in its own function scope and inlined, so the
// output is a single self-contained HTML file with no dependencies.
//
// Usage: node scripts/build-static.js [--share-base=https://public/url]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist');
const shareBase = (process.argv.find((a) => a.startsWith('--share-base=')) || '').split('=').slice(1).join('=');

// Module path overrides: the browser app imports ./api.js, which in the
// static build is static/api.js.
const ALIASES = { [path.join(root, 'public/api.js')]: path.join(root, 'static/api.js') };

const IMPORT = /^import\s+(?:\{([^}]*)\}|\*\s+as\s+(\w+))\s+from\s+'([^']+)';\s*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:const|let|function|class)\s+(\w+)/gm;

async function bundle(entry) {
  const modules = new Map(); // file -> { id, code }
  async function visit(file) {
    file = ALIASES[file] || file;
    if (modules.has(file)) return modules.get(file).id;
    const src = await fs.readFile(file, 'utf8');
    const id = `__m${modules.size}`;
    modules.set(file, { id, code: null });
    const lines = [];
    for (const m of src.matchAll(IMPORT)) {
      const dep = await visit(path.resolve(path.dirname(file), m[3]));
      lines.push(m[2] ? `const ${m[2]} = ${dep};` : `const {${m[1].replace(/\s+as\s+/g, ': ')}} = ${dep};`);
    }
    const exports = [...src.matchAll(EXPORT)].map((m) => m[1]);
    const body = src.replace(IMPORT, '').replace(/^export\s+/gm, '');
    const rel = path.relative(root, file);
    modules.get(file).code = `// ${rel}\nconst ${id} = (() => {\n${lines.join('\n')}\n${body}\nreturn Object.freeze({ ${exports.join(', ')} });\n})();`;
    return id;
  }
  await visit(entry);
  // Dependencies finish visiting (and get their code) before their importers,
  // but ids are assigned on first visit; emit in completion order instead.
  return order(modules).join('\n\n');
}

function order(modules) {
  const done = new Set();
  const list = [...modules.values()];
  const result = [];
  while (result.length < list.length) {
    for (const m of list) {
      if (done.has(m.id)) continue;
      const deps = [...m.code.matchAll(/= (__m\d+);/g)].map((x) => x[1]);
      if (deps.every((d) => done.has(d))) {
        done.add(m.id);
        result.push(m.code);
      }
    }
  }
  return result;
}

const [html, css, favicon, js] = await Promise.all([
  fs.readFile(path.join(root, 'public/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'public/styles.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/favicon.svg'), 'utf8'),
  bundle(path.join(root, 'public/app.js')),
]);
if (/<\/script/i.test(js)) throw new Error('Bundle contains "</script" and cannot be inlined.');

const faviconUri = `data:image/svg+xml,${encodeURIComponent(favicon.trim())}`;
const page = html
  .replace('<link rel="stylesheet" href="/styles.css">', () => `<style>\n${css}</style>`)
  .replace('href="/favicon.svg"', `href="${faviconUri}"`)
  .replaceAll('href="/"', 'href="#"')
  .replace('<script type="module" src="/app.js"></script>', () => `<script type="module">\n${js}\n</script>`);

// Artifact pages are wrapped in their own document skeleton, so keep only
// what belongs inside <body>, with the title and styles first.
const artifact = page
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*/g, '')
  .replace(/<title>[^<]*<\/title>/, '<title>moddingcars.com</title>')
  .replace(/<\/head>\s*<body>/, '')
  .replace(/<\/body>\s*<\/html>\s*$/, '')
  .replace('<script type="module">', () => `<script>window.MC_TARGET = 'artifact'; window.MC_SHARE_BASE = ${JSON.stringify(shareBase)};</script>\n<script type="module">`);

await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'index.html'), page);
await fs.writeFile(path.join(out, 'artifact.html'), artifact);
await fs.writeFile(path.join(out, '.nojekyll'), '');
console.log(`Built ${path.relative(process.cwd(), out)}/index.html (${(page.length / 1024).toFixed(0)} KB) and artifact.html`);
