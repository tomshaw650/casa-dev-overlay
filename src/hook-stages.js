/**
 * The full set of hook stages CASA fires for each journey waypoint, in order.
 * @see https://github.com/dwp/govuk-casa/blob/main/docs/hooks.md
 */
export const HOOK_STAGES = Object.freeze([
  "journey.presteer",
  "journey.poststeer",
  "journey.prerender",
  "journey.presanitise",
  "journey.postsanitise",
  "journey.pregather",
  "journey.postgather",
  "journey.prevalidate",
  "journey.postvalidate",
  "journey.preredirect",
]);

/** Symbol stored on `req` to record per-stage timings for the hook timeline. */
export const DEVTOOLS_REQ = Symbol.for("casa-dev-overlay.req");

/** Mount path for all devtools routes (API + assets). */
export const MOUNT_PATH = "/__casa";
