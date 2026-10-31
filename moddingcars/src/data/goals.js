// Build goals and the staged "recipe" for each. Recipes list mod ids in
// priority order; the planner drops anything that does not apply to the
// chosen car and fills in requirements automatically.

export const GOALS = [
  { id: 'daily', name: 'Daily driver', short: 'Comfortable and reliable, with more fun on the way to work.' },
  { id: 'street', name: 'Street performance', short: 'More power and grip for back roads and on-ramps.' },
  { id: 'drift', name: 'Drift', short: 'Angle, control and seat time. Works best on rear-wheel drive.' },
  { id: 'track', name: 'Track / autocross', short: 'Lap times: grip, brakes, cooling and safety first.' },
  { id: 'show', name: 'Show / stance', short: 'Fitment, ride height and looks that turn heads.' },
];

export const EXPERIENCE = [
  { id: 'new', name: 'New to modding', short: 'I have not done much work on cars.' },
  { id: 'some', name: 'Some experience', short: 'I have done basic bolt-ons or maintenance.' },
  { id: 'experienced', name: 'Experienced', short: 'I am comfortable with suspension, exhaust and drivetrain work.' },
];

export const LABOR = [
  { id: 'diy', name: 'I’ll do it myself', short: 'Parts only — we flag jobs that are hard for your experience level.' },
  { id: 'shop', name: 'A shop will do it', short: 'Includes estimated labor at your shop’s hourly rate.' },
];

export const DEFAULT_LABOR_RATE = 130;

export const STAGE_INFO = {
  1: { title: 'Stage 1 · Foundation', blurb: 'Cheap, high-impact and low-risk. Do these first — everything later builds on them.' },
  2: { title: 'Stage 2 · Bolt-ons & chassis', blurb: 'Bigger upgrades that build on Stage 1. This is where the car starts to feel truly different.' },
  3: { title: 'Stage 3 · Serious upgrades', blurb: 'Expensive, more complex work that needs supporting mods. Plan and save for these.' },
};

export const RECIPES = {
  daily: {
    1: ['maintenance', 'tires', 'brake_pads', 'tint', 'intake'],
    2: ['tune', 'springs', 'sway_bars', 'lighting', 'catch_can'],
    3: ['wheels', 'catback', 'bushings', 'interior'],
  },
  street: {
    1: ['maintenance', 'tires', 'tune', 'intake', 'brake_pads'],
    2: ['downpipe', 'header', 'charge_pipe', 'intercooler', 'coilovers', 'sway_bars', 'catback'],
    3: ['clutch', 'lsd', 'fuel', 'turbo_upgrade', 'turbo_kit', 'wheels', 'big_brakes', 'catch_can'],
  },
  drift: {
    1: ['maintenance', 'coilovers', 'lsd', 'tires', 'brake_pads'],
    2: ['bucket_seat', 'hydro_handbrake', 'angle_kit', 'oil_cooler', 'tune', 'charge_pipe'],
    3: ['clutch', 'cooling', 'intercooler', 'downpipe', 'wheels', 'cage'],
  },
  track: {
    1: ['maintenance', 'tires', 'brake_pads', 'alignment'],
    2: ['coilovers', 'sway_bars', 'bucket_seat', 'oil_cooler', 'lsd', 'tune', 'intake'],
    3: ['big_brakes', 'cooling', 'intercooler', 'charge_pipe', 'aero', 'bushings', 'cage'],
  },
  show: {
    1: ['maintenance', 'wheels', 'coilovers', 'tint'],
    2: ['camber_arms', 'aero', 'lighting', 'catback'],
    3: ['wrap', 'interior', 'intake'],
  },
};
