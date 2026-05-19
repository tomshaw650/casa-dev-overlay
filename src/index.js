/**
 * casa-dev-overlay
 *
 * A CASA plugin that mounts a local-dev overlay UI on your service.
 *
 * Usage:
 *
 * ```js
 * import { configure } from "@dwp/govuk-casa";
 * import casaDevOverlay from "casa-dev-overlay";
 *
 * configure({
 *   plugins: [
 *     casaDevOverlay({
 *       presetsDir: "./.casa-presets",
 *     }),
 *     // ...your other plugins
 *   ],
 *   // ...
 * });
 * ```
 *
 * The plugin is a no-op when `NODE_ENV === "production"` or when `enabled: false`
 * is passed. It additionally refuses to serve API routes from non-loopback hosts
 * as a belt-and-braces guard.
 */

import { HOOK_STAGES, DEVTOOLS_REQ, MOUNT_PATH } from "./hook-stages.js";
import { mountApiRoutes, mountStaticRoutes } from "./api-routes.js";
import { injectOverlay } from "./inject-overlay.js";
import { loopbackGuard } from "./loopback-guard.js";

/**
 * @typedef {object} casaDevOverlayOptions
 * @property {boolean} [enabled] Force-enable or force-disable. Defaults to
 *   `process.env.NODE_ENV !== "production"`.
 * @property {string} [presetsDir] Directory containing preset YAML files.
 *   Defaults to `./.casa-presets`. The format is identical to spiderplan
 *   personas: `{ data: { waypoint: { field: value } }, target?: "waypoint" }`.
 * @property {string} [snapshotsDir] Directory used for save/restore session
 *   snapshots. Defaults to `./.casa-dev-overlay/snapshots`.
 * @property {boolean} [allowNonLoopback] Skip the loopback host guard. Only
 *   set this if you know what you are doing.
 */

/**
 * Create a CASA plugin instance.
 *
 * @param {casaDevOverlayOptions} [opts]
 * @returns {{ configure: Function, bootstrap: Function }}
 */
export default function casaDevOverlay(opts = {}) {
  const enabled = opts.enabled ?? process.env.NODE_ENV !== "production";

  if (!enabled) {
    return { configure() {}, bootstrap() {} };
  }

  const config = {
    presetsDir: opts.presetsDir ?? "./.casa-presets",
    snapshotsDir: opts.snapshotsDir ?? "./.casa-dev-overlay/snapshots",
    allowNonLoopback: opts.allowNonLoopback ?? false,
  };

  // State captured at `configure()` time so we can serve it from API routes
  // mounted at `bootstrap()` time.
  const captured = {
    pages: [],
    plan: null,
  };

  return {
    /**
     * Called by CASA before any other configuration runs. We use this to:
     *  - capture references to `pages` and `plan`
     *  - register a global hook for every stage so we can time the pipeline
     */
    configure(casaConfig) {
      captured.pages = casaConfig.pages ?? [];
      captured.plan = casaConfig.plan ?? null;

      casaConfig.hooks ??= [];
      for (const stage of HOOK_STAGES) {
        casaConfig.hooks.push({
          hook: stage,
          middleware: (req, _res, next) => {
            const log = (req[DEVTOOLS_REQ] ??= { stages: [] });
            log.stages.push({ stage, t: performance.now() });
            next();
          },
        });
      }

      // Loosen Helmet so the overlay's inline-bootstrap snippet can run.
      // We only widen `script-src` to include 'self' (the overlay JS is
      // served from the static router); no inline scripts are added.
      const userHelmet = casaConfig.helmetConfigurator;
      casaConfig.helmetConfigurator = (defaults = {}) => {
        const base =
          typeof userHelmet === "function" ? userHelmet(defaults) : defaults;
        const csp = base.contentSecurityPolicy ?? {};
        const directives = { ...(csp.directives ?? {}) };
        directives["script-src"] = mergeDirective(
          directives["script-src"],
          "'self'",
        );
        directives["connect-src"] = mergeDirective(
          directives["connect-src"],
          "'self'",
        );
        return {
          ...base,
          contentSecurityPolicy: { ...csp, directives },
        };
      };
    },

    /**
     * Called by CASA after all routers are constructed. We mount our routes
     * onto the existing `staticRouter` and `ancillaryRouter` so we share the
     * host app's session, CSRF, body parsing and i18n.
     */
    bootstrap(out) {
      const guard = config.allowNonLoopback ? (_r, _s, n) => n() : loopbackGuard;

      mountStaticRoutes({ staticRouter: out.staticRouter, guard });
      mountApiRoutes({
        ancillaryRouter: out.ancillaryRouter,
        guard,
        config,
        captured,
      });

      // Inject the overlay <script> into HTML responses served from the
      // ancillaryRouter and journeyRouter. Static and API responses are
      // skipped automatically because they don't return HTML.
      //
      // IMPORTANT: CASA's routers are MutableRouters whose stack is replayed
      // onto a real Express Router at seal time. By the time `bootstrap()`
      // runs, CASA has already pushed every per-waypoint `GET /<waypoint>`
      // handler (which calls `res.send` to terminate the response) onto the
      // journeyRouter stack, and the `/session-timeout` handler onto the
      // ancillaryRouter stack. A plain `.use()` would append our `res.send`
      // wrapper *after* those handlers, so it would never run. `prependUse()`
      // inserts at index 0 of the stack, so our wrapper is in place before
      // the page handler calls `res.send`.
      const inject = injectOverlay({ mountPath: MOUNT_PATH });
      if (typeof out.ancillaryRouter.prependUse === "function") {
        out.ancillaryRouter.prependUse(inject);
      } else {
        out.ancillaryRouter.use(inject);
      }
      if (typeof out.journeyRouter.prependUse === "function") {
        out.journeyRouter.prependUse(inject);
      } else {
        out.journeyRouter.use(inject);
      }

      // Friendly start-up banner
      // eslint-disable-next-line no-console
      console.log(
        `\n  \u001b[36m\u25cf casa-dev-overlay enabled\u001b[0m \u2192 overlay at ${MOUNT_PATH}/\n`,
      );
    },
  };
}

function mergeDirective(existing, value) {
  if (!existing) return ["'self'", value].filter(unique());
  if (Array.isArray(existing))
    return [...existing, value].filter(unique());
  return [existing, value].filter(unique());
}

function unique() {
  const seen = new Set();
  return (v) => (seen.has(v) ? false : seen.add(v));
}
