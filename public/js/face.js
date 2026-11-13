// Reconnaissance faciale : chargement des modèles, caméra, session de capture
// avec défi anti-usurpation, et identification 1:N.
import * as faceapi from '../vendor/face-api.esm.js';
import { state } from './store.js';

const MODELS = 'models';
export const MATCH_THRESHOLD = 0.5; // distance max pour reconnaître un client
const MATCH_MARGIN = 0.04; // écart minimal avec le deuxième meilleur candidat

let liveReady;
let docReady;

export function loadLiveModels() {
  liveReady ??= Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODELS),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODELS),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
  ]).then(async () => {
    // Premier passage à blanc : le navigateur prépare le calcul graphique
    // maintenant, pour que le premier paiement ne soit pas ralenti.
    const blank = document.createElement('canvas');
    blank.width = 320;
    blank.height = 240;
    await faceapi.detectSingleFace(blank, liveOptions()).withFaceLandmarks().withFaceDescriptor();
  });
  return liveReady;
}

export function loadDocModels() {
  docReady ??= Promise.all([loadLiveModels(), faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS)]);
  return docReady;
}

const liveOptions = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

async function detect(video, withDescriptor) {
  const task = faceapi.detectSingleFace(video, liveOptions()).withFaceLandmarks();
  return withDescriptor ? task.withFaceDescriptor() : task;
}

/** Tous les visages d'une image fixe (photo de pièce d'identité). */
export async function facesInImage(image) {
  await loadDocModels();
  return faceapi
    .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
}

export const distance = (a, b) => faceapi.euclideanDistance(a, b);

/** Cherche le client dont le visage est le plus proche. */
export function identify(descriptors) {
  const ranked = state.customers
    .filter((c) => c.descriptors?.length)
    .map((c) => {
      let best = Infinity;
      for (const probe of descriptors) for (const ref of c.descriptors) best = Math.min(best, distance(probe, ref));
      return { customer: c, distance: best };
    })
    .sort((a, b) => a.distance - b.distance);
  const [first, second] = ranked;
  if (!first || first.distance > MATCH_THRESHOLD) return { customer: null, distance: first?.distance ?? null };
  if (second && second.distance - first.distance < MATCH_MARGIN) return { customer: null, distance: first.distance, ambiguous: true };
  return first;
}

// ---------- Mesures de vivacité à partir des 68 points du visage ----------

const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function metrics(p) {
  return {
    // 0,5 = de face. Augmente quand la personne tourne la tête vers sa gauche.
    yaw: (p[30].x - p[0].x) / (p[16].x - p[0].x),
    // Ouverture de la bouche rapportée à sa largeur.
    mouth: gap(p[62], p[66]) / gap(p[60], p[64]),
  };
}

const isNeutral = (m) => m.yaw > 0.38 && m.yaw < 0.62 && m.mouth < 0.3;

const CHALLENGES = [
  { id: 'left', label: 'Tournez la tête vers la gauche', arrow: '←', test: (m) => m.yaw > 0.68 },
  { id: 'right', label: 'Tournez la tête vers la droite', arrow: '→', test: (m) => m.yaw < 0.32 },
  { id: 'mouth', label: 'Ouvrez grand la bouche', arrow: '◯', test: (m) => m.mouth > 0.5 },
];

