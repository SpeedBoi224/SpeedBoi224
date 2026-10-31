// moddingcars.com front end. No framework: state + render functions +
// delegated events. Text inputs update state without re-rendering so typing
// never loses focus; choices re-render the planner.

const app = document.getElementById('app');
const DRAFT_KEY = 'mc:draft:v1';
const BUDGET_PRESETS = [1000, 2500, 5000, 10000];

const state = {
  catalog: null,
  make: null,
  modelId: null,
  genId: null,
  transmission: null,
  budget: '',
  goal: null,
  labor: 'diy',
  laborRate: 130,
  experience: null,
  existingMods: [{ name: '', link: '' }],
  notes: '',
  plan: null,
  error: '',
  loading: false,
  share: null, // { url, saving, error, title }
};

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const range = ([lo, hi]) => (lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`);
const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? esc(u) : null);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function storage(fn) {
  try { return fn(window.localStorage); } catch { return null; }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

const currentModel = () => state.catalog?.cars.find((c) => c.id === state.modelId) || null;
const currentGen = () => currentModel()?.generations.find((g) => g.id === state.genId) || null;

function buildInput() {
  return {
    car: { modelId: state.modelId, genId: state.genId, transmission: state.transmission },
    budget: Number(String(state.budget).replace(/[^0-9.]/g, '')),
    goal: state.goal,
    labor: state.labor,
    laborRate: Number(state.laborRate),
    experience: state.experience || 'new',
    existingMods: state.existingMods.filter((m) => m.name.trim()),
    notes: state.notes,
  };
}

function saveDraft() {
  const { make, modelId, genId, transmission, budget, goal, labor, laborRate, experience, existingMods, notes } = state;
  storage((s) => s.setItem(DRAFT_KEY, JSON.stringify({ make, modelId, genId, transmission, budget, goal, labor, laborRate, experience, existingMods, notes })));
}

function loadInputIntoState(input) {
  const model = state.catalog.cars.find((c) => c.id === input.car?.modelId);
  if (!model) return;
  Object.assign(state, {
    make: model.make,
    modelId: model.id,
    genId: input.car.genId,
    transmission: input.car.transmission,
    budget: String(input.budget ?? ''),
    goal: input.goal ?? null,
    labor: input.labor || 'diy',
    laborRate: input.laborRate || state.catalog.defaultLaborRate,
    experience: input.experience ?? null,
    existingMods: input.existingMods?.length ? input.existingMods.map((m) => ({ name: m.name || '', link: m.link || '' })) : [{ name: '', link: '' }],
    notes: input.notes || '',
  });
}

// ---------- planner view ----------
function renderPlanner() {
  const c = state.catalog;
  const makes = [...new Set(c.cars.map((x) => x.make))];
  const models = c.cars.filter((x) => x.make === state.make);
  const model = currentModel();
  const gen = currentGen();
  const canPlan = !!(gen && state.goal && Number(String(state.budget).replace(/[^0-9.]/g, '')) >= 100);

  app.innerHTML = `
    <section class="hero">
      <h1>Plan your car build, stage by stage.</h1>
      <p>Pick your car, set a budget and choose a style. You’ll get a clear Stage 1–3 mod plan with costs, difficulty, what each mod does — and where your budget runs out.</p>
      <ol class="steps"><li><b>1</b>Pick your car</li><li><b>2</b>Set budget &amp; goal</li><li><b>3</b>Get your plan</li></ol>
    </section>

    <section class="card" aria-labelledby="car-h">
      <div class="step-num">Step 1</div>
      <h2 id="car-h">Your car</h2>
      <div class="field">
        <span class="label" id="make-l">Make</span>
        <div class="chips" role="group" aria-labelledby="make-l">
          ${makes.map((m) => `<button type="button" class="chip" data-action="make" data-value="${esc(m)}" aria-pressed="${state.make === m}">${esc(m)}</button>`).join('')}
        </div>
      </div>
      ${state.make ? `
      <div class="field">
        <span class="label" id="model-l">Model</span>
        <div class="chips" role="group" aria-labelledby="model-l">
          ${models.map((m) => `<button type="button" class="chip" data-action="model" data-value="${esc(m.id)}" aria-pressed="${state.modelId === m.id}">${esc(m.model)}</button>`).join('')}
        </div>
      </div>` : ''}
      ${model ? `
      <div class="field">
        <span class="label" id="gen-l">Generation / years</span>
        <p class="hint">Not sure? Check the model year on your registration or the sticker inside the driver’s door.</p>
        <div class="options" role="group" aria-labelledby="gen-l">
          ${model.generations.map((g) => `
            <button type="button" class="option" data-action="gen" data-value="${esc(g.id)}" aria-pressed="${state.genId === g.id}">
              <strong>${esc(g.name)} · ${esc(g.years)}</strong>
              <span>${esc(g.engine)}</span>
              <span>${esc(g.drivetrain)}${g.aspiration === 'turbo' ? ' · Turbo' : ''}</span>
            </button>`).join('')}
        </div>
      </div>` : ''}
      ${gen && gen.transmissions.length > 1 ? `
      <div class="field">
        <span class="label" id="trans-l">Transmission</span>
        <div class="chips" role="group" aria-labelledby="trans-l">
          ${gen.transmissions.map((t) => `<button type="button" class="chip" data-action="trans" data-value="${t}" aria-pressed="${state.transmission === t}">${t === 'manual' ? 'Manual' : 'Automatic'}</button>`).join('')}
        </div>
      </div>` : ''}
    </section>

    ${model ? renderDirections(model) : ''}

    <section class="card" aria-labelledby="build-h">
      <div class="step-num">Step 2</div>
      <h2 id="build-h">Your build</h2>

      <div class="field">
        <label for="budget">Total budget</label>
        <p class="hint">Everything you’re willing to spend across all stages. You can change it anytime.</p>
        <div class="money"><input id="budget" class="input" inputmode="numeric" autocomplete="off" placeholder="5,000" data-input="budget" value="${esc(state.budget)}"></div>
        <div class="chips" style="margin-top:10px">
          ${BUDGET_PRESETS.map((b) => `<button type="button" class="chip" data-action="budget" data-value="${b}" aria-pressed="${Number(state.budget) === b}">${money(b)}</button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="label" id="goal-l">Build goal</span>
        <div class="options" role="group" aria-labelledby="goal-l">
          ${c.goals.map((g) => `<button type="button" class="option" data-action="goal" data-value="${g.id}" aria-pressed="${state.goal === g.id}"><strong>${esc(g.name)}</strong><span>${esc(g.short)}</span></button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="label" id="labor-l">Who’s doing the work?</span>
        <div class="options" role="group" aria-labelledby="labor-l">
          ${c.labor.map((l) => `<button type="button" class="option" data-action="labor" data-value="${l.id}" aria-pressed="${state.labor === l.id}"><strong>${esc(l.name)}</strong><span>${esc(l.short)}</span></button>`).join('')}
        </div>
        ${state.labor === 'shop' ? `
          <div class="field">
            <label for="rate">Shop labor rate (per hour)</label>
            <div class="money"><input id="rate" class="input" inputmode="numeric" data-input="laborRate" value="${esc(state.laborRate)}"></div>
            <p class="hint" style="margin-top:6px">Most independent shops charge $100–$180/hr. Leave it at ${money(c.defaultLaborRate)} if you’re not sure.</p>
          </div>` : ''}
      </div>

      <div class="field">
        <span class="label" id="exp-l">Your modding experience</span>
        <div class="options" role="group" aria-labelledby="exp-l">
          ${c.experience.map((e) => `<button type="button" class="option" data-action="experience" data-value="${e.id}" aria-pressed="${state.experience === e.id}"><strong>${esc(e.name)}</strong><span>${esc(e.short)}</span></button>`).join('')}
        </div>
      </div>

      <div class="field">
        <span class="label">Mods you’ve already done <span class="muted small">(optional)</span></span>
        <p class="hint">List what’s already on the car — e.g. “Cobb Accessport Stage 1” or “BC Racing coilovers”. We’ll mark matching mods as done and skip their cost. Add a link to the part if you have one.</p>
        <div class="mod-rows">
          ${state.existingMods.map((m, i) => `
            <div class="mod-row">
              <input class="input" aria-label="Mod ${i + 1} name" placeholder="Mod / part name" data-input="mod" data-index="${i}" data-field="name" value="${esc(m.name)}" maxlength="120">
              <input class="input" aria-label="Mod ${i + 1} link" placeholder="https://link-to-part (optional)" inputmode="url" data-input="mod" data-index="${i}" data-field="link" value="${esc(m.link)}" maxlength="500">
              <button type="button" class="icon-btn" data-action="remove-mod" data-index="${i}" aria-label="Remove mod ${i + 1}">×</button>
            </div>`).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" data-action="add-mod">+ Add another mod</button>
      </div>

      <div class="field">
        <label for="notes">Anything else? <span class="muted small">(optional)</span></label>
        <textarea id="notes" class="textarea" data-input="notes" maxlength="1000" placeholder="e.g. I drive 40 miles a day, I want to keep it quiet, I live in California…">${esc(state.notes)}</textarea>
      </div>

      <div class="field">
        <button type="button" class="btn btn-primary btn-lg" data-action="plan" ${canPlan && !state.loading ? '' : 'disabled'}>
          ${state.loading ? 'Building your plan…' : state.plan ? 'Update my plan' : 'Build my plan'}
        </button>
        ${!canPlan ? `<p class="hint" style="margin-top:8px">${!gen ? 'Pick your car' : !state.budget ? 'Enter a budget' : !state.goal ? 'Choose a build goal' : 'Enter a budget of at least $100'} to continue.</p>` : ''}
        ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}
      </div>
    </section>

    <div id="plan">${state.plan ? renderPlan(state.plan, { editable: true }) : ''}</div>
  `;
}

function renderDirections(model) {
  return `
    <section class="card" aria-labelledby="dir-h">
      <h2 id="dir-h">How people build the ${esc(model.model)}</h2>
      <p class="muted">The most common directions owners take. Tap one to use its goal and a typical budget.</p>
      <div class="directions">
        ${model.directions.map((d, i) => {
          const goal = state.catalog.goals.find((g) => g.id === d.goal);
          return `
          <article class="direction">
            <div class="tags"><span class="tag tag-accent">${esc(goal?.name)}</span><span class="tag">${range(d.budget)}</span></div>
            <h3>${esc(d.name)}</h3>
            <p>${esc(d.description)}</p>
            <div class="row"><button type="button" class="btn btn-ghost btn-sm" data-action="direction" data-index="${i}">Use this direction</button></div>
          </article>`;
        }).join('')}
      </div>
    </section>`;
}

// ---------- plan rendering (shared by planner + saved build) ----------
function statusText(summary) {
  const over = summary.total[0] - summary.budget;
  if (summary.budgetStatus === 'within') return 'The full plan fits your budget.';
  if (summary.budgetStatus === 'maybe') return 'The full plan may go over budget, depending on the brands you choose.';
  return `The full plan is over budget by at least ${money(over)}.`;
}

function coverText(summary) {
  if (summary.budgetStatus === 'within') return 'Your budget covers every stage.';
  if (!summary.coversThrough) return 'Your budget doesn’t fully cover Stage 1 yet — start at the top and work down.';
  if (summary.coversThrough === 1) return 'Your budget fully covers Stage 1. Save up for Stage 2 or pick the items that matter most.';
  return `Your budget fully covers Stages 1–${summary.coversThrough}.`;
}

function renderPlan(plan, { editable }) {
  const s = plan.summary;
  const max = Math.max(s.total[1], s.budget) * 1.08 || 1;
  const pct = (v) => Math.min(100, (v / max) * 100).toFixed(2);
  let n = 0;
  let budgetLineShown = false;

  const stages = plan.stages.map((stage) => `
    <section class="stage" aria-labelledby="stage-${stage.stage}">
      <div class="stage-head">
        <h2 id="stage-${stage.stage}">${esc(stage.title)}</h2>
        <span class="stage-total">${range(stage.total)}</span>
        <p>${esc(stage.blurb)}</p>
      </div>
      ${stage.items.map((it) => {
        n++;
        let line = '';
        if (!budgetLineShown && it.budgetStatus !== 'within') {
          budgetLineShown = true;
          line = `<div class="budget-line" role="note">Budget line · ${money(s.budget)}</div>`;
        }
        return line + renderMod(it, n, plan);
      }).join('')}
    </section>`).join('');

  const unmatched = s.unmatchedExisting || [];
  return `
    <section class="card summary" aria-labelledby="plan-h" id="plan-top">
      <div class="step-num">Your plan</div>
      <h2 id="plan-h">${esc(plan.car.label)}</h2>
      <div class="tags"><span class="tag tag-accent">${esc(plan.goal.name)}</span><span class="tag">${esc(cap(plan.car.transmission))}</span><span class="tag">${esc(plan.car.drivetrain)}</span><span class="tag">${plan.input.labor === 'shop' ? `Shop labor @ ${money(plan.input.laborRate)}/hr` : 'DIY'}</span></div>
      <p class="muted small" style="margin-top:12px;margin-bottom:0">Estimated total</p>
      <div class="big">${range(s.total)}</div>
      <div class="status status-${s.budgetStatus}" role="status">${esc(statusText(s))}</div>
      <p>${esc(coverText(s))}</p>
      <div class="meter" aria-hidden="true">
        <div class="range" style="left:${pct(s.total[0])}%;width:${(pct(s.total[1]) - pct(s.total[0])).toFixed(2)}%;min-width:4px"></div>
        <div class="budget" style="left:${pct(s.budget)}%"><span>Budget ${money(s.budget)}</span></div>
      </div>
      <div class="stats">
        <div class="stat"><b>${money(s.budget)}</b><span>Your budget</span></div>
        <div class="stat"><b>${s.modCount}</b><span>Mods in plan</span></div>
        <div class="stat"><b>${s.doneCount}</b><span>Already done</span></div>
        <div class="stat"><b>${plan.stages.length}</b><span>Stages</span></div>
      </div>
      ${plan.car.maintenanceNote ? `<div class="callout"><b>Before you start:</b> ${esc(plan.car.maintenanceNote)}</div>` : ''}
      ${plan.notes.length ? `<div class="callout"><b>Good to know</b><ul>${plan.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <details class="no-print" style="margin-top:12px">
        <summary>How to read this plan</summary>
        <ul>
          <li>Work top to bottom. Each stage builds on the one before it.</li>
          <li><b>Cost</b> is a range — the low end is budget-friendly brands, the high end is premium parts${plan.input.labor === 'shop' ? ' plus shop labor' : ''}.</li>
          <li><b>Running total</b> shows what you’ll have spent after each mod. The dashed red line is where the plan may pass your budget.</li>
          <li><b>Difficulty</b>: Easy = basic hand tools, an afternoon. Medium = jack stands and some experience. Hard = special tools or a lift; consider a shop.</li>
        </ul>
      </details>
    </section>

    ${stages}

    ${unmatched.length ? `
      <section class="card">
        <h3>Your other mods</h3>
        <p class="muted small">These are on your car but aren’t part of this plan’s checklist. They’re kept with your build.</p>
        <ul>${unmatched.map((m) => `<li>${esc(m.name)}${safeHref(m.link) ? ` — <a href="${safeHref(m.link)}" target="_blank" rel="noopener nofollow ugc">link</a>` : ''}</li>`).join('')}</ul>
      </section>` : ''}

    ${editable ? renderShare() : ''}

    <div class="budgetbar no-print" aria-live="polite">
      <div>
        <div class="label">Plan total · budget ${money(s.budget)}</div>
        <b><span class="dot dot-${s.budgetStatus}"></span>${range(s.total)}</b>
      </div>
      ${editable
        ? `<button type="button" class="btn btn-primary btn-sm" data-action="goto-share">Save &amp; share</button>`
        : `<button type="button" class="btn btn-primary btn-sm" data-action="copy-link">Copy link</button>`}
    </div>`;
}

function renderMod(it, n, plan) {
  const isDone = it.status === 'done';
  const tags = [
    isDone ? `<span class="tag tag-easy">✓ Already done</span>` : '',
    `<span class="tag tag-${it.difficulty}">${it.service ? 'Shop service' : `DIY: ${cap(it.difficulty)}`}</span>`,
    `<span class="tag">${esc(it.category)}</span>`,
    it.shopRecommended && !isDone ? `<span class="tag tag-hard">Shop recommended</span>` : '',
    it.emissions ? `<span class="tag tag-info">Emissions</span>` : '',
  ].join('');

  const costDetail = isDone
    ? `<span>Matched “${esc(it.matchedFrom)}”</span>`
    : it.cost.labor[1] > 0
      ? `<span>Parts ${range(it.cost.parts)} · ${it.shopRecommended ? 'Shop install up to' : 'Labor'} ${it.shopRecommended ? money(it.cost.labor[1]) : range(it.cost.labor)}</span>`
      : `<span>${it.service ? 'Includes shop labor' : 'Parts only'}</span>`;

  const needs = it.requires.length ? `<p class="small"><b>Requires:</b> ${it.requires.map((r) => esc(r.name)).join(', ')}</p>` : '';
  const pairs = it.pairs.length ? `<p class="small"><b>Pairs well with:</b> ${it.pairs.map((r) => esc(r.name)).join(', ')}</p>` : '';

  return `
    <article class="card mod${isDone ? ' done' : ''}">
      <div class="mod-top">
        <div class="mod-title">
          <span class="mod-num">${n}</span>
          <div>
            <h3>${esc(it.name)}</h3>
            <div class="tags">${tags}</div>
          </div>
        </div>
        <div class="mod-cost"><b>${isDone ? '$0' : range(it.cost.total)}</b>${costDetail}</div>
      </div>

      <div class="output"><b>What it does to your car</b>${esc(it.output)}</div>
      <div class="why"><b>Why it’s in Stage ${it.stage}</b>${it.stageWhy ? `<strong>${esc(it.stageWhy)}</strong> ` : ''}${esc(it.why)}</div>
      ${it.note ? `<div class="callout small">${esc(it.note)}</div>` : ''}
      ${it.shopRecommended && !isDone ? `<div class="callout small">This is a hard job for someone new to modding. We’ve included shop installation (about ${range(it.cost.shopLaborEstimate)}) in the high end of the estimate.</div>` : ''}
      ${needs}${pairs}

      <details>
        <summary>How it works &amp; tips</summary>
        <p>${esc(it.how)}</p>
        ${it.tips.length ? `<ul>${it.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      </details>

      <div class="links">
        ${it.links.map((l) => safeHref(l.url) ? `<a href="${safeHref(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>` : '').join('')}
      </div>

      <div class="running">
        <span><span class="dot dot-${it.budgetStatus}"></span>Running total</span>
        <b>${range(it.running)}</b>
      </div>
    </article>`;
}

function renderShare() {
  const sh = state.share || {};
  return `
    <section class="card no-print" id="share" aria-labelledby="share-h">
      <h2 id="share-h">Save &amp; share this build</h2>
      <p class="muted">Get a link you can send to friends, post in a forum or open later on any device.</p>
      ${sh.url ? `
        <div class="share-box">
          <input class="input" readonly value="${esc(location.origin + sh.url)}" aria-label="Share link" id="share-url">
          <button type="button" class="btn btn-primary" data-action="copy-share">Copy link</button>
          ${navigator.share ? `<button type="button" class="btn btn-ghost" data-action="native-share">Share…</button>` : ''}
          <a class="btn btn-ghost" href="${esc(sh.url)}">Open</a>
        </div>
        ${sh.copied ? `<p class="small" role="status" style="color:var(--ok);margin-top:8px">Link copied!</p>` : ''}
      ` : `
        <div class="share-box">
          <input class="input" placeholder="Name your build (optional) — e.g. Daily WRX Stage 2" maxlength="80" data-input="shareTitle" value="${esc(sh.title || '')}" aria-label="Build name">
          <button type="button" class="btn btn-primary" data-action="save" ${sh.saving ? 'disabled' : ''}>${sh.saving ? 'Saving…' : 'Save & get link'}</button>
        </div>
        ${sh.error ? `<p class="error" role="alert">${esc(sh.error)}</p>` : ''}
      `}
    </section>`;
}

// ---------- saved build view ----------
function renderSaved(build) {
  const p = build.plan;
  const exp = state.catalog.experience.find((e) => e.id === p.input.experience);
  const mods = p.input.existingMods || [];
  app.innerHTML = `
    <section class="hero">
      <div class="step-num">Shared build</div>
      <h1>${esc(build.title)}</h1>
      <p>Saved ${esc(new Date(build.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))} · ${esc(p.car.label)}</p>
      <div class="row no-print">
        <button type="button" class="btn btn-primary" data-action="copy-link">Copy link</button>
        ${navigator.share ? `<button type="button" class="btn btn-ghost" data-action="native-share">Share…</button>` : ''}
        <button type="button" class="btn btn-ghost" data-action="edit-copy">Edit a copy</button>
        <button type="button" class="btn btn-ghost" data-action="print">Print</button>
      </div>
      <p class="small" id="copy-status" role="status" style="color:var(--ok);min-height:1.4em;margin-top:8px"></p>
    </section>
    <section class="card">
      <h3>Build details</h3>
      <div class="stats">
        <div class="stat"><b>${esc(p.goal.name)}</b><span>Goal</span></div>
        <div class="stat"><b>${money(p.input.budget)}</b><span>Budget</span></div>
        <div class="stat"><b>${p.input.labor === 'shop' ? 'Shop' : 'DIY'}</b><span>Who does the work</span></div>
        <div class="stat"><b>${esc(exp?.name || '—')}</b><span>Experience</span></div>
      </div>
      ${mods.length ? `<h3 style="margin-top:16px">Mods already on the car</h3><ul>${mods.map((m) => `<li>${esc(m.name)}${safeHref(m.link) ? ` — <a href="${safeHref(m.link)}" target="_blank" rel="noopener nofollow ugc">part link</a>` : ''}</li>`).join('')}</ul>` : ''}
      ${p.input.notes ? `<h3 style="margin-top:16px">Owner notes</h3><p>${esc(p.input.notes)}</p>` : ''}
    </section>
    ${renderPlan(p, { editable: false })}
  `;
}

// ---------- actions ----------
async function makePlan() {
  state.loading = true;
  state.error = '';
  renderPlanner();
  try {
    state.plan = await api('/api/plan', { method: 'POST', body: JSON.stringify(buildInput()) });
    state.share = null;
  } catch (err) {
    state.error = err.message;
  }
  state.loading = false;
  renderPlanner();
  if (state.plan && !state.error) document.getElementById('plan-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function saveBuild() {
  state.share = { ...(state.share || {}), saving: true, error: '' };
  rerenderShare();
  try {
    const res = await api('/api/builds', { method: 'POST', body: JSON.stringify({ title: state.share.title || '', input: state.plan.input }) });
    state.share = { url: res.url };
  } catch (err) {
    state.share = { ...state.share, saving: false, error: err.message };
  }
  rerenderShare();
}

function rerenderShare() {
  const el = document.getElementById('share');
  if (el) el.outerHTML = renderShare();
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function resetCarBelow(level) {
  if (level <= 0) state.modelId = null;
  if (level <= 1) state.genId = null;
  state.transmission = null;
  state.plan = null;
}

app.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, value, index } = btn.dataset;
  const rerender = () => { saveDraft(); renderPlanner(); };

  switch (action) {
    case 'make':
      state.make = value;
      resetCarBelow(0);
      { const models = state.catalog.cars.filter((c) => c.make === value); if (models.length === 1) state.modelId = models[0].id; }
      return rerender();
    case 'model':
      state.modelId = value;
      resetCarBelow(1);
      return rerender();
    case 'gen': {
      state.genId = value;
      const gen = currentGen();
      state.transmission = gen.transmissions[0];
      state.plan = null;
      return rerender();
    }
    case 'trans': state.transmission = value; state.plan = null; return rerender();
    case 'budget': state.budget = value; return rerender();
    case 'goal': state.goal = value; return rerender();
    case 'labor': state.labor = value; return rerender();
    case 'experience': state.experience = value; return rerender();
    case 'add-mod': state.existingMods.push({ name: '', link: '' }); rerender();
      document.querySelector(`[data-input="mod"][data-index="${state.existingMods.length - 1}"]`)?.focus();
      return;
    case 'remove-mod':
      state.existingMods.splice(Number(index), 1);
      if (!state.existingMods.length) state.existingMods.push({ name: '', link: '' });
      return rerender();
    case 'direction': {
      const d = currentModel().directions[Number(index)];
      state.goal = d.goal;
      state.budget = String(Math.round((d.budget[0] + d.budget[1]) / 2 / 500) * 500);
      rerender();
      document.getElementById('build-h')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    case 'plan': return makePlan();
    case 'goto-share': document.getElementById('share')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return;
    case 'save': return saveBuild();
    case 'copy-share':
      if (await copy(location.origin + state.share.url)) { state.share.copied = true; rerenderShare(); }
      return;
    case 'native-share': {
      const url = state.share?.url ? location.origin + state.share.url : location.href;
      navigator.share?.({ title: document.title, url }).catch(() => {});
      return;
    }
    case 'copy-link': {
      const ok = await copy(location.href);
      const s = document.getElementById('copy-status');
      if (s) s.textContent = ok ? 'Link copied!' : 'Copy failed — copy the address bar instead.';
      else if (ok) btn.textContent = 'Copied!';
      return;
    }
    case 'edit-copy':
      loadInputIntoState(window.__build.plan.input);
      state.plan = window.__build.plan;
      saveDraft();
      history.pushState({}, '', '/');
      renderPlanner();
      window.scrollTo(0, 0);
      return;
    case 'print': window.print(); return;
  }
});

app.addEventListener('input', (e) => {
  const el = e.target;
  const key = el.dataset.input;
  if (!key) return;
  if (key === 'mod') state.existingMods[Number(el.dataset.index)][el.dataset.field] = el.value;
  else if (key === 'shareTitle') state.share = { ...(state.share || {}), title: el.value };
  else state[key] = el.value;
  saveDraft();
  // Budget affects whether the plan button is enabled; refresh just that control.
  if (key === 'budget') {
    const btn = app.querySelector('[data-action="plan"]');
    const ok = currentGen() && state.goal && Number(String(state.budget).replace(/[^0-9.]/g, '')) >= 100;
    if (btn) btn.disabled = !ok;
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset?.input === 'shareTitle') saveBuild();
});

// ---------- boot ----------
async function route() {
  const m = location.pathname.match(/^\/b\/([A-Za-z0-9]+)$/);
  if (m) {
    try {
      const build = await api(`/api/builds/${m[1]}`);
      window.__build = build;
      renderSaved(build);
    } catch (err) {
      app.innerHTML = `<section class="hero"><h1>Build not found</h1><p>${esc(err.message)} The link may be wrong or the build was removed.</p><a class="btn btn-primary" href="/">Plan a new build</a></section>`;
    }
    return;
  }
  renderPlanner();
}

async function boot() {
  try {
    state.catalog = await api('/api/catalog');
  } catch (err) {
    app.innerHTML = `<p class="error">Could not load the planner. ${esc(err.message)}</p>`;
    return;
  }
  state.laborRate = state.catalog.defaultLaborRate;
  const draft = storage((s) => JSON.parse(s.getItem(DRAFT_KEY) || 'null'));
  if (draft && state.catalog.cars.some((c) => c.id === draft.modelId)) {
    Object.assign(state, draft);
    if (!Array.isArray(state.existingMods) || !state.existingMods.length) state.existingMods = [{ name: '', link: '' }];
  }
  window.addEventListener('popstate', route);
  route();
}

boot();
