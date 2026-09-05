// Card-issuer adapter. The original site talks to a virtual-card provider
// (BIN ids, masked PAN, sensitive endpoint, freeze/unfreeze, transactions);
// its provider and credentials are not public, so this module exposes the
// same interface and refuses honestly until ISSUER_API_URL / ISSUER_API_KEY
// are set and the six calls below are wired to a real provider.
import { env } from './site.mjs';

export class IssuerNotConfigured extends Error {
  constructor() {
    super('Card issuer not configured. Set ISSUER_API_URL and ISSUER_API_KEY in .env and implement lib/issuer.mjs for your provider.');
    this.status = 503;
  }
}

export const issuer = {
  get configured() { return Boolean(env.ISSUER_API_URL && env.ISSUER_API_KEY); },

  // -> { id, label, status, balance, last4 | masked_number }
  async createCard({ user, bin_id, balance, label }) { throw new IssuerNotConfigured(); },

  // -> [{ id, label, status, balance, last4 }]
  async listCards(user) { throw new IssuerNotConfigured(); },

  // -> { number, expiry_month, expiry_year, cvv }
  async sensitive(user, id) { throw new IssuerNotConfigured(); },

  async freeze(user, id) { throw new IssuerNotConfigured(); },
  async unfreeze(user, id) { throw new IssuerNotConfigured(); },

  // -> [{ description | merchant, amount }]
  async transactions(user, id) { throw new IssuerNotConfigured(); },
};
