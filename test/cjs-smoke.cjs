/**
 * CJS smoke test: prove that the package can be `require()`d from a
 * CommonJS codebase, and that the resulting plugin object has the shape
 * CASA expects.
 *
 * This intentionally lives outside `node --test` because it must be loaded
 * as CJS, not ESM.
 */
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

// Load via the local dist/ build (mimics what a real consumer would do
// after `require("casa-dev-overlay")`).
const distEntry = path.resolve(__dirname, "..", "dist", "index.cjs");
const mod = require(distEntry);

// The CJS entry MUST be the function itself, not a namespace object.
// (Older esbuild output was `{ default: fn, __esModule: true }` which made
// `require("casa-dev-overlay")(opts)` throw "is not a function".)
assert.equal(
  typeof mod,
  "function",
  "require() must return the plugin function directly, got " + typeof mod,
);
// `.default` should still resolve to the same function for ESM/TS interop.
assert.equal(mod.default, mod, "mod.default should equal mod for interop");

const casaDevtools = mod;

const prev = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
try {
  const plugin = casaDevtools({ enabled: true });
  assert.equal(typeof plugin.configure, "function", "plugin.configure missing");
  assert.equal(typeof plugin.bootstrap, "function", "plugin.bootstrap missing");

  // configure() should register hooks on the supplied config
  const cfg = { pages: [], plan: null };
  plugin.configure(cfg);
  assert.ok(Array.isArray(cfg.hooks) && cfg.hooks.length > 0, "no hooks registered");
  assert.equal(typeof cfg.helmetConfigurator, "function", "helmetConfigurator not wrapped");
} finally {
  process.env.NODE_ENV = prev;
}

// Production no-op
process.env.NODE_ENV = "production";
try {
  const noop = casaDevtools();
  const cfg = { hooks: [] };
  noop.configure(cfg);
  assert.deepEqual(cfg.hooks, [], "expected production no-op to leave config untouched");
} finally {
  process.env.NODE_ENV = prev;
}

console.log("\u2713 CJS require() entry works");
