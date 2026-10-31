// The public catalog the front end needs: cars, generations, build
// directions and the form options. Shared by the server and static builds.

import { CARS } from '../data/cars.js';
import { GOALS, EXPERIENCE, LABOR, DEFAULT_LABOR_RATE } from '../data/goals.js';

export function buildCatalog() {
  return {
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
}

export function defaultBuildTitle(plan) {
  return `${plan.car.make} ${plan.car.model} ${plan.goal.name} build`;
}
