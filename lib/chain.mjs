// Minimal JSON-RPC client for the Robinhood Chain: token decimals and
// verification of an ERC-20 Transfer into the treasury. No dependencies.
import { env } from './site.mjs';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function rpc(method, params = []) {
  const r = await fetch(env.RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`Could not reach the chain RPC (${r.status}).`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}

export async function erc20Decimals(address) {
  const hex = await rpc('eth_call', [{ to: address, data: '0x313ce567' }, 'latest']);
  if (!hex || hex === '0x') throw new Error('decimals() returned nothing');
  return Number(BigInt(hex));
}

/**
 * Verify that `txHash` is a mined, successful transaction containing an
 * ERC-20 Transfer of `token` to `treasury`. Returns the raw amount as BigInt.
 * Throws with "not found yet" while the tx is still pending so the client
 * keeps polling.
 */
export async function verifyTransfer({ txHash, token, treasury }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || '')) throw new Error('Invalid transaction hash.');
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) throw new Error('Transaction not found yet. Still confirming…');
  if (receipt.status !== '0x1') throw new Error('Transaction reverted on-chain.');
  const to = treasury.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  let total = 0n;
  for (const log of receipt.logs || []) {
    if ((log.address || '').toLowerCase() !== token.toLowerCase()) continue;
    if ((log.topics?.[0] || '').toLowerCase() !== TRANSFER_TOPIC) continue;
    if ((log.topics?.[2] || '').toLowerCase().replace(/^0x/, '') !== to) continue;
    total += BigInt(log.data);
  }
  if (total === 0n) throw new Error('No transfer to the treasury found in this transaction.');
  return total;
}
