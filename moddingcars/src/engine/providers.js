// Plan providers. v1 ships the curated catalog provider for the supported cars.
// "AI-generated plans for any car" plugs in here later: register a provider
// whose supports() accepts free-form cars and whose generate() returns the
// same plan shape (stages -> items with cost, difficulty, requires, links).

import { generatePlan, normalizeInput, PlanInputError } from './planner.js';

const catalogProvider = {
  id: 'catalog',
  supports: (input) => {
    try {
      normalizeInput(input);
      return true;
    } catch {
      return false;
    }
  },
  generate: async (input) => generatePlan(input),
};

const providers = [catalogProvider];

export function registerProvider(provider) {
  providers.push(provider);
}

export async function createPlan(input, { user = null } = {}) {
  const provider = providers.find((p) => p.supports(input, { user }));
  if (!provider) {
    // Re-run validation to surface a helpful message.
    normalizeInput(input);
    throw new PlanInputError('That car is not supported yet.');
  }
  return provider.generate(input, { user });
}
