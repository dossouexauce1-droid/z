import { state, save, reset, uid, MERCHANTS, payeeById, customerById, hashPin, fcfa, esc } from './store.js';
import { runFaceSession, identify, reasonText, loadLiveModels } from './face.js';
import { scoreTx, recordTx, recordAttempt, recordReport, seedWeek, PIN_AMOUNT, PIN_SCORE, REPORT_SCORE } from './fraud.js';
import { analyzeDocument, matchDocumentToFace, VERDICTS } from './docs.js';

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
let session = null; // AbortController de la capture en cours

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

const when = (t) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t);
const firstName = (c) => c.name.trim().split(/\s+/)[0];
const enrolled = () => state.customers.filter((c) => c.descriptors?.length);

function verdict(stage, level, title, text, reasons = [], again) {
  const mark = { ok: '✓', bad: '✕', warn: '!' }[level];
  stage.innerHTML = `
    <div class="verdict-mark ${level}" aria-hidden="true">${mark}</div>
    <h2>${esc(title)}</h2>
    <p class="sub">${esc(text)}</p>
    ${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li>${r.points ? `<b>+${r.points}</b>` : ''}${esc(r.label)}</li>`).join('')}</ul>` : ''}
    <button class="btn ghost" data-again>${esc(again?.label ?? 'Nouveau paiement')}</button>`;
  stage.querySelector('[data-again]').addEventListener('click', again?.run ?? renderTill);
  stage.scrollIntoView({ block: 'nearest' });
}

// ======================= Accueil =======================

function renderHome() {
  view.innerHTML = `
    <section class="hero">
      <div class="hero-in">
        <div>
          <h1>Votre visage suffit pour payer.</h1>
          <p class="pitch">Avec Z, vous payez un commerce ou un proche sans téléphone ni carte. Votre identité est vérifiée en deux secondes et chaque paiement est surveillé contre la fraude.</p>
          <div class="hero-cta">
            <a class="btn gold" href="#encaisser">Essayer la démo</a>
            <a class="btn line" href="#enroler">Créer un compte</a>
          </div>
          <p class="get-app"><a href="telecharger/Z.apk" download>Télécharger l'application Android</a> (1 Mo, Android 7 ou plus récent)</p>
        </div>
        <div class="device" aria-hidden="true">
          <div class="device-top"><b>Boutique Chez Afi</b><span>Cotonou</span></div>
          <div class="scan">
            <svg viewBox="0 0 200 240">
              <path d="M100 26c36 0 58 26 58 66 0 44-26 82-58 82s-58-38-58-82c0-40 22-66 58-66z" fill="#232e78"/>
              <path d="M22 240c6-40 38-60 78-60s72 20 78 60z" fill="#1a2360"/>
              <g fill="#f5b700"><circle cx="76" cy="92" r="3.4"/><circle cx="124" cy="92" r="3.4"/><circle cx="100" cy="118" r="3"/><circle cx="82" cy="142" r="2.6"/><circle cx="100" cy="147" r="2.6"/><circle cx="118" cy="142" r="2.6"/><circle cx="58" cy="100" r="2.2"/><circle cx="142" cy="100" r="2.2"/><circle cx="100" cy="170" r="2.2"/></g>
              <g stroke="#f5b700" stroke-width="1" opacity="0.45" fill="none"><path d="M76 92l24 26 24-26M82 142l18-24 18 24M58 100l18-8M142 100l-18-8M82 142l18 28 18-28"/></g>
            </svg>
            <i class="corner a"></i><i class="corner b"></i><i class="corner c"></i><i class="corner d"></i>
            <i class="beam"></i>
          </div>
          <div class="receipt">
            <span class="sum">2 500 FCFA</span>
            <span class="state"><span class="checking">Vérification</span><span class="paid">Payé</span></span>
          </div>
        </div>
      </div>
    </section>

    <section class="band">
      <h2>Trois gestes, et le téléphone peut rester à la maison.</h2>
      <ol class="steps">
        <li><h3>Vous vous enregistrez une fois</h3><p>Nom, code PIN, pièce d'identité, puis votre visage. Deux minutes dans un point Z.</p></li>
        <li><h3>Vous regardez la caméra</h3><p>Chez le commerçant ou devant un proche, Z vous demande un geste simple pour vérifier que c'est bien vous, en personne.</p></li>
        <li><h3>C'est payé</h3><p>L'argent quitte votre compte et arrive chez le bénéficiaire. Au-dessus de ${fcfa(PIN_AMOUNT)}, votre code PIN confirme.</p></li>
      </ol>
    </section>

    <section class="band">
      <h2>Ce que l'intelligence artificielle fait à chaque paiement.</h2>
      <div class="caps">
        <div><svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/></svg><h3>Elle vous reconnaît</h3><p>Votre visage est comparé à tous les comptes. Seule une empreinte numérique est conservée, jamais la photo.</p></div>
        <div><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.6-2.9 8.3-7 10-4.1-1.7-7-5.4-7-10V6z"/><path d="M9 12l2.2 2.2L15 10.4"/></svg><h3>Elle déjoue les usurpations</h3><p>Une photo ou une vidéo tenue devant la caméra ne peut pas faire le geste demandé. Le paiement est refusé.</p></div>
        <div><svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-7 5 14 2.5-7h4"/></svg><h3>Elle suit la fraude</h3><p>Chaque paiement reçoit un score de risque expliqué. Les cas graves sont signalés aux autorités, sans alerter le fraudeur.</p></div>
        <div><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14.5l2 2 4-4"/></svg><h3>Elle contrôle les pièces d'identité</h3><p>Les documents retouchés sont repérés à l'enrôlement, et la photo de la pièce doit correspondre au visage en direct.</p></div>
      </div>
    </section>

    <section class="band">
      <h2>Où en est le projet.</h2>
      <div class="truth">
        <div><h3>Ce qui fonctionne aujourd'hui</h3><ul><li>Enrôlement et paiement par visage</li><li>Refus des photos et vidéos simples</li><li>Paiement vers un commerce ou un particulier</li><li>Score de risque et registre des signalements</li><li>Contrôle des pièces d'identité</li></ul></div>
        <div><h3>Ce que les GPU apporteront</h3><ul><li>Une détection des deepfakes</li><li>Une reconnaissance réentraînée sur des visages africains</li><li>Un modèle qui repère les réseaux de comptes complices</li><li>Un contrôle des pièces de la zone UEMOA</li></ul></div>
      </div>
    </section>
    <footer class="foot"><div><span>Z, prototype conçu pour le GPU Challenge 2026 à Cotonou.</span><span>Argent simulé. Aucune donnée ne quitte cet appareil.</span></div></footer>`;
}

