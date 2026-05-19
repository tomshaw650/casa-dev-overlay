# casa-dev-overlay

A local-dev overlay for [GOV.UK CASA](https://github.com/dwp/govuk-casa) apps.

It mounts a small panel into the corner of every page during local development that lets you:

- **Visualise the journey graph** – see every waypoint in your `Plan`, with the current waypoint highlighted and the live traversed path coloured in.
- **Jump to any waypoint** – click a node and go straight there.
- **Inspect (and edit) the JourneyContext** – data, validation errors, identity, ephemeral contexts, and a one-click "destroy session".
- **Apply auto-fill presets** – drop a YAML file into `./.casa-presets/` and apply it with one click. The file format is intentionally compatible with [spiderplan](https://www.npmjs.com/package/@dwp/casa-spiderplan) personas, so you can reuse your existing E2E fixtures.
- **See the field model for the current page** – every `field()` definition, its validators, conditions and processors.
- **See the hook timeline** – every `journey.*` stage that ran for the current request, with timings.
- **Save & restore session snapshots** – capture the JourneyContext to disk, restore it later. Time-travel debugging for free.

The plugin is a strict no-op when `NODE_ENV === "production"`, and refuses to serve any of its routes from a non-loopback host as a belt-and-braces guard.

> Tested against `@dwp/govuk-casa@9.x`. Express 4 only (CASA 9 ships Express 4).

## Install

```bash
npm install -D casa-dev-overlay js-yaml
```

`@dwp/govuk-casa` and `express` are declared as **peer dependencies** – it uses whatever versions your CASA app already has.

## Wire it up

```js
import { configure } from "@dwp/govuk-casa";
import casaDevOverlay from "casa-dev-overlay";

const { mount /* ...rest */ } = configure({
  // ...your normal CASA config
  plugins: [
    casaDevOverlay({
      presetsDir: "./.casa-presets",
      snapshotsDir: "./.casa-dev-overlay/snapshots",
    }),
    // ...your other plugins
  ],
});
```

That's it. Start your app, open it in the browser, and you'll see a blue **CASA** badge in the top-right corner.

## Presets

A preset is a YAML file describing the data to seed into the JourneyContext, plus an optional waypoint to land on after applying.

```yaml
# .casa-presets/partner.yaml
target: check-your-answers
data:
  personal-details:
    title: MR
    firstName: Alice
    lastName: Example
  live-with-partner:
    havePartner: "yes"
  your-partners-name:
    fullName: Bob Example
```

Click **Apply** in the _Presets_ tab and the overlay will:

1. Write each `data.<waypoint>` block into `journeyContext.setDataForPage(waypoint, …)`.
2. Clear any prior validation errors for those waypoints.
3. Persist via `JourneyContext.putContext(req.session, ctx)` so CASA's own change events fire.
4. Redirect you to `target` (or the optional `target` you pass on the click).

This format is **identical** to [spiderplan](https://www.npmjs.com/package/@dwp/casa-spiderplan) personas, so you can point `presetsDir` at your existing `tests/e2e/personas/` directory if you want.

## Snapshots

The _Snapshots_ tab calls `journeyContext.toObject()` and writes the JSON to `snapshotsDir`. Loading a snapshot rehydrates it via `configureFromObject`. Useful for:

- Capturing the exact state of a bug repro and attaching it to an issue.
- Rolling back a session after destructive testing.
- Sharing a starting state across teammates.

## Configuration

```ts
casaDevOverlay({
  enabled?: boolean;          // default: NODE_ENV !== "production"
  presetsDir?: string;        // default: "./.casa-presets"
  snapshotsDir?: string;      // default: "./.casa-dev-overlay/snapshots"
  allowNonLoopback?: boolean; // default: false
});
```

## What it touches in your CASA app

| Surface              | What casa-dev-overlay does                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `staticRouter`       | Adds `GET /__casa/overlay.js` and `GET /__casa/overlay.css`                                                        |
| `ancillaryRouter`    | Adds `/__casa/api/*` JSON endpoints and an HTML response interceptor that injects the overlay tag before `</body>` |
| `journeyRouter`      | Same response interceptor (so the overlay appears on every waypoint page)                                          |
| `hooks`              | Registers a tiny global hook for every `journey.*` stage to capture per-stage timings                              |
| `helmetConfigurator` | Wraps yours (if any) to allow `'self'` in `script-src` and `connect-src` so the overlay can load                   |

It does **not** modify your `pages`, `plan`, `fields`, validators, or templates.

## Safety

Three independent guards keep this out of production:

1. The plugin returns no-op `configure`/`bootstrap` when `NODE_ENV === "production"` (or `enabled: false`).
2. Every API and asset route is wrapped in a loopback-host check; non-loopback requests get `404`.
3. A red **\u26a0 not on localhost** banner appears in the overlay footer if it ever loads against a non-localhost host.

## How it works

```diagram
                  Service developer's CASA app
╭─────────────────────────────────────────────────────────────╮
│  configure({                                                │
│    plugins: [casaDevOverlay({ presetsDir: "./.casa-presets" })│
│  })                                                         │
╰────┬────────────────────────────────────────────────────────╯
     │ plugin.configure() captures pages + plan, registers
     │   per-stage hooks, widens helmet CSP
     ▼
╭──────────────────────────╮       ╭───────────────────────╮
│ ancillaryRouter          │       │ staticRouter          │
│  /__casa/api/state       │◀─────▶│  /__casa/overlay.js   │
│  /__casa/api/jump        │       │  /__casa/overlay.css  │
│  /__casa/api/preset/*    │       ╰───────────────────────╯
│  /__casa/api/snapshot/*  │                  │
│  /__casa/api/context/*   │                  ▼
╰──────────┬───────────────╯       ╭──────────────────────╮
           │ wraps res.send to     │ Shadow-DOM overlay   │
           ▼   inject <script>     │  • Journey graph     │
   responses on ancillary +        │  • Context inspector │
   journey routes                  │  • Field inspector   │
                                   │  • Hook timeline     │
                                   │  • Preset picker     │
                                   │  • Snapshot manager  │
                                   ╰──────────────────────╯
```

## Roadmap

- Per-edge route-condition evaluation (show which condition picked the next waypoint and why).
- Server-Sent Events stream so the overlay updates without a refresh.
- Record-mode: capture a real session as a YAML preset.
- Generate a spiderplan persona from the current JourneyContext.

## Licence

MIT
