// Catalog-based plan generator. Pure function: inputs in, plan out.
// It runs on the server (and in tests); the browser only renders the result.

import { findCar, carLabel } from '../data/cars.js';
import { MODS } from '../data/mods.js';
import { GOALS, RECIPES, STAGE_INFO, DEFAULT_LABOR_RATE } from '../data/goals.js';
import { modLinks } from './links.js';

export const ENGINE_VERSION = 'catalog-1';

const GOAL_IDS = GOALS.map((g) => g.id);
const LABOR_IDS = ['diy', 'shop'];
const EXPERIENCE_IDS = ['new', 'some', 'experienced'];
const MAX_EXISTING = 30;

export class PlanInputError extends Error {}

// Normalizes and validates raw input (from a form or a saved build).
export function normalizeInput(raw = {}) {
  const car = raw.car || {};
  const found = findCar(String(car.modelId || ''), String(car.genId || ''));
  if (!found) throw new PlanInputError('Pick a make, model and generation.');
  const { gen } = found;

  let transmission = String(car.transmission || gen.transmissions[0]);
  if (!gen.transmissions.includes(transmission)) transmission = gen.transmissions[0];

  const budget = Math.round(Number(raw.budget));
  if (!Number.isFinite(budget) || budget < 100 || budget > 1_000_000) {
    throw new PlanInputError('Enter a budget between $100 and $1,000,000.');
  }
  const goal = String(raw.goal || '');
  if (!GOAL_IDS.includes(goal)) throw new PlanInputError('Choose a build goal.');

  const labor = LABOR_IDS.includes(raw.labor) ? raw.labor : 'diy';
  const experience = EXPERIENCE_IDS.includes(raw.experience) ? raw.experience : 'new';
  let laborRate = Math.round(Number(raw.laborRate) || DEFAULT_LABOR_RATE);
  laborRate = Math.min(Math.max(laborRate, 40), 400);

  const existingMods = (Array.isArray(raw.existingMods) ? raw.existingMods : [])
    .slice(0, MAX_EXISTING)
    .map((m) => ({ name: clip(m && m.name, 120), link: safeUrl(m && m.link) }))
    .filter((m) => m.name);

  return {
    car: { modelId: found.car.id, genId: gen.id, transmission },
    budget,
    goal,
    labor,
    laborRate,
    experience,
    existingMods,
    notes: clip(raw.notes, 1000),
  };
}

export function generatePlan(rawInput) {
  const input = normalizeInput(rawInput);
  const { car, gen } = findCar(input.car.modelId, input.car.genId);
  const ctx = { gen, transmission: input.car.transmission };
  const notes = [];

  let recipeId = input.goal;
  if (input.goal === 'drift' && gen.drivetrain !== 'RWD') {
    recipeId = 'track';
    notes.push(
      `The ${car.model} is ${gen.drivetrain}. True drifting needs rear-wheel drive, so this plan focuses on grip, control and seat time (great for autocross and gymkhana). A hydraulic handbrake is included for rotation.`
    );
  }

  // 1. Pick applicable mods from the recipe, first stage wins.
  const order = [];
  const seen = new Set();
  for (const stage of [1, 2, 3]) {
    const ids = [...RECIPES[recipeId][stage]];
    if (stage === 2 && recipeId !== input.goal) ids.push('hydro_handbrake');
    for (const id of ids) {
      if (seen.has(id) || !applies(MODS[id], ctx)) continue;
      seen.add(id);
      order.push({ id, stage, addedFor: null });
    }
  }

  // 2. Detect mods the user already has.
  const done = detectExisting(input.existingMods);

  // 3. Insert requirements before (or after) the mod that needs them.
  //    Mods the user already has don't pull in their requirements.
  const isDone = (id) => done.has(id) || (MODS[id].satisfiedBy || []).some((s) => done.has(s));
  for (let i = 0; i < order.length; i++) {
    const entry = order[i];
    if (isDone(entry.id)) continue;
    for (const reqId of MODS[entry.id].requires || []) {
      if (!applies(MODS[reqId], ctx)) continue;
      const at = order.findIndex((e) => e.id === reqId);
      if (at !== -1 && (at < i || order[at].stage <= entry.stage)) continue;
      if (at !== -1) order.splice(at, 1); // pull it forward from a later stage
      const req = { id: reqId, stage: entry.stage, addedFor: entry.id };
      if (MODS[reqId].placeAfter) {
        order.splice(i + 1, 0, req);
      } else {
        // Insert before and revisit from the new item so its own requirements resolve too.
        order.splice(i, 0, req);
        i--;
        break;
      }
    }
  }

  // 4. Price everything and keep a running total.
  const running = [0, 0];
  const items = order.map((entry) => {
    const item = buildItem(entry, { car, gen, input, done });
    running[0] += item.cost.total[0];
    running[1] += item.cost.total[1];
    item.running = [running[0], running[1]];
    item.budgetStatus = budgetStatus(item.running, input.budget);
    return item;
  });

  const stages = [1, 2, 3].map((n) => {
    const stageItems = items.filter((it) => it.stage === n);
    const total = sumCosts(stageItems);
    const last = stageItems[stageItems.length - 1];
    return {
      stage: n,
      ...STAGE_INFO[n],
      items: stageItems,
      total,
      runningAtEnd: last ? last.running : null,
      budgetStatus: last ? last.budgetStatus : 'within',
    };
  }).filter((s) => s.items.length);

  if (gen.overrides?.clutch?.note && input.car.transmission === 'auto' && items.some((i) => i.id === 'clutch')) {
    notes.push(gen.overrides.clutch.note);
  }
  if (input.car.transmission === 'auto' && items.some((i) => ['turbo_upgrade', 'turbo_kit'].includes(i.id))) {
    notes.push('Automatic transmissions have torque limits. Ask your tuner about a transmission tune or upgraded internals before going big on power.');
  }
  if (items.some((i) => i.emissions && i.status !== 'done')) {
    notes.push('Mods marked “Emissions” may not be street legal in strict-emissions areas (e.g. California). Look for CARB-approved versions where required.');
  }

  const doneItems = items.filter((i) => i.status === 'done');
  const unmatched = input.existingMods.filter((m) => !doneItems.some((d) => d.matchedFrom === m.name));
  const total = [running[0], running[1]];

  return {
    engine: ENGINE_VERSION,
    createdAt: new Date().toISOString(),
    input,
    car: {
      label: carLabel(car, gen),
      make: car.make,
      model: car.model,
      generation: gen.name,
      years: gen.years,
      engine: gen.engine,
      drivetrain: gen.drivetrain,
      transmission: input.car.transmission,
      maintenanceNote: gen.maintenanceNote,
    },
    goal: GOALS.find((g) => g.id === input.goal),
    stages,
    summary: {
      total,
      budget: input.budget,
      budgetStatus: budgetStatus(total, input.budget),
      coversThrough: coversThrough(stages, input.budget),
      modCount: items.length,
      doneCount: doneItems.length,
      unmatchedExisting: unmatched,
    },
    notes,
  };
}

