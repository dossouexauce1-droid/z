// État de la démo, conservé dans le navigateur (aucun serveur, aucun argent réel).
const KEY = 'z.v2';

export const MERCHANTS = [
  { id: 'm1', name: 'Boutique Chez Afi', city: 'Cotonou' },
  { id: 'm2', name: 'Pharmacie Sainte-Rita', city: 'Cotonou' },
  { id: 'm3', name: 'Station Étoile Rouge', city: 'Cotonou' },
  { id: 'm4', name: 'Marché Ouando, étal 14', city: 'Porto-Novo' },
  { id: 'm5', name: 'Quincaillerie du Nord', city: 'Parakou' },
];

const empty = () => ({ customers: [], txs: [], attempts: [], reports: [], terminal: 'm1' });

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* stockage indisponible : la démo continue en mémoire */
  }
}

export function reset() {
  state = empty();
  save();
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const merchantById = (id) => MERCHANTS.find((m) => m.id === id);
export const customerById = (id) => state.customers.find((c) => c.id === id);

/** Celui qui reçoit l'argent : un commerce, ou un particulier (identifiant « c:… »). */
export function payeeById(id) {
  if (typeof id === 'string' && id.startsWith('c:')) {
    const c = customerById(id.slice(2));
    return c ? { id, name: c.name, city: null, person: true, customer: c } : null;
  }
  return merchantById(id) ?? null;
}

export async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const fcfa = (n) => `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} FCFA`;

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