// ======================= Encaisser =======================

function renderTill() {
  if (!payeeById(state.terminal)) state.terminal = 'm1';
  view.innerHTML = `
    <div class="head">
      <h1>Encaisser un paiement</h1>
      <p class="lede">Celui qui paie montre son visage. Il n'a besoin ni de téléphone ni de carte, et peut payer un commerce comme un particulier.</p>
    </div>
    <div class="till">
      <section class="panel till-side">
        <div class="field">
          <label for="merchant">Qui reçoit l'argent ?</label>
          <select id="merchant">
            <optgroup label="Commerces">${MERCHANTS.map((m) => `<option value="${m.id}" ${m.id === state.terminal ? 'selected' : ''}>${esc(m.name)}, ${esc(m.city)}</option>`).join('')}</optgroup>
            ${state.customers.length ? `<optgroup label="Particuliers">${state.customers.map((c) => `<option value="c:${c.id}" ${`c:${c.id}` === state.terminal ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>` : ''}
          </select>
        </div>
        <div class="field">
          <label for="amount">Montant à payer</label>
          <div class="amount-wrap">
            <input class="amount" id="amount" type="number" inputmode="numeric" min="1" step="1" placeholder="0">
            <span class="unit">FCFA</span>
          </div>
          <div class="quick">${[500, 1000, 2500, 5000, 15000, 50000].map((v) => `<button type="button" data-v="${v}">${new Intl.NumberFormat('fr-FR').format(v)}</button>`).join('')}</div>
        </div>
        <button class="btn big" id="charge">Encaisser</button>
        <p class="hint">Le code PIN est demandé à partir de ${fcfa(PIN_AMOUNT)}, ou si le paiement sort des habitudes du payeur.</p>
      </section>
      <section class="stage" id="stage"></section>
    </div>`;
  const stage = view.querySelector('#stage');
  const amountEl = view.querySelector('#amount');
  stage.innerHTML = enrolled().length
    ? `<div class="idle-oval"><span></span></div><h2>Prêt à encaisser</h2><p class="sub">Saisissez le montant, puis demandez au client de regarder la caméra.</p>`
    : `<div class="idle-oval"><span></span></div><h2>Aucun client enrôlé</h2><p class="sub">Enregistrez d'abord un visage pour pouvoir encaisser.</p><a class="btn ghost" href="#enroler">Enrôler un client</a>`;
  view.querySelector('#merchant').addEventListener('change', (e) => {
    state.terminal = e.target.value;
    save();
  });
  view.querySelectorAll('.quick button').forEach((b) => b.addEventListener('click', () => (amountEl.value = b.dataset.v)));
  view.querySelector('#charge').addEventListener('click', () => {
    const amount = Math.floor(Number(amountEl.value));
    if (!(amount > 0)) return toast('Saisissez un montant supérieur à zéro.');
    if (!enrolled().length) return toast("Enrôlez d'abord un client.");
    charge(amount, stage);
  });
}

async function charge(amount, stage) {
  const merchantId = state.terminal;
  const button = view.querySelector('#charge');
  button.disabled = true;
  session = new AbortController();
  const result = await runFaceSession({ stage, samples: 3, signal: session.signal });
  if (button.isConnected) button.disabled = false;
  if (!result.ok) {
    if (result.reason === 'cancelled') return;
    if (result.reason === 'liveness' || result.reason === 'swap') recordAttempt({ merchantId, kind: 'liveness', amount });
    return verdict(stage, 'bad', 'Paiement refusé', reasonText(result.reason));
  }
  const hit = identify(result.descriptors);
  if (!hit.customer) {
    recordAttempt({ merchantId, kind: 'unknown', amount });
    return verdict(stage, 'bad', 'Visage non reconnu', hit.ambiguous ? 'Deux clients se ressemblent trop pour décider. Paiement refusé par prudence.' : "Ce visage ne correspond à aucun client enrôlé.");
  }
  if (payeeById(merchantId)?.customer === hit.customer) {
    return verdict(stage, 'bad', 'Paiement refusé', 'Vous ne pouvez pas vous payer vous-même. Choisissez un autre bénéficiaire.');
  }
  await settle(hit.customer, amount, merchantId, hit.distance, stage);
}

/** Décide du sort d'un paiement une fois le client identifié. */
export async function settle(customer, amount, merchantId, faceDistance, stage) {
  const at = Date.now();
  const risk = scoreTx({ customer, amount, merchantId, at, faceDistance });
  const base = { customerId: customer.id, merchantId, amount, at, score: risk.score, reasons: risk.reasons };

  if (amount > customer.balance) {
    recordTx({ ...base, status: 'declined' });
    return verdict(stage, 'bad', 'Solde insuffisant', `${firstName(customer)} n'a pas assez d'argent sur son compte.`);
  }
  if (risk.decision === 'pin') {
    const pinOk = await askPin(stage, customer, amount);
    if (pinOk === null) return renderTill();
    if (!pinOk) {
      recordTx({ ...base, status: 'blocked', reasons: [...risk.reasons, { points: 0, label: 'Trois codes PIN faux' }] });
      return verdict(stage, 'bad', 'Paiement refusé', 'Trois codes PIN faux. Le paiement est annulé.');
    }
  }
  const payee = payeeById(merchantId);
  customer.balance -= amount;
  if (payee.person) payee.customer.balance += amount;
  const tx = recordTx({ ...base, status: 'approved', flagged: risk.report });
  // Signalement discret : rien n'apparaît sur l'écran du payeur ni du bénéficiaire.
  if (risk.report) recordReport(tx);
  verdict(stage, 'ok', 'Paiement accepté', `${fcfa(amount)} payés par ${firstName(customer)} à ${payee.name}.`);
}

function askPin(stage, customer, amount) {
  return new Promise((resolve) => {
    let tries = 3;
    stage.innerHTML = `
      <h2>Bonjour ${esc(firstName(customer))}</h2>
      <div class="amount-big">${fcfa(amount)}</div>
      <p class="sub">Saisissez votre code PIN pour confirmer.</p>
      <form class="pin-row">
        <input type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="Code PIN">
        <button class="btn big" style="width:auto">Confirmer</button>
      </form>
      <p class="sub" data-msg></p>
      <button class="btn ghost" data-cancel>Annuler le paiement</button>`;
    const input = stage.querySelector('input');
    const msg = stage.querySelector('[data-msg]');
    input.focus();
    stage.querySelector('[data-cancel]').addEventListener('click', () => resolve(null));
    stage.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = (await hashPin(input.value, customer.salt)) === customer.pinHash;
      if (ok) return resolve(true);
      tries -= 1;
      if (tries === 0) return resolve(false);
      input.value = '';
      msg.textContent = `Code faux. Il reste ${tries} essai${tries > 1 ? 's' : ''}.`;
    });
  });
}

