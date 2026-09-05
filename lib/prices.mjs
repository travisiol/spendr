// Live prices from DexScreener for the Robinhood Chain (chain slug "robinhood").
// One batched call for the whole token list, cached for 20 seconds.
import { site } from './site.mjs';
import { erc20Decimals } from './chain.mjs';
import TOKENS from '../data/tokens.json' with { type: 'json' };

const SLUG = site.chain.dexscreenerSlug;
const TTL = 20_000;
// A quote below this much liquidity is not a price, it is noise: DexScreener
// sometimes lists a dead v4 pool at a stale price next to the real market.
const MIN_LIQ_USD = 1_000;
const MAJORS = new Set(['WETH', 'ETH', 'USDG', 'USDC', 'USDT']);

let cache = { at: 0, coins: null };
const decimalsCache = new Map();

function bestPair(pairs, address) {
  return pairs
    .filter(p => p.chainId === SLUG && Number(p.priceUsd) > 0 && (p.liquidity?.usd || 0) >= MIN_LIQ_USD)
    .filter(p => !address || (p.baseToken?.address || '').toLowerCase() === address.toLowerCase())
    .sort((a, b) => {
      const ma = MAJORS.has(a.quoteToken?.symbol) ? 1 : 0, mb = MAJORS.has(b.quoteToken?.symbol) ? 1 : 0;
      if (ma !== mb) return mb - ma;
      return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
    })[0];
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`DexScreener ${r.status}`);
  return r.json();
}

// The batched endpoint occasionally omits a token's real market; the per-token
// endpoint lists every pair, so it is the fallback when nothing liquid came back.
async function pairsForToken(address) {
  const j = await fetchJson(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
  return j.pairs || [];
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
    for (const t of chunk) byAddr.set(t.address.toLowerCase(), bestPair(pairs, t.address));
  }
  // Fallback, a few at a time, for tokens the batch left without a liquid market.
  const missing = TOKENS.filter(t => !byAddr.get(t.address.toLowerCase()));
  for (let i = 0; i < missing.length; i += 5) {
    await Promise.all(missing.slice(i, i + 5).map(async t => {
      try { byAddr.set(t.address.toLowerCase(), bestPair(await pairsForToken(t.address), t.address)); }
      catch (e) { console.error('[prices]', t.symbol, e.message); }
    }));
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
  let p = bestPair(await fetchJson(`https://api.dexscreener.com/tokens/v1/${SLUG}/${address}`), address);
  if (!p) p = bestPair(await pairsForToken(address), address);
  if (!p) throw new Error('No liquid Robinhood-chain market found for this token on DexScreener.');
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
