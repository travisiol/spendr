// Local server (and any long-running Node host): templated static files from
// src/ + the /api routes. `node dev-server.mjs [--port N]`
//
// Deliberately not named server.mjs: Vercel turns a root server.* file into a
// function, and there the site runs as static dist/ + api/[...path].mjs.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, site, env, render } from './lib/site.mjs';
import { handleApi, payConfig } from './lib/api.mjs';

const SRC = path.join(ROOT, 'src');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : env.PORT;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(SRC, rel));
  if (!file.startsWith(SRC)) { res.writeHead(403); return res.end(); }
  try {
    let st = await fs.stat(file).catch(() => null);
    if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.stat(file).catch(() => null); }
    if (!st && !path.extname(file)) { file = file + '.html'; st = await fs.stat(file).catch(() => null); }
    if (!st) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><title>404</title><p style="font-family:system-ui;padding:2rem">Not found</p>'); }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    if (ext === '.html' || ext === '.svg') {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      return res.end(render(await fs.readFile(file, 'utf8')));
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
    res.end(await fs.readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(e.message);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  return serveStatic(res, url.pathname);
}).listen(PORT, () => {
  const cfg = payConfig();
  console.log(`${site.name} → http://localhost:${PORT}`);
  console.log(`  chain ${site.chain.name} (${site.chain.id}) · rpc ${env.RPC}`);
  console.log(`  payments: ${cfg.to ? 'ENABLED → ' + cfg.to : 'disabled — ' + cfg.reason}`);
});
