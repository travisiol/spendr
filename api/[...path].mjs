// Vercel Function: every /api/* request lands here (catch-all route) and is
// handed to the same router the local dev server uses.
import { handleApi } from '../lib/api.mjs';

export default function handler(req, res) {
  // Rebuild the public path from the catch-all segments so routing does not
  // depend on how the platform rewrote req.url.
  const segs = req.query && req.query.path ? [].concat(req.query.path) : null;
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  if (segs) url.pathname = '/api/' + segs.map(encodeURIComponent).join('/');
  return handleApi(req, res, url);
}