function buildItem(entry, { car, gen, input, done }) {
  const base = MODS[entry.id];
  const ov = gen.overrides?.[entry.id] || {};
  const mod = { ...base, ...ov };
  const shopRate = input.laborRate;

  const parts = ov.parts ? ov.parts : base.parts.map((v) => v * gen.costFactor);
  const partsRange = parts.map(round10);
  const laborRange = mod.service ? [0, 0] : mod.laborHours.map((h) => round10(h * shopRate));

  const shopRecommended =
    input.labor === 'diy' && !mod.service && mod.difficulty === 'hard' && input.experience === 'new';

  let laborCost = [0, 0];
  if (input.labor === 'shop') laborCost = laborRange;
  else if (shopRecommended) laborCost = [0, laborRange[1]];

  const matchedFrom = done.get(entry.id) || (base.satisfiedBy || []).map((s) => done.get(s)).find(Boolean) || null;
  const status = matchedFrom ? 'done' : 'planned';
  const total = status === 'done' ? [0, 0] : [partsRange[0] + laborCost[0], partsRange[1] + laborCost[1]];

  const stageWhy = entry.addedFor
    ? `Added because ${MODS[entry.addedFor].name.toLowerCase()} needs it.`
    : null;

  return {
    id: entry.id,
    name: mod.name,
    category: base.category,
    stage: entry.stage,
    why: base.why,
    stageWhy,
    how: base.how,
    output: gen.gains?.[entry.id] || base.output,
    tips: base.tips || [],
    note: ov.note || null,
    difficulty: mod.difficulty,
    service: !!base.service,
    shopRecommended,
    emissions: !!base.emissions,
    requires: (base.requires || []).filter((id) => MODS[id]).map((id) => ({ id, name: MODS[id].name })),
    pairs: (base.pairs || []).map((id) => ({ id, name: MODS[id].name })),
    addedFor: entry.addedFor,
    status,
    matchedFrom,
    cost: {
      parts: status === 'done' ? [0, 0] : partsRange,
      labor: status === 'done' ? [0, 0] : laborCost,
      total,
      shopLaborEstimate: laborRange,
    },
    links: modLinks({ car, gen, mod: base }),
  };
}

function applies(mod, { gen, transmission }) {
  const w = mod.when;
  if (!w) return true;
  if (w.aspiration && w.aspiration !== gen.aspiration) return false;
  if (w.drivetrain && !w.drivetrain.includes(gen.drivetrain)) return false;
  if (w.transmission && w.transmission !== transmission) return false;
  if (w.flag && !gen[w.flag]) return false;
  if (w.notFlag && gen[w.notFlag]) return false;
  return true;
}

// Map of modId -> the user's text that matched it.
export function detectExisting(existingMods) {
  const found = new Map();
  for (const entry of existingMods) {
    const text = ` ${entry.name.toLowerCase().replace(/[^a-z0-9&ö+-]+/g, ' ')} `;
    for (const [id, mod] of Object.entries(MODS)) {
      if (found.has(id)) continue;
      if ((mod.aliases || []).some((a) => text.includes(` ${a} `) || text.includes(` ${a}s `))) {
        found.set(id, entry.name);
      }
    }
  }
  return found;
}

function budgetStatus([lo, hi], budget) {
  if (hi <= budget) return 'within';
  if (lo <= budget) return 'maybe';
  return 'over';
}

function coversThrough(stages, budget) {
  let covered = 0;
  for (const s of stages) {
    if (s.runningAtEnd && s.runningAtEnd[1] <= budget) covered = s.stage;
    else break;
  }
  return covered;
}

function sumCosts(items) {
  return items.reduce((acc, it) => [acc[0] + it.cost.total[0], acc[1] + it.cost.total[1]], [0, 0]);
}

function round10(n) {
  return Math.round(n / 10) * 10;
}

function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return '';
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href.slice(0, 500) : '';
  } catch {
    return '';
  }
}