// ======================= Enrôler =======================

function renderEnroll() {
  let doc = null;
  view.innerHTML = `
    <div class="head">
      <h1>Enrôler un client</h1>
      <p class="lede">Le client s'enregistre une seule fois. Ensuite, son visage suffit pour payer partout.</p>
    </div>
    <div class="enroll">
      <form class="panel" id="form" novalidate>
        <div class="field"><label for="name">Nom et prénom</label><input id="name" type="text" autocomplete="off" required></div>
        <div class="field"><label for="phone">Numéro de téléphone</label><input id="phone" type="tel" autocomplete="off"></div>
        <div class="two">
          <div class="field"><label for="pin">Code PIN, 4 chiffres</label><input id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" required></div>
          <div class="field"><label for="deposit">Dépôt initial, en FCFA</label><input id="deposit" type="number" min="0" step="500" value="50000"></div>
        </div>
        <div class="field">
          <label for="doc">Photo de la pièce d'identité</label>
          <input id="doc" type="file" accept="image/*">
          <p class="hint">Facultatif dans la démo. La photo est analysée puis oubliée : seul le résultat est gardé.</p>
          <div id="docout"></div>
        </div>
        <button class="btn big">Enregistrer le visage</button>
      </form>
      <section class="stage" id="stage">
        <div class="idle-oval"><span></span></div>
        <h2>Le visage devient le moyen de paiement</h2>
        <p class="sub">Seule une empreinte numérique chiffrable du visage est gardée, jamais la photo.</p>
      </section>
    </div>`;
  const stage = view.querySelector('#stage');
  const out = view.querySelector('#docout');
  const again = { label: 'Recommencer', run: renderEnroll };

  view.querySelector('#doc').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    doc = null;
    if (!file) return (out.innerHTML = '');
    out.innerHTML = '<p class="hint">Analyse du document en cours…</p>';
    try {
      doc = await analyzeDocument(file);
      out.innerHTML = documentReport(doc, false);
    } catch {
      out.innerHTML = '<p class="hint">Ce fichier n\'est pas une image lisible. Choisissez une photo JPEG ou PNG.</p>';
    }
  });

  view.querySelector('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = view.querySelector('#name').value.trim();
    const phone = view.querySelector('#phone').value.trim();
    const pin = view.querySelector('#pin').value;
    const deposit = Math.max(0, Math.floor(Number(view.querySelector('#deposit').value) || 0));
    if (!name) return toast('Saisissez le nom du client.');
    if (!/^\d{4}$/.test(pin)) return toast('Le code PIN doit contenir exactement 4 chiffres.');
    if (doc?.verdict === 'bad') {
      recordAttempt({ merchantId: null, kind: 'docfake', name });
      return verdict(stage, 'bad', 'Enrôlement refusé', "La pièce d'identité présente des indices de falsification. Un agent doit la contrôler.", [], again);
    }
    const button = e.submitter;
    button.disabled = true;
    session = new AbortController();
    const result = await runFaceSession({ stage, samples: 5, signal: session.signal });
    if (button.isConnected) button.disabled = false;
    if (!result.ok) {
      if (result.reason === 'cancelled') return;
      return verdict(stage, 'bad', 'Visage non enregistré', reasonText(result.reason), [], again);
    }
    const twin = identify(result.descriptors).customer;
    if (twin) {
      recordAttempt({ merchantId: null, kind: 'duplicate', name });
      return verdict(stage, 'bad', 'Visage déjà enrôlé', `Ce visage appartient déjà au compte de ${firstName(twin)}. Une personne ne peut avoir qu'un compte.`, [], again);
    }
    let kyc = { status: 'sans pièce' };
    if (doc?.descriptor) {
      const m = matchDocumentToFace(doc.descriptor, result.descriptors);
      if (!m.same) {
        recordAttempt({ merchantId: null, kind: 'docmismatch', name });
        return verdict(stage, 'bad', 'Enrôlement refusé', "Le visage en direct ne correspond pas à la photo de la pièce d'identité.", [], again);
      }
      kyc = { status: doc.verdict === 'ok' ? 'vérifié' : 'à vérifier' };
    }
    const salt = uid();
    state.customers.push({
      id: uid(), name, phone, balance: deposit, salt, pinHash: await hashPin(pin, salt),
      descriptors: result.descriptors.map((d) => Array.from(d)), kyc, createdAt: Date.now(),
    });
    save();
    verdict(stage, 'ok', `${firstName({ name })} peut payer avec son visage`, `Compte créé avec ${fcfa(deposit)}. Pièce d'identité : ${kyc.status}.`, [], { label: 'Aller à la caisse', run: () => (location.hash = '#encaisser') });
  });
}

