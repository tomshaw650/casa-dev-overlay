/**
 * Mounts the devtools HTTP surface onto the host CASA app's routers.
 *
 *   GET  /__casa/overlay.js
 *   GET  /__casa/overlay.css
 *   GET  /__casa/api/state           Snapshot of plan + context + page fields
 *   POST /__casa/api/jump            Honest-mode jump-to-waypoint
 *   POST /__casa/api/preset/apply    Apply a preset by name
 *   GET  /__casa/api/presets         List available presets
 *   POST /__casa/api/context/patch   Edit-in-place for the inspector
 *   POST /__casa/api/snapshot/save   Persist the active session to disk
 *   POST /__casa/api/snapshot/load   Restore a snapshot
 *   GET  /__casa/api/snapshots       List snapshots
 */

import express from "express";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MOUNT_PATH, DEVTOOLS_REQ } from "./hook-stages.js";
import { listPresets, loadPreset } from "./presets.js";
import { applyPresetData, traversed } from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const json = express.json({ limit: "256kb" });

export function mountStaticRoutes({ staticRouter, guard }) {
  const overlayJs = readFileSync(
    resolve(__dirname, "overlay/overlay.js"),
    "utf8",
  );
  const overlayCss = readFileSync(
    resolve(__dirname, "overlay/overlay.css"),
    "utf8",
  );

  staticRouter.get(`${MOUNT_PATH}/overlay.js`, guard, (_req, res) => {
    res.type("application/javascript").send(overlayJs);
  });
  staticRouter.get(`${MOUNT_PATH}/overlay.css`, guard, (_req, res) => {
    res.type("text/css").send(overlayCss);
  });
}

export function mountApiRoutes({ ancillaryRouter, guard, config, captured }) {
  const r = ancillaryRouter;

  // ----- state ----------------------------------------------------------
  r.get(`${MOUNT_PATH}/api/state`, guard, (req, res) => {
    const ctx = req.casa?.journeyContext;
    const waypoint = req.casa?.waypoint;
    const page = captured.pages.find((p) => p.waypoint === waypoint);

    res.json({
      mountUrl: req.baseUrl + "/",
      waypoint,
      graph: serialiseGraph(captured.plan),
      traversed: traversed(captured.plan, ctx),
      data: ctx?.getData() ?? {},
      validation: ctx?.validation ?? {},
      identity: ctx?.identity ?? {},
      contexts: listContextsSafe(ctx, req.session),
      fields: page?.fields?.map(serialiseField) ?? [],
      hooks: req[DEVTOOLS_REQ]?.stages ?? [],
      presets: listPresets(config.presetsDir),
      snapshots: listSnapshots(config.snapshotsDir),
    });
  });

  // ----- jump -----------------------------------------------------------
  r.post(`${MOUNT_PATH}/api/jump`, guard, json, (req, res) => {
    const { waypoint } = req.body ?? {};
    if (!waypoint || typeof waypoint !== "string") {
      return res.status(400).json({ error: "waypoint required" });
    }
    res.redirect(`${req.baseUrl}/${waypoint}`);
  });

  // ----- presets --------------------------------------------------------
  r.get(`${MOUNT_PATH}/api/presets`, guard, (_req, res) => {
    res.json({ presets: listPresets(config.presetsDir) });
  });

  r.post(`${MOUNT_PATH}/api/preset/apply`, guard, json, (req, res) => {
    const { name, target } = req.body ?? {};
    let preset;
    try {
      preset = loadPreset(config.presetsDir, name);
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }

    const ctx = req.casa?.journeyContext;
    if (!ctx) {
      return res.status(500).json({ error: "no JourneyContext on request" });
    }

    applyPresetData(ctx, preset.data);
    persist(req, ctx);

    const land = target || preset.target;
    if (land) {
      return res.redirect(`${req.baseUrl}/${land}`);
    }
    res.json({ ok: true });
  });

  // ----- context patch --------------------------------------------------
  r.post(`${MOUNT_PATH}/api/context/patch`, guard, json, (req, res) => {
    const { waypoint, data } = req.body ?? {};
    const ctx = req.casa?.journeyContext;
    if (!ctx) return res.status(500).json({ error: "no JourneyContext" });
    if (typeof waypoint !== "string" || typeof data !== "object") {
      return res.status(400).json({ error: "waypoint + data required" });
    }
    ctx.setDataForPage(waypoint, data);
    persist(req, ctx);
    res.json({ ok: true });
  });

  r.post(`${MOUNT_PATH}/api/context/clear`, guard, (req, res) => {
    if (req.session && typeof req.session.destroy === "function") {
      req.session.destroy(() => res.json({ ok: true }));
    } else {
      res.json({ ok: true });
    }
  });

  // ----- snapshots ------------------------------------------------------
  r.get(`${MOUNT_PATH}/api/snapshots`, guard, (_req, res) => {
    res.json({ snapshots: listSnapshots(config.snapshotsDir) });
  });

  r.post(`${MOUNT_PATH}/api/snapshot/save`, guard, json, (req, res) => {
    const { name } = req.body ?? {};
    const safe = String(name || `snapshot-${Date.now()}`).replace(
      /[^a-z0-9_-]/gi,
      "",
    );
    const ctx = req.casa?.journeyContext;
    if (!ctx) return res.status(500).json({ error: "no JourneyContext" });

    mkdirSync(resolve(config.snapshotsDir), { recursive: true });
    const path = resolve(config.snapshotsDir, `${safe}.json`);
    writeFileSync(path, JSON.stringify(ctx.toObject(), null, 2));
    res.json({ ok: true, name: safe });
  });

  r.post(`${MOUNT_PATH}/api/snapshot/load`, guard, json, (req, res) => {
    const { name } = req.body ?? {};
    const safe = String(name || "").replace(/[^a-z0-9_-]/gi, "");
    if (!safe) return res.status(400).json({ error: "name required" });

    const path = resolve(config.snapshotsDir, `${safe}.json`);
    if (!existsSync(path)) {
      return res.status(404).json({ error: "snapshot not found" });
    }
    const obj = JSON.parse(readFileSync(path, "utf8"));
    const ctx = req.casa?.journeyContext;
    if (!ctx) return res.status(500).json({ error: "no JourneyContext" });

    if (typeof ctx.configureFromObject === "function") {
      ctx.configureFromObject(obj);
    } else {
      ctx.setData(obj.data ?? {});
    }
    persist(req, ctx);
    res.json({ ok: true });
  });
}

