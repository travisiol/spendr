// Zero-dependency server: templated static files from src/ + the /api the app
// page calls. `node server.mjs [--port N]`
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, site, env, render } from './lib/site.mjs';
import { getCoins, lookupToken, findCoin } from './lib/prices.mjs';
import { verifyTransfer } from './lib/chain.mjs';
import { issuer, IssuerNotConfigured } from './lib/issuer.mjs';

const SRC = path.join(ROOT, 'src');
const argPort = process.argv.indexOf('--port');
const PORT = argPort > -1 ? Number(process.argv[argPort + 1]) : env.PORT;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const usedTxPath = path.join(ROOT, 'data', 'used-tx.json');
let usedTx = new Set();
try { usedTx = new Set(JSON.parse(await fs.readFile(usedTxPath, 'utf8'))); } catch { /* first run */ }
async function markTx(h) { usedTx.add(h.toLowerCase()); await fs.writeFile(usedTxPath, JSON.stringify([...usedTx], null, 2)); }

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
function fail(res, e) {
  const status = e.status || (/not found yet|could not reach/i.test(e.message) ? 409 : 400);
  json(res, status, { error: e.message || 'Request failed' });
}
async function readBody(req) {
  let s = ''; for await (const c of req) { s += c; if (s.length > 1e6) throw new Error('Body too large'); }
  return s ? JSON.parse(s) : {};
}

// Payments are only enabled when BOTH a treasury and a card issuer exist,
// otherwise a real deposit could be taken with no card to hand back.
function payConfig() {
  const enabled = Boolean(env.TREASURY) && issuer.configured;
  let reason = null;
  if (!enabled) reason = !env.TREASURY ? 'Payments are not enabled yet (no treasury address configured).'
                                       : 'Payments are not enabled yet (card issuer not configured).';
  return {
    chainId: site.chain.id, chainName: site.chain.name, rpc: site.chain.rpc, explorer: site.chain.explorer,
    to: enabled ? env.TREASURY : null, reason, fee: site.fee, amounts: site.amounts, bins: site.bins,
  };
}

async function api(req, res, url) {
  const user = req.headers['x-user-id'] || '';
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/pay-config') return json(res, 200, payConfig());

    if (req.method === 'GET' && p === '/api/prices') {
      const coins = await getCoins();
      const prices = Object.fromEntries(coins.map(c => [c.symbol, c.price]));
      return json(res, 200, { prices, coins, chain: site.chain.dexscreenerSlug, at: Date.now() });
    }

    if (req.method === 'GET' && p === '/api/token') {
      return json(res, 200, await lookupToken(url.searchParams.get('address') || ''));
    }

    if (req.method === 'GET' && p === '/api/checkout-quote') {
      const balance = Number(url.searchParams.get('balance'));
      if (!site.amounts.includes(balance)) throw new Error('Unsupported card balance.');
      const c = await findCoin({ symbol: url.searchParams.get('symbol'), address: url.searchParams.get('address') });
      if (!(c.price > 0)) throw new Error('No live price for this asset right now.');
      const total = balance + site.fee;
      const coinQty = Math.ceil((total / c.price) * 1e6) / 1e6;
      return json(res, 200, { token: c.address, symbol: c.symbol, decimals: c.decimals, price: c.price, balance, fee: site.fee, total, coinQty });
    }

    if (req.method === 'POST' && p === '/api/checkout') {
      if (!user) throw new Error('Sign in first.');
      const cfg = payConfig();
      if (!cfg.to) throw new Error(cfg.reason);
      const body = await readBody(req);
      const balance = Number(body.balance);
      if (!site.amounts.includes(balance)) throw new Error('Unsupported card balance.');
      if (!site.bins.some(b => b.id === body.bin_id)) throw new Error('Unknown card region.');
      const tx = String(body.txHash || '').toLowerCase();
      if (usedTx.has(tx)) throw new Error('This transaction was already used.');
      const c = await findCoin({ symbol: body.symbol, address: body.address });
      const raw = await verifyTransfer({ txHash: tx, token: c.address, treasury: cfg.to });
      const received = Number(raw) / 10 ** c.decimals;
      const received_usd = received * c.price;
      const total = balance + site.fee;
      if (received_usd < total * 0.98) throw new Error(`Deposit too small: received ≈ $${received_usd.toFixed(2)}, needed $${total.toFixed(2)}.`);
      const card = await issuer.createCard({ user, bin_id: body.bin_id, balance, label: body.label || site.name });
      await markTx(tx);
      return json(res, 200, { ok: true, received_usd, card_id: card.id, card });
    }

    if (req.method === 'GET' && p === '/api/cards') {
      if (!user) throw new Error('Sign in first.');
      // No issuer yet → there are no cards; show the empty state, not a config error.
      if (!issuer.configured) return json(res, 200, { data: [] });
      return json(res, 200, { data: await issuer.listCards(user) });
    }

    const m = p.match(/^\/api\/cards\/([^/]+)\/(sensitive|freeze|unfreeze|transactions)$/);
    if (m) {
      if (!user) throw new Error('Sign in first.');
      const [, id, action] = m;
      if (action === 'sensitive' && req.method === 'GET') return json(res, 200, { data: await issuer.sensitive(user, id) });
      if (action === 'transactions' && req.method === 'GET') return json(res, 200, { data: await issuer.transactions(user, id) });
      if ((action === 'freeze' || action === 'unfreeze') && req.method === 'POST') return json(res, 200, { ok: true, data: await issuer[action](user, id) });
    }

    return json(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e instanceof IssuerNotConfigured) return json(res, 503, { error: e.message });
    return fail(res, e);
  }
}

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
      const html = render(await fs.readFile(file, 'utf8'));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      return res.end(html);
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
    res.end(await fs.readFile(file));
  } catch (e) {
    res.writeHead(500); res.end(e.message);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  return serveStatic(res, url.pathname);
}).listen(PORT, () => {
  const cfg = payConfig();
  console.log(`${site.name} → http://localhost:${PORT}`);
  console.log(`  chain ${site.chain.name} (${site.chain.id}) · rpc ${env.RPC}`);
  console.log(`  payments: ${cfg.to ? 'ENABLED → ' + cfg.to : 'disabled — ' + cfg.reason}`);
});
