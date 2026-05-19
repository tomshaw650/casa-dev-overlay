import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import casaDevOverlay from "../src/index.js";
import { listPresets, loadPreset } from "../src/presets.js";
import { applyPresetData } from "../src/seed.js";
import { loopbackGuard } from "../src/loopback-guard.js";
import { HOOK_STAGES } from "../src/hook-stages.js";

test("disabled in production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const p = casaDevOverlay();
    assert.equal(typeof p.configure, "function");
    assert.equal(typeof p.bootstrap, "function");
    // Should be a true no-op
    const cfg = { hooks: [] };
    p.configure(cfg);
    assert.deepEqual(cfg.hooks, []);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("enabled outside production registers a hook for every stage", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const p = casaDevOverlay({ enabled: true });
    const cfg = { pages: [], plan: null };
    p.configure(cfg);
    const stages = (cfg.hooks ?? []).map((h) => h.hook);
    for (const s of HOOK_STAGES) {
      assert.ok(stages.includes(s), `missing hook for ${s}`);
    }
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test("helmetConfigurator wrapper widens script-src to include 'self'", () => {
  const p = casaDevOverlay({ enabled: true });
  const cfg = { pages: [], plan: null };
  p.configure(cfg);
  const out = cfg.helmetConfigurator({
    contentSecurityPolicy: { directives: { "script-src": ["'self'"] } },
  });
  assert.ok(out.contentSecurityPolicy.directives["script-src"].includes("'self'"));
  assert.ok(out.contentSecurityPolicy.directives["connect-src"].includes("'self'"));
});

test("loopbackGuard allows localhost and rejects others", () => {
  let called = 0;
  const next = () => called++;
  const res = { _status: 0, status(c) { this._status = c; return this; }, end() {} };

  loopbackGuard({ hostname: "localhost" }, res, next);
  loopbackGuard({ hostname: "127.0.0.1" }, res, next);
  assert.equal(called, 2);

  loopbackGuard({ hostname: "example.com" }, res, next);
  assert.equal(res._status, 404);
});

test("listPresets + loadPreset round-trip", () => {
  const dir = mkdtempSync(join(tmpdir(), "casa-dt-"));
  writeFileSync(
    join(dir, "alpha.yaml"),
    "target: end\ndata:\n  start:\n    name: Alice\n",
  );
  writeFileSync(
    join(dir, "beta.yml"),
    "data:\n  middle:\n    n: 1\n",
  );
  writeFileSync(join(dir, "ignored.txt"), "nope");

  const names = listPresets(dir);
  assert.deepEqual(names, ["alpha", "beta"]);

  const p = loadPreset(dir, "alpha");
  assert.equal(p.target, "end");
  assert.deepEqual(p.data, { start: { name: "Alice" } });
});

test("loadPreset rejects path-traversal-ish names", () => {
  const dir = mkdtempSync(join(tmpdir(), "casa-dt-"));
  assert.throws(() => loadPreset(dir, "../etc/passwd"), /not found|Invalid/);
});

test("applyPresetData calls setDataForPage and clearValidationErrorsForPage", () => {
  const calls = [];
  const fakeCtx = {
    setDataForPage(w, d) { calls.push(["set", w, d]); },
    clearValidationErrorsForPage(w) { calls.push(["clear", w]); },
  };
  applyPresetData(fakeCtx, { a: { x: 1 }, b: { y: 2 } });
  assert.deepEqual(calls, [
    ["set", "a", { x: 1 }],
    ["clear", "a"],
    ["set", "b", { y: 2 }],
    ["clear", "b"],
  ]);
});