function pickChallenges() {
  const pool = [...CHALLENGES];
  const out = [];
  while (out.length < 2) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

const REASONS = {
  camera: "La caméra n'est pas accessible. Autorisez-la dans le navigateur puis recommencez.",
  'no-face': "Aucun visage n'a été vu de face. Rapprochez-vous et regardez la caméra.",
  liveness: "Le geste demandé n'a pas été fait. Une photo ou une vidéo ne peut pas payer.",
  swap: 'Le visage a changé pendant la vérification.',
  cancelled: 'Vérification annulée.',
};
export const reasonText = (r) => REASONS[r] ?? 'Vérification interrompue.';

// Attend l'image suivante, sans rester bloqué si l'onglet passe en arrière-plan.
const nextFrame = () =>
  new Promise((r) => {
    requestAnimationFrame(r);
    setTimeout(r, 120);
  });

/**
 * Ouvre la caméra dans `stage`, fait passer deux défis tirés au hasard,
 * puis renvoie `samples` empreintes numériques du visage.
 * Résultat : { ok: true, descriptors } ou { ok: false, reason }.
 */
export async function runFaceSession({ stage, samples = 3, signal }) {
  stage.innerHTML = `
    <div class="cam">
      <video playsinline muted></video>
      <canvas></canvas>
      <div class="cam-oval"></div>
      <div class="cam-arrow" hidden></div>
    </div>
    <p class="cam-status" role="status" aria-live="polite">Chargement du moteur de reconnaissance…</p>
    <div class="cam-steps"><i></i><i></i><i></i><i></i></div>`;
  const video = stage.querySelector('video');
  const canvas = stage.querySelector('canvas');
  const status = stage.querySelector('.cam-status');
  const arrow = stage.querySelector('.cam-arrow');
  const steps = [...stage.querySelectorAll('.cam-steps i')];
  const say = (t) => (status.textContent = t);
  const done = (i) => steps[i]?.classList.add('done');
  let stream;

  const fail = (reason) => ({ ok: false, reason });
  const aborted = () => signal?.aborted;

  try {
    await loadLiveModels();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch {
      return fail('camera');
    }
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    const look = async (withDescriptor = false) => {
      await nextFrame();
      const hit = await detect(video, withDescriptor);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!hit) return null;
      ctx.fillStyle = '#F6C40C';
      for (const pt of hit.landmarks.positions) ctx.fillRect(pt.x - 1.2, pt.y - 1.2, 2.4, 2.4);
      const bigEnough = hit.detection.box.width > video.videoWidth * 0.2;
      return { ...hit, m: metrics(hit.landmarks.positions), bigEnough };
    };

    // 1. Cadrage : un visage de face, assez proche.
    say("Placez votre visage dans l'ovale et regardez la caméra");
    let reference = null;
    let steady = 0;
    const framingDeadline = Date.now() + 20000;
    while (!reference) {
      if (aborted()) return fail('cancelled');
      if (Date.now() > framingDeadline) return fail('no-face');
      const hit = await look(steady >= 2);
      if (hit && hit.bigEnough && isNeutral(hit.m)) {
        steady += 1;
        if (hit.descriptor) reference = hit.descriptor;
      } else {
        steady = 0;
      }
    }
    done(0);

    // 2. Défis : une photo à plat ne peut ni tourner la tête ni ouvrir la bouche.
    let stepIndex = 1;
    for (const challenge of pickChallenges()) {
      say(challenge.label);
      arrow.textContent = challenge.arrow;
      arrow.dataset.kind = challenge.id;
      arrow.hidden = false;
      let hits = 0;
      const deadline = Date.now() + 9000;
      while (hits < 2) {
        if (aborted()) return fail('cancelled');
        if (Date.now() > deadline) return fail('liveness');
        const hit = await look();
        hits = hit && challenge.test(hit.m) ? hits + 1 : 0;
      }
      arrow.hidden = true;
      done(stepIndex++);
    }

    // 3. Capture des empreintes, en vérifiant que c'est toujours la même personne.
    say('Regardez de nouveau la caméra');
    const descriptors = [];
    const captureDeadline = Date.now() + 15000;
    while (descriptors.length < samples) {
      if (aborted()) return fail('cancelled');
      if (Date.now() > captureDeadline) return fail('no-face');
      const hit = await look(true);
      if (!hit || !hit.bigEnough || !isNeutral(hit.m)) continue;
      if (distance(hit.descriptor, reference) > 0.5) return fail('swap');
      descriptors.push(hit.descriptor);
      say(`Capture ${descriptors.length} sur ${samples}`);
      await new Promise((r) => setTimeout(r, 180));
    }
    done(3);
    return { ok: true, descriptors };
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}
