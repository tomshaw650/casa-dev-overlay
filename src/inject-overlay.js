/**
 * Express middleware that hooks `res.send` and injects the devtools overlay
 * <link> + <script> tags right before `</body>` for any HTML response.
 *
 * Non-HTML responses are passed through untouched.
 */

import { MOUNT_PATH } from "./hook-stages.js";

export function injectOverlay({ mountPath = MOUNT_PATH } = {}) {
  const tag = (mount) =>
    `<link rel="stylesheet" href="${mount}/overlay.css">` +
    `<script src="${mount}/overlay.js" type="module" data-casa-dev-overlay-mount="${mount}"></script>`;

  return function (req, res, next) {
    // Compute the absolute mount of devtools assets relative to this app.
    const baseMount = `${req.baseUrl}${mountPath}`;
    const overlayTag = tag(baseMount);

    const origSend = res.send.bind(res);
    res.send = function (body) {
      try {
        const ct = String(res.getHeader("content-type") || "");
        if (
          ct.includes("text/html") &&
          typeof body === "string" &&
          body.includes("</body>")
        ) {
          body = body.replace("</body>", `${overlayTag}</body>`);
        }
      } catch {
        /* noop */
      }
      return origSend(body);
    };

    next();
  };
}
