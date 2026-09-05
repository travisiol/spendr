// Brand + chain configuration, read once from site.config.json and .env.
// Every {{PLACEHOLDER}} in src/**/*.html is filled from here, so renaming
// the project is a one-file change.
//
// The config is *imported* (not read with fs) so that serverless bundlers
// such as Vercel's trace it and ship it with the function.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import site from '../site.config.json' with { type: 'json' };

export { site };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Local development only: a .env file next to package.json. On Vercel the
// variables come from the project settings and this is a no-op.
function loadDotEnv() {
  try {
    const p = path.join(ROOT, '.env');
    if (!fs.existsSync(p)) return;
    for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch { /* read-only or missing filesystem: ignore */ }
}
loadDotEnv();

export const env = {
  PORT: Number(process.env.PORT || 3040),
  TREASURY: (process.env.TREASURY_ADDRESS || '').trim(),
  RPC: (process.env.RPC_URL || site.chain.rpc).trim(),
  ISSUER_API_URL: (process.env.ISSUER_API_URL || '').trim(),
  ISSUER_API_KEY: (process.env.ISSUER_API_KEY || '').trim(),
  CA: (process.env.CONTRACT_ADDRESS || site.ca || '').trim(),
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function placeholders() {
  return {
    NAME: esc(site.name),
    SHORT: esc(site.short),
    SLUG: esc(site.slug),
    INITIAL: esc(site.short.charAt(0).toUpperCase()),
    DOMAIN: esc(site.domain),
    TAGLINE: esc(site.tagline),
    X_HANDLE: esc(site.xHandle),
    X_URL: esc(site.xUrl),
    CA: esc(env.CA),
  };
}

const IF_CA = /\{\{#IF_CA\}\}([\s\S]*?)\{\{\/IF_CA\}\}/g;
const TOKEN = /\{\{([A-Z_]+)\}\}/g;

export function render(html) {
  const map = placeholders();
  // {{#IF_CA}} … {{/IF_CA}} blocks (the two contract-address pills) only
  // render once a contract address exists; nothing is shown before.
  html = html.replace(IF_CA, (m, inner) => (env.CA ? inner : ''));
  return html.replace(TOKEN, (m, k) => (k in map ? map[k] : m));
}