// ---------------------------------------------------------------- helpers

function persist(req, ctx) {
  // Use the static putContext so CASA's own change-events fire; we resolve
  // the symbol lazily so we don't need a hard import on @dwp/govuk-casa.
  const PutContext = ctx?.constructor?.putContext;
  if (typeof PutContext === "function" && req.session) {
    PutContext.call(ctx.constructor, req.session, ctx);
  }
}

function listContextsSafe(ctx, session) {
  try {
    const Ctor = ctx?.constructor;
    if (Ctor && typeof Ctor.getContexts === "function") {
      return Ctor.getContexts(session).map((c) => ({
        id: c.identity?.id,
        name: c.identity?.name,
        tags: c.identity?.tags ?? [],
      }));
    }
  } catch {
    /* noop */
  }
  return [];
}

function listSnapshots(dir) {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

function serialiseGraph(plan) {
  if (!plan || typeof plan.getGraphStructure !== "function") {
    return { nodes: [], edges: [] };
  }
  try {
    const g = plan.getGraphStructure();
    const nodes = g.nodes().map((id) => ({ id }));
    const edges = g.edges().map((e) => {
      const label =
        (g.edge(e) && (g.edge(e).name || g.edge(e).label)) ||
        e.name ||
        "";
      return { source: e.v, target: e.w, name: e.name, label };
    });
    return { nodes, edges };
  } catch {
    return { nodes: [], edges: [] };
  }
}

function serialiseField(f) {
  return {
    name: f.name,
    meta: f.meta,
    validators: (f.getValidators?.() ?? []).map((v) => ({
      name: v.name,
      config: safeJson(v.config),
    })),
    processors: (f.getProcessors?.() ?? []).length,
    conditions: (f.getConditions?.() ?? []).length,
  };
}

function safeJson(v) {
  try {
    return JSON.parse(JSON.stringify(v ?? null));
  } catch {
    return null;
  }
}
