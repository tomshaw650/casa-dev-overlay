/**
 * Express middleware that 404s any request whose host is not loopback.
 * This is a belt-and-braces protection so devtools APIs can never be reached
 * from a public address even if the plugin is accidentally enabled in
 * production.
 */
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export function loopbackGuard(req, res, next) {
  const host = String(req.hostname || "").toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return next();
  res.status(404).end();
}