function documentReport(doc, withMap) {
  const level = doc.verdict;
  return `
    <p style="margin-top:12px"><span class="chip ${level}">${VERDICTS[level]}</span></p>
    <ul class="findings">${doc.findings.map((f) => `<li><span class="dot ${f.level}"></span><b>${esc(f.title)}</b><small>${esc(f.detail)}</small></li>`).join('')}</ul>
    ${withMap ? '<div class="docmap"></div>' : ''}`;
}

// ======================= Clients =======================

const KYC_CHIP = { 'vérifié': 'ok', 'à vérifier': 'warn', 'sans pièce': 'warn', 'simulé': 'sim' };

function renderClients() {
  const rows = state.customers;
  view.innerHTML = `
    <div class="head"><h1>Clients</h1><p class="lede">Les comptes enrôlés sur cet appareil et leur solde simulé.</p></div>
    ${rows.length ? `<div class="panel table-wrap"><table>
      <thead><tr><th>Client</th><th>Téléphone</th><th>Pièce d'identité</th><th class="num">Solde</th><th></th></tr></thead>
      <tbody>${rows.map((c) => `<tr>
        <td><b>${esc(c.name)}</b>${c.simulated ? ' <span class="chip sim">simulé</span>' : ''}</td>
        <td>${esc(c.phone || 'Non renseigné')}</td>
        <td><span class="chip ${KYC_CHIP[c.kyc?.status] ?? 'warn'}">${esc(c.kyc?.status ?? 'sans pièce')}</span></td>
        <td class="num"><b>${fcfa(c.balance)}</b></td>
        <td class="num"><button class="btn small ghost" data-top="${c.id}">Recharger 10 000</button> <button class="btn small danger" data-del="${c.id}">Supprimer</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="panel empty"><h2>Aucun client pour l'instant</h2><p>Enregistrez un premier visage pour commencer.</p><a class="btn" href="#enroler">Enrôler un client</a></div>`}`;
  view.querySelectorAll('[data-top]').forEach((b) => b.addEventListener('click', () => {
    customerById(b.dataset.top).balance += 10000;
    save();
    renderClients();
  }));
  view.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'Confirmer la suppression';
      return;
    }
    state.customers = state.customers.filter((c) => c.id !== b.dataset.del);
    save();
    renderClients();
  }));
}

// ======================= Suivi des fraudes =======================

const ATTEMPTS = {
  liveness: 'Usurpation refusée : photo ou vidéo présentée à la caméra',
  unknown: 'Visage inconnu',
  duplicate: 'Double enrôlement refusé',
  docmismatch: "Pièce d'identité d'une autre personne",
  docfake: "Pièce d'identité suspecte refusée",
};
const STATUS = { approved: ['ok', 'Accepté'], flagged: ['bad', 'Accepté, signalé'], blocked: ['bad', 'Refusé'], declined: ['warn', 'Solde insuffisant'] };
let onlyAlerts = false;

function renderMonitor() {
  const txs = state.txs;
  const approved = txs.filter((t) => t.status === 'approved');
  const flagged = txs.filter((t) => t.flagged);
  const spoofs = state.attempts.filter((a) => a.kind === 'liveness');
  const events = [
    ...txs.map((t) => ({ ...t, type: 'tx' })),
    ...state.attempts.map((a) => ({ ...a, type: 'attempt' })),
  ]
    .filter((e) => !onlyAlerts || e.type === 'attempt' || e.status === 'blocked' || e.score >= PIN_SCORE)
    .sort((a, b) => b.at - a.at)
    .slice(0, 120);

  view.innerHTML = `
    <div class="head"><h1>Suivi des fraudes</h1><p class="lede">Chaque paiement reçoit un score de risque de 0 à 100, avec les raisons. À partir de ${PIN_SCORE}, le code PIN est exigé. À partir de ${REPORT_SCORE}, le paiement passe mais il est signalé discrètement aux autorités.</p></div>
    <div class="kpis">
      <div><b>${approved.length}</b><span>paiements acceptés</span></div>
      <div><b>${fcfa(approved.reduce((a, t) => a + t.amount, 0))}</b><span>encaissés</span></div>
      <div class="alert"><b>${flagged.length}</b><span>paiements signalés, soit ${fcfa(flagged.reduce((a, t) => a + t.amount, 0))}</span></div>
      <div class="alert"><b>${spoofs.length}</b><span>usurpations de visage refusées</span></div>
    </div>
    <div class="bar">
      <label style="margin:0;display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" id="only" ${onlyAlerts ? 'checked' : ''}> Afficher seulement les alertes</label>
      <span class="spacer"></span>
      <button class="btn small ghost" id="seed">Ajouter une semaine d'activité simulée</button>
      <button class="btn small danger" id="wipe">Tout effacer</button>
    </div>
    ${events.length ? `<div class="panel table-wrap"><table>
      <thead><tr><th>Date</th><th>Payeur</th><th>Bénéficiaire</th><th class="num">Montant</th><th>Risque</th><th>Résultat</th><th>Pourquoi</th></tr></thead>
      <tbody>${events.map(eventRow).join('')}</tbody></table></div>`
      : `<div class="panel empty"><h2>Rien à afficher</h2><p>Encaissez un paiement, ou ajoutez une semaine d'activité simulée pour voir le suivi fonctionner.</p></div>`}
    <p class="note">Dans cette première version, le score vient de règles et de statistiques par client. La version entraînée sur GPU ajoutera un modèle de graphe qui repère les réseaux de comptes complices.</p>`;

  view.querySelector('#only').addEventListener('change', (e) => {
    onlyAlerts = e.target.checked;
    renderMonitor();
  });
  view.querySelector('#seed').addEventListener('click', () => {
    seedWeek();
    renderMonitor();
    toast("Une semaine d'activité simulée a été ajoutée.");
  });
  view.querySelector('#wipe').addEventListener('click', (e) => {
    if (!e.target.dataset.armed) {
      e.target.dataset.armed = '1';
      e.target.textContent = 'Confirmer : effacer clients et paiements';
      return;
    }
    reset();
    renderMonitor();
  });
}

function payeeCell(id) {
  if (id === null || id === undefined) return 'Enrôlement';
  const payee = payeeById(id);
  if (!payee) return 'Compte supprimé';
  return `${esc(payee.name)}<br><span class="why">${payee.person ? 'Particulier' : esc(payee.city)}</span>`;
}

function eventRow(e) {
  const place = payeeCell(e.merchantId);
  const sim = e.simulated ? ' <span class="chip sim">simulé</span>' : '';
  if (e.type === 'attempt') {
    return `<tr><td>${when(e.at)}</td><td>${esc(e.name ?? 'Inconnu')}${sim}</td><td>${place}</td><td class="num">${e.amount ? fcfa(e.amount) : ''}</td><td><span class="score high">!</span></td><td><span class="chip bad">Refusé</span></td><td class="why">${ATTEMPTS[e.kind] ?? ''}</td></tr>`;
  }
  const [level, label] = STATUS[e.flagged ? 'flagged' : e.status];
  const band = e.score >= REPORT_SCORE ? 'high' : e.score >= PIN_SCORE ? 'mid' : 'low';
  return `<tr>
    <td>${when(e.at)}</td>
    <td>${esc(customerById(e.customerId)?.name ?? 'Compte supprimé')}${sim}</td>
    <td>${place}</td>
    <td class="num">${fcfa(e.amount)}</td>
    <td><span class="score ${band}">${e.score}</span></td>
    <td><span class="chip ${level}">${label}</span></td>
    <td class="why">${e.reasons.map((r) => esc(r.label)).join('<br>') || 'Paiement habituel'}</td>
  </tr>`;
}

// ======================= Signalements =======================

function reportRows() {
  return state.reports
    .map((r) => ({ r, tx: state.txs.find((t) => t.id === r.txId) }))
    .filter((x) => x.tx)
    .sort((a, b) => b.r.at - a.r.at);
}

function renderReports() {
  const rows = reportRows();
  view.innerHTML = `
    <div class="head"><h1>Signalements aux autorités</h1><p class="lede">Les paiements au score de ${REPORT_SCORE} ou plus ne sont pas bloqués. Ils sont inscrits ici, sans que le payeur ni le bénéficiaire le voient, pour être transmis à l'autorité de contrôle.</p></div>
    <div class="bar"><span class="spacer"></span><button class="btn small ghost" id="csv" ${rows.length ? '' : 'disabled'}>Télécharger le registre</button></div>
    ${rows.length ? `<div class="panel table-wrap"><table>
      <thead><tr><th>Référence</th><th>Date</th><th>Payeur</th><th>Bénéficiaire</th><th class="num">Montant</th><th>Risque</th><th>Motifs</th></tr></thead>
      <tbody>${rows.map(({ r, tx }) => `<tr>
        <td><b>${r.ref}</b>${r.simulated ? ' <span class="chip sim">simulé</span>' : ''}</td>
        <td>${when(r.at)}</td>
        <td>${esc(customerById(tx.customerId)?.name ?? 'Compte supprimé')}</td>
        <td>${payeeCell(tx.merchantId)}</td>
        <td class="num">${fcfa(tx.amount)}</td>
        <td><span class="score high">${tx.score}</span></td>
        <td class="why">${tx.reasons.map((x) => esc(x.label)).join('<br>')}</td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="panel empty"><h2>Aucun signalement</h2><p>Un paiement apparaît ici dès que son score atteint ${REPORT_SCORE}.</p></div>`}
    <p class="note">Dans cette démonstration, rien n'est réellement transmis : le registre reste sur cet ordinateur. Le destinataire prévu (administration fiscale ou cellule de renseignement financier) reste à fixer avec un juriste.</p>`;
  view.querySelector('#csv').addEventListener('click', () => {
    const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Référence', 'Date', 'Payeur', 'Bénéficiaire', 'Montant FCFA', 'Risque', 'Motifs'].map(cell).join(';')];
    for (const { r, tx } of rows) {
      lines.push([r.ref, new Date(r.at).toISOString(), customerById(tx.customerId)?.name ?? '', payeeById(tx.merchantId)?.name ?? '', tx.amount, tx.score, tx.reasons.map((x) => x.label).join(' | ')].map(cell).join(';'));
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' }));
    link.download = 'signalements-z.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  });
}

// ======================= Vérifier un document =======================

function renderDocs() {
  view.innerHTML = `
    <div class="head"><h1>Vérifier un document</h1><p class="lede">Déposez la photo d'une pièce d'identité. L'analyse cherche les traces de retouche et les zones modifiées.</p></div>
    <div class="enroll">
      <div class="panel">
        <div class="field"><label for="file">Photo du document</label><input id="file" type="file" accept="image/*"></div>
        <p class="hint">Le fichier reste sur cet ordinateur. Rien n'est envoyé ni conservé.</p>
      </div>
      <div class="panel" id="report"><div class="empty"><h2>En attente d'un document</h2><p>Le résultat et la carte des zones suspectes s'afficheront ici.</p></div></div>
    </div>
    <p class="note">Ces contrôles donnent des indices à un agent, pas une preuve. La version entraînée sur GPU utilisera un modèle de vision spécialisé dans les pièces d'identité de la zone UEMOA.</p>`;
  const report = view.querySelector('#report');
  view.querySelector('#file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    report.innerHTML = '<div class="empty"><h2>Analyse en cours…</h2></div>';
    try {
      const doc = await analyzeDocument(file);
      report.innerHTML = `<h2>Résultat</h2>${documentReport(doc, true)}`;
      report.querySelector('.docmap').append(doc.map);
    } catch {
      report.innerHTML = '<div class="empty"><h2>Fichier illisible</h2><p>Choisissez une photo au format JPEG ou PNG.</p></div>';
    }
  });
}

// ======================= Navigation =======================

const ROUTES = { accueil: renderHome, encaisser: renderTill, enroler: renderEnroll, clients: renderClients, suivi: renderMonitor, signalements: renderReports, documents: renderDocs };

function route() {
  session?.abort();
  session = null;
  const key = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'accueil';
  document.body.classList.toggle('home', key === 'accueil');
  window.scrollTo(0, 0);
  document.querySelectorAll('.top nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${key}`));
  ROUTES[key]();
}

window.addEventListener('hashchange', route);
route();
loadLiveModels().catch(() => toast('Le moteur de reconnaissance ne se charge pas. Rechargez la page.'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
