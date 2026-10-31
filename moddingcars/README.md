# moddingcars.com — car mod planner (v1)

Pick a car, set a budget and a build style, and get a staged (Stage 1 / 2 / 3) mod plan with
costs, DIY difficulty, what each mod does, what it requires, and a running total against your budget.
Plans can be saved and shared with a link.

## Run it

Requires Node.js 18 or newer. There are no dependencies to install.

```bash
cd moddingcars
npm start          # http://localhost:3000
npm run dev        # same, restarts on file changes
npm test           # engine + API tests
```

Environment variables: `PORT` (default 3000), `DATA_FILE` (default `data/builds.json`).

## How it's organized

```
server.js                 entry point
src/data/cars.js          cars, generations, per-generation gains/prices, "how people build it"
src/data/mods.js          mod library: why / how / output / cost / difficulty / requires / pairs
src/data/goals.js         build goals and the staged recipe for each goal
src/engine/planner.js     pure plan generator (validation, requirements, pricing, budget flags)
src/engine/providers.js   plan provider registry (catalog now; AI provider later)
src/engine/links.js       research links per mod (buy-links provider later)
src/server/app.js         HTTP API + static files
src/server/storage.js     build storage (JSON file now; swap for a database)
src/server/auth.js        current-user + entitlement hooks (accounts/payments later)
public/                   front end (plain HTML/CSS/JS, mobile-first)
```

### API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/catalog` | Cars, generations, build directions, goals |
| POST | `/api/plan` | Generate a plan from inputs |
| POST | `/api/builds` | Save a build (`{ title, input }`), returns `{ id, url }` |
| GET | `/api/builds/:id` | Load a saved build |
| GET | `/b/:id` | Shareable build page |

Saved builds are regenerated from their inputs on the server, so a client can't store a forged plan.

### Adding a car

Add a model (or a generation) to `src/data/cars.js`. Set `aspiration`, `drivetrain`, `transmissions`
and the flags (`hasLsd`, `directInjection`, `chargePipe`, `turboKit`) and the planner picks the right mods.
Use `gains` and `overrides` for car-specific output and prices. `npm test` checks every car × goal combination.

### Built for later

- **User accounts**: implement `currentUser()` in `src/server/auth.js`; builds already store `ownerId`.
- **Subscriptions / payments**: gate actions in `can(user, action)` (e.g. number of saved builds, AI plans).
- **AI plans for any car**: `registerProvider()` in `src/engine/providers.js` with a provider that returns the same plan shape.
- **Links to buy parts**: replace `modLinks()` in `src/engine/links.js` with vendor/affiliate links.
- **Database**: replace `JsonFileStore` with anything that implements `create()` and `get()`.

Prices are estimates in USD and vary by brand, region and condition.
