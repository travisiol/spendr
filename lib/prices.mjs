// Live prices from DexScreener for the Robinhood Chain (chain slug "robinhood").
// One batched call for the whole token list, cached for 20 seconds.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, site } from './site.mjs';
import { erc20Decimals } from './chain.mjs';

const SLUG = site.chain.dexscreenerSlug;
const TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tokens.json'), 'utf8'));
const TTL = 20_000;

let cache = { at: 0, coins: null };
const decimalsCache = new Map();

function bestPair(pairs) {
  return pairs
    .filter(p => p.chainId === SLUG && p.priceUsd)
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  return r.json();
}

async function decimalsFor(address) {
  if (decimalsCache.has(address)) return decimalsCache.get(address);
  let d = 18;
  try { d = await erc20Decimals(address); } catch { /* keep 18 */ }
  decimalsCache.set(address, d);
  return d;
}

export async function getCoins() {
  if (cache.coins && Date.now() - cache.at < TTL) return cache.coins;
  const byAddr = new Map();
  for (let i = 0; i < TOKENS.length; i += 30) {
    const chunk = TOKENS.slice(i, i + 30);
    const url = `https://api.dexscreener.com/tokens/v1/${SLUG}/${chunk.map(t => t.address).join(',')}`;
    let pairs = [];
    try { pairs = await fetchJson(url); } catch (e) { console.error('[prices]', e.message); }
    for (const t of chunk) {
      const mine = pairs.filter(p => (p.baseToken?.address || '').toLowerCase() === t.address.toLowerCase());
      const p = bestPair(mine);
      byAddr.set(t.address.toLowerCase(), p);
    }
  }
  const coins = [];
  for (const t of TOKENS) {
    const p = byAddr.get(t.address.toLowerCase());
    coins.push({
      cat: t.cat,
      symbol: t.symbol,
      name: t.name,
      address: t.address,
      price: p ? Number(p.priceUsd) : 0,
      logo: p?.info?.imageUrl || null,
      decimals: await decimalsFor(t.address),
      pair: p?.pairAddress || null,
    });
  }
  cache = { at: Date.now(), coins };
  return coins;
}

export async function lookupToken(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Not a valid token address.');
  const pairs = await fetchJson(`https://api.dexscreener.com/tokens/v1/${SLUG}/${address}`);
  const p = bestPair(pairs.filter(x => (x.baseToken?.address || '').toLowerCase() === address.toLowerCase()));
  if (!p) throw new Error('No Robinhood-chain market found for this token on DexScreener.');
  return {
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    address: p.baseToken.address,
    price: Number(p.priceUsd),
    logo: p.info?.imageUrl || null,
    decimals: await decimalsFor(p.baseToken.address),
    pair: p.pairAddress,
  };
}

export async function findCoin({ symbol, address }) {
  const coins = await getCoins();
  if (address) {
    const c = coins.find(x => x.address.toLowerCase() === String(address).toLowerCase());
    if (c) return c;
    return lookupToken(address);
  }
  const c = coins.find(x => x.symbol.toUpperCase() === String(symbol || '').toUpperCase());
  if (!c) throw new Error('Unknown asset.');
  return c;
}
