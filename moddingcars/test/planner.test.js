import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, PlanInputError } from '../src/engine/planner.js';
import { CARS } from '../src/data/cars.js';
import { GOALS } from '../src/data/goals.js';

const base = (over = {}) => ({
  car: { modelId: 'subaru-wrx', genId: 'va', transmission: 'manual' },
  budget: 5000,
  goal: 'street',
  labor: 'diy',
  experience: 'some',
  existingMods: [],
  ...over,
});
const allItems = (plan) => plan.stages.flatMap((s) => s.items);
const ids = (plan) => allItems(plan).map((i) => i.id);

test('every car, generation, transmission and goal produces a valid plan', () => {
  for (const car of CARS) {
    for (const gen of car.generations) {
      for (const transmission of gen.transmissions) {
        for (const goal of GOALS) {
          const plan = generatePlan(base({ car: { modelId: car.id, genId: gen.id, transmission }, goal: goal.id }));
          const items = allItems(plan);
          assert.ok(items.length >= 5, `${gen.id}/${goal.id} has too few mods`);
          assert.equal(new Set(items.map((i) => i.id)).size, items.length, `${gen.id}/${goal.id} has duplicates`);
          for (const it of items) {
            assert.ok(it.cost.total[0] <= it.cost.total[1]);
            assert.ok(it.links.length >= 2);
            assert.ok(['easy', 'medium', 'hard'].includes(it.difficulty));
            // Every requirement appears at or before the mod that needs it.
            for (const r of it.requires) {
              const req = items.find((x) => x.id === r.id);
              if (req) assert.ok(req.stage <= it.stage, `${r.id} should not come after ${it.id}`);
            }
          }
          const last = items[items.length - 1];
          assert.deepEqual(plan.summary.total, last.running);
        }
      }
    }
  }
});

test('naturally aspirated cars get no turbo-only mods', () => {
  const plan = generatePlan(base({ car: { modelId: 'honda-civic-si', genId: 'si9' } }));
  for (const id of ['downpipe', 'intercooler', 'turbo_upgrade', 'charge_pipe']) assert.ok(!ids(plan).includes(id));
  assert.ok(ids(plan).includes('header'));
  assert.ok(ids(plan).includes('turbo_kit'));
});

test('coilovers pull in an alignment right after them', () => {
  const plan = generatePlan(base({ goal: 'show' }));
  const list = ids(plan);
  assert.equal(list[list.indexOf('coilovers') + 1], 'alignment');
  const align = allItems(plan).find((i) => i.id === 'alignment');
  assert.equal(align.addedFor, 'coilovers');
});

test('turbo upgrade brings fuel, clutch and a pro tune into the same stage', () => {
  const plan = generatePlan(base());
  const items = allItems(plan);
  const turbo = items.find((i) => i.id === 'turbo_upgrade');
  for (const id of ['fuel', 'pro_tune', 'clutch']) {
    assert.equal(items.find((i) => i.id === id).stage, turbo.stage, id);
  }
});

test('automatic cars skip the clutch', () => {
  const plan = generatePlan(base({ car: { modelId: 'subaru-wrx', genId: 'va', transmission: 'auto' } }));
  assert.ok(!ids(plan).includes('clutch'));
});

test('cars with a factory LSD skip the LSD', () => {
  const plan = generatePlan(base({ car: { modelId: 'honda-civic-si', genId: 'si10' }, goal: 'track' }));
  assert.ok(!ids(plan).includes('lsd'));
});

test('drift on a non-RWD car falls back to a grip plan with a note', () => {
  const plan = generatePlan(base({ goal: 'drift' }));
  assert.match(plan.notes[0], /rear-wheel drive/);
  assert.ok(ids(plan).includes('hydro_handbrake'));
  assert.ok(!ids(plan).includes('angle_kit'));
  const rwd = generatePlan(base({ car: { modelId: 'bmw-335i', genId: 'e9x-n54', transmission: 'manual' }, goal: 'drift' }));
  assert.ok(ids(rwd).includes('angle_kit'));
  assert.ok(ids(rwd).includes('lsd'));
});

test('existing mods are marked done and cost nothing', () => {
  const plan = generatePlan(base({
    existingMods: [
      { name: 'Cobb Accessport stage 1', link: 'https://example.com/ap' },
      { name: 'BC Racing coilovers', link: '' },
      { name: 'Bumper sticker', link: 'javascript:alert(1)' },
    ],
  }));
  const items = allItems(plan);
  const tune = items.find((i) => i.id === 'tune');
  assert.equal(tune.status, 'done');
  assert.deepEqual(tune.cost.total, [0, 0]);
  assert.equal(items.find((i) => i.id === 'coilovers').status, 'done');
  assert.equal(plan.summary.doneCount, 2);
  assert.equal(plan.summary.unmatchedExisting[0].name, 'Bumper sticker');
  assert.equal(plan.input.existingMods[2].link, '', 'non-http links are dropped');
});

test('lowering springs count as done when the user has coilovers', () => {
  const plan = generatePlan(base({ goal: 'daily', existingMods: [{ name: 'KW V1 coilovers' }] }));
  assert.equal(allItems(plan).find((i) => i.id === 'springs').status, 'done');
});

test('shop labor adds cost; DIY does not', () => {
  const diy = generatePlan(base());
  const shop = generatePlan(base({ labor: 'shop', laborRate: 150 }));
  assert.ok(shop.summary.total[0] > diy.summary.total[0]);
  const coil = allItems(shop).find((i) => i.id === 'coilovers');
  assert.deepEqual(coil.cost.labor, [450, 750]);
});

test('beginners doing hard DIY jobs get a shop recommendation in the high estimate', () => {
  const plan = generatePlan(base({ experience: 'new' }));
  const clutch = allItems(plan).find((i) => i.id === 'clutch');
  assert.equal(clutch.shopRecommended, true);
  assert.equal(clutch.cost.total[0], clutch.cost.parts[0]);
  assert.ok(clutch.cost.total[1] > clutch.cost.parts[1]);
});

test('budget flags', () => {
  const small = generatePlan(base({ budget: 500 }));
  assert.equal(small.summary.budgetStatus, 'over');
  assert.equal(small.summary.coversThrough, 0);
  const huge = generatePlan(base({ budget: 100000 }));
  assert.equal(huge.summary.budgetStatus, 'within');
  assert.equal(huge.summary.coversThrough, 3);
  const items = allItems(small);
  assert.equal(items[items.length - 1].budgetStatus, 'over');
});

test('rejects bad input', () => {
  assert.throws(() => generatePlan(base({ car: { modelId: 'nope', genId: 'x' } })), PlanInputError);
  assert.throws(() => generatePlan(base({ budget: 'abc' })), PlanInputError);
  assert.throws(() => generatePlan(base({ goal: 'rocket' })), PlanInputError);
});
