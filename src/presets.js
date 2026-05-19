/**
 * Preset loader. Reads YAML files compatible with the spiderplan persona
 * format used by CASA's own E2E tests:
 *
 * ```yaml
 * # .casa-presets/partner.yaml
 * target: check-your-answers      # waypoint to land on after applying
 * data:
 *   personal-details:
 *     firstName: Alice
 *     lastName:  Example
 *   live-with-partner:
 *     havePartner: "yes"
 * ```
 *
 * Anything beyond `data` and `target` is ignored.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import yaml from "js-yaml";

/**
 * @typedef {object} Preset
 * @property {string} name
 * @property {string} [target]
 * @property {Record<string, Record<string, unknown>>} data
 */

/**
 * List preset names available in the configured directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
export function listPresets(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs)
    .filter((f) => /\.(ya?ml)$/i.test(f))
    .map((f) => basename(f, extname(f)))
    .sort();
}

/**
 * Load and parse a preset by name.
 *
 * @param {string} dir
 * @param {string} name
 * @returns {Preset}
 */
export function loadPreset(dir, name) {
  const safe = String(name).replace(/[^a-z0-9_-]/gi, "");
  if (!safe) throw new Error("Invalid preset name");

  const tryPaths = [
    resolve(dir, `${safe}.yaml`),
    resolve(dir, `${safe}.yml`),
  ];
  const path = tryPaths.find((p) => existsSync(p));
  if (!path) throw new Error(`Preset not found: ${safe}`);

  const raw = readFileSync(path, "utf8");
  const parsed = yaml.load(raw) ?? {};
  return {
    name: safe,
    target: typeof parsed.target === "string" ? parsed.target : undefined,
    data:
      parsed.data && typeof parsed.data === "object" ? parsed.data : {},
  };
}
