/**
 * Build script: produce a CommonJS distribution at dist/index.cjs so the
 * package can be `require()`d as well as `import`ed.
 *
 * The ESM entry remains src/index.js (no compilation needed).
 *
 * Strategy:
 *   1. Copy overlay assets to dist/overlay/ so the bundled CJS can find them
 *      next to itself via __dirname (esbuild rewrites import.meta.url → URL
 *      based on __filename for CJS output).
 *   2. Bundle src/index.js with esbuild, marking peer + runtime deps as
 *      external so they are required at runtime from the host app's
 *      node_modules.
 */

import { build } from "esbuild";
import { mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// 1. Clean dist/
const dist = resolve(root, "dist");
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, "overlay"), { recursive: true });

// 2. Copy overlay assets (the bundled CJS resolves these via __dirname)
copyFileSync(
  resolve(root, "src/overlay/overlay.js"),
  resolve(dist, "overlay/overlay.js"),
);
copyFileSync(
  resolve(root, "src/overlay/overlay.css"),
  resolve(dist, "overlay/overlay.css"),
);

// 3. Bundle the entry as CJS
await build({
  entryPoints: [resolve(root, "src/index.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: resolve(dist, "index.cjs"),
  external: ["express", "@dwp/govuk-casa", "js-yaml"],
  legalComments: "none",
  logLevel: "info",
  // Polyfill `import.meta.url` for the CJS output: declare a top-level
  // constant in the banner, then redirect every `import.meta.url` reference
  // to it via define. The bundled __filename lives next to dist/overlay/ so
  // asset paths resolve correctly inside api-routes.js.
  banner: {
    js: "const __casaDtImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  // Flatten the default export so `require("casa-dev-overlay")` returns the
  // function directly (not `{ default: fn, __esModule: true }`). Keep
  // `.default` working too for ESM-style consumers and TS interop.
  footer: {
    js: "if (module.exports && module.exports.default) {\n  const _d = module.exports.default;\n  module.exports = _d;\n  module.exports.default = _d;\n}",
  },
  define: {
    "import.meta.url": "__casaDtImportMetaUrl",
  },
});

console.log("\n  \u2713 dist/index.cjs built\n");
