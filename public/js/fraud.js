// Moteur de suivi : chaque paiement reçoit un score de risque de 0 à 100
// et la liste des raisons qui l'expliquent. Un score élevé ne bloque pas le
// paiement : il déclenche un signalement discret, inscrit au registre.
import { state, save, uid, payeeById, MERCHANTS } from './store.js';

export const PIN_AMOUNT = 10000; // au-delà, le code PIN est toujours demandé
export const PIN_SCORE = 30; // à partir de ce score, le code PIN est exigé
export const REPORT_SCORE = 60; // à partir de ce score, le paiement est signalé
const MIN = 60 * 1000;

export function scoreTx({ customer, amount, merchantId, at, faceDistance = null }) {
  const reasons = [];
  const add = (points, label) => reasons.push({ points, label });
  const merchant = payeeById(merchantId) ?? { city: null };
  const mine = state.txs.filter((t) => t.customerId === customer.id && t.at <= at);
  const approved = mine.filter((t) => t.status === 'approved');

  // Montant très au-dessus des habitudes du client.
  if (approved.length >= 5) {
    const amounts = approved.map((t) => t.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / amounts.length);
    if (amount > mean + 3 * Math.max(sd, mean * 0.25)) {
      add(35, `Montant ${Math.round(amount / mean)} fois supérieur à la moyenne du client`);
    }
  } else if (amount >= 100000) {
    add(25, 'Gros montant sur un compte sans historique');
  }

  // Rafale de paiements.
  const recent = mine.filter((t) => at - t.at < 10 * MIN);
  if (recent.length >= 3) add(30, `${recent.length + 1} paiements en moins de 10 minutes`);

  // Deux villes différentes en trop peu de temps.
  const last = approved.filter((t) => at - t.at < 45 * MIN && payeeById(t.merchantId)?.city).at(-1);
  if (last) {
    const lastCity = payeeById(last.merchantId)?.city;
    if (lastCity && merchant.city && lastCity !== merchant.city) {
      add(45, `Paiement à ${merchant.city} ${Math.max(1, Math.round((at - last.at) / MIN))} min après un paiement à ${lastCity}`);
    }
  }

  // Argent envoyé à un particulier dont le compte vient d'être créé.
  if (merchant.person && amount >= 20000 && at - merchant.customer.createdAt < 24 * 60 * MIN) {
    add(20, 'Bénéficiaire dont le compte a moins de 24 heures');
  }

  // Heure inhabituelle.
  const hour = new Date(at).getHours();
  if (hour < 5) add(15, `Paiement en pleine nuit (${hour} h)`);

  // Le compte est presque vidé d'un coup.
  if (amount >= 20000 && amount > customer.balance * 0.9) add(20, 'Le paiement vide presque tout le compte');

  // Tentatives d'usurpation juste avant, sur ce terminal.
  const spoofs = state.attempts.filter((a) => a.merchantId === merchantId && a.kind === 'liveness' && at - a.at < 10 * MIN);
  if (spoofs.length) add(25, "Tentative d'usurpation sur ce terminal il y a moins de 10 minutes");

  // Ressemblance faciale juste au-dessus du seuil.
  if (faceDistance !== null && faceDistance > 0.43) add(15, 'Ressemblance du visage faible');

  const score = Math.min(100, reasons.reduce((a, r) => a + r.points, 0));
  const decision = score >= PIN_SCORE || amount >= PIN_AMOUNT ? 'pin' : 'approve';
  return { score, reasons, decision, report: score >= REPORT_SCORE };
}

export function recordTx(tx) {
  const row = { id: uid(), ...tx };
  state.txs.push(row);
  save();
  return row;
}

/** Inscrit un paiement au registre des signalements. Rien n'est réellement envoyé dans la démo. */
export function recordReport(tx) {
  const ref = `Z-${new Date(tx.at).getFullYear()}-${String(state.reports.length + 1).padStart(4, '0')}`;
  state.reports.push({ ref, txId: tx.id, at: tx.at, simulated: tx.simulated });
  save();
}

export function recordAttempt(attempt) {
  state.attempts.push({ id: uid(), at: Date.now(), ...attempt });
  save();
}

// ---------- Données simulées pour remplir le tableau de suivi ----------

const NAMES = ['Koffi Hounkpatin', 'Aïcha Bio', 'Rodrigue Agossou', 'Mariam Sanni', 'Bernadin Tossou', 'Gisèle Ahouansou'];

export function seedWeek() {
  const now = Date.now();
  const customers = NAMES.map((name) => ({
    id: uid(),
    name,
    phone: '',
    balance: 250000,
    descriptors: [],
    simulated: true,
    kyc: { status: 'simulé' },
    createdAt: now - 8 * 24 * 60 * MIN,
  }));
  state.customers.push(...customers);

  const planned = [];
  const cotonou = MERCHANTS.filter((m) => m.city === 'Cotonou');
  for (const c of customers) {
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const day = Math.floor(Math.random() * 7);
      const at = now - day * 24 * 60 * MIN - (60 + Math.random() * 600) * MIN;
      const d = new Date(at);
      if (d.getHours() < 7) d.setHours(9 + Math.floor(Math.random() * 9));
      planned.push({ c, at: d.getTime(), amount: 500 * (1 + Math.floor(Math.random() * 12)), merchantId: cotonou[Math.floor(Math.random() * cotonou.length)].id });
    }
  }
  // Scénarios de fraude injectés.
  const [a, b, c, d] = customers;
  const t1 = now - 26 * 60 * MIN;
  planned.push({ c: a, at: t1, amount: 3000, merchantId: 'm1' }, { c: a, at: t1 + 12 * MIN, amount: 40000, merchantId: 'm5' });
  const t2 = now - 50 * 60 * MIN;
  for (let i = 0; i < 5; i++) planned.push({ c: b, at: t2 + i * 90 * 1000, amount: 9500, merchantId: 'm3' });
  planned.push({ c, at: now - 5 * 60 * MIN, amount: 180000, merchantId: 'm2' });
  const night = new Date(now - 3 * 24 * 60 * MIN);
  night.setHours(2, 40);
  planned.push({ c: d, at: night.getTime(), amount: 95000, merchantId: 'm4' });

  planned.sort((x, y) => x.at - y.at);
  for (const p of planned) {
    if (p.at > now) continue;
    const { score, reasons, report } = scoreTx({ customer: p.c, amount: p.amount, merchantId: p.merchantId, at: p.at });
    const status = p.amount > p.c.balance ? 'declined' : 'approved';
    if (status === 'approved') p.c.balance -= p.amount;
    const tx = { id: uid(), customerId: p.c.id, merchantId: p.merchantId, amount: p.amount, at: p.at, status, score, reasons, flagged: report && status === 'approved', simulated: true };
    state.txs.push(tx);
    if (tx.flagged) recordReport(tx);
  }
  state.attempts.push(
    { id: uid(), at: now - 31 * 60 * MIN, merchantId: 'm3', kind: 'liveness', simulated: true },
    { id: uid(), at: now - 2 * 24 * 60 * MIN, merchantId: 'm1', kind: 'unknown', simulated: true },
  );
  state.txs.sort((x, y) => x.at - y.at);
  save();
}
