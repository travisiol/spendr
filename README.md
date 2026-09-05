# Spendr Finance

Spend your Robinhood-chain assets. Tokenized stocks or memecoins in, a
Visa/Mastercard you can spend anywhere out.

Two pages, zero dependencies, no build step:

| Route  | What it is |
| ------ | ---------- |
| `/`    | Landing. Preloader with gradient ring + counter, three.js shader hero (night sky, sun on the horizon, dark chrome ring, animated water with mouse ripples), rising and tilting card with a moving chrome sheen and a blurred reflection, three glass sections, CTA band, footer. |
| `/app` | Card flow. Email gate → choose region + balance → pick an asset priced live from DexScreener → pay from an EVM wallet on Robinhood Chain (4663) → the server verifies the ERC-20 transfer into the treasury and asks the card issuer for a card. Cards list with reveal / freeze / transactions. |

## Run

```bash
npm run dev          # http://localhost:3040  (PORT or --port N to change)
npm run build        # dist/ static export of src/ with the brand filled in
```

`dev-server.mjs` serves `src/` and implements `/api/*` through `lib/api.mjs`.
Node ≥ 22, nothing to install.

## Deploy on Vercel

Push to GitHub and import the repo, nothing to configure: `vercel.json`
pins the build (`npm run build` → `dist/`, served static from the CDN) and
`api/[...path].mjs` is the single Vercel Function behind every `/api/*` call.
It reuses `lib/api.mjs`, so local and deployed behaviour are the same code.

Set the environment variables (`CONTRACT_ADDRESS`, `TREASURY_ADDRESS`,
`ISSUER_*`) in the Vercel project settings; the brand ones are read at build
time, so redeploy after changing them.

Do not add a `server.*` file at the root: Vercel would capture it as a
function and route the whole site through it (that is what produced the
`FUNCTION_INVOCATION_FAILED` crash the first time).

One limit of serverless: replay protection for deposit transactions lives in
memory per instance (`data/used-tx.json` is only written locally). Back it
with a database before enabling payments.

## Brand lives in one file

Every name, handle and address is a `{{PLACEHOLDER}}` in `src/**/*.html`,
filled at serve/build time from **`site.config.json`** (plus `.env` for
secrets). Renaming the project = editing `name`, `short`, `slug`, `domain`,
`xHandle`, `xUrl` there. The card artwork and the ghost mascot are inline SVG,
so the name printed on the card follows too.

## Before this goes live

- `CONTRACT_ADDRESS` (or `ca` in the config): the two "CA" pills (hero and
  CTA band) are not rendered at all until a token exists. Nothing is faked.
- `TREASURY_ADDRESS`: the wallet that receives deposits.
- A card issuer: `lib/issuer.mjs` exposes the six calls the app needs
  (create, list, sensitive, freeze, unfreeze, transactions) and throws
  *not configured* until you wire a provider and set `ISSUER_API_URL` /
  `ISSUER_API_KEY`. **Payments stay disabled in `/app` until both the
  treasury and the issuer are set**, so nobody can deposit into a flow that
  cannot hand a card back.
- `data/tokens.json`: the 20 assets shown, with their Robinhood-chain
  addresses. Prices come from DexScreener (`/tokens/v1/robinhood/…`), cached
  20 s. Decimals are read from the chain once per token.
- three.js 0.143 is loaded from unpkg via an import map, exactly like the
  reference. Vendor it into `src/vendor/` if you want zero third-party
  requests.

## Deviations from the reference

Deliberate, and small:

- Card and mascot are vector rebuilds, not the original PNGs (they carried the
  other brand's name). Layout, sizes, sheen mask and reflection are unchanged.
- The hero's "How it works" button links to `#how` (the reference sends it to
  `/app`).
- The CA pill is informational when no contract is configured.
- `/app` reads regions, amounts and fee from `/api/pay-config` instead of
  hard-coding them; the fallback values are the reference's.
- The card-tile initial badge shows the brand's first letter (the reference
  shows a leftover "K").
