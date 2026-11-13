// Contrôle d'une photo de pièce d'identité : traces de retouche dans le fichier,
// zones recompressées différemment (analyse du niveau d'erreur), visage présent.
// Ce sont des indices pour un contrôleur humain, pas une preuve.
import { facesInImage, distance } from './face.js';

const EDITORS = /(Adobe Photoshop|Photoshop|GIMP|Canva|Pixelmator|Snapseed|PicsArt|Lightroom|Paint\.NET|Affinity Photo|Photopea)/i;
const DOC_MATCH = 0.6;

// Décode le fichier en image et le pose sur un canevas (côté le plus long limité à 1600 px).
async function loadImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

async function editorTrace(file) {
  const head = await file.slice(0, 400000).arrayBuffer();
  const text = new TextDecoder('latin1').decode(head);
  return text.match(EDITORS)?.[1] ?? null;
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Analyse du niveau d'erreur : on recompresse l'image et on cherche les zones qui réagissent autrement que le reste. */
async function errorLevels(img) {
  const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;

  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  const again = await createImageBitmap(blob);
  const c2 = document.createElement('canvas');
  c2.width = w;
  c2.height = h;
  const ctx2 = c2.getContext('2d', { willReadFrequently: true });
  ctx2.drawImage(again, 0, 0);
  const b = ctx2.getImageData(0, 0, w, h).data;

  const B = 16;
  const bw = Math.floor(w / B);
  const bh = Math.floor(h / B);
  const err = new Float32Array(bw * bh);
  const tex = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let e = 0;
      let t = 0;
      for (let y = by * B; y < by * B + B; y++) {
        for (let x = bx * B; x < bx * B + B; x++) {
          const i = (y * w + x) * 4;
          e += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (x + 1 < w) t += Math.abs(a[i + 1] - a[i + 5]);
        }
      }
      err[by * bw + bx] = e / (B * B * 3);
      tex[by * bw + bx] = t / (B * B);
    }
  }

  // Une zone détaillée réagit naturellement plus : on retire cet effet par régression.
  const n = err.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += tex[i]; sy += err[i]; sxx += tex[i] * tex[i]; sxy += tex[i] * err[i];
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  const res = Array.from(err, (e, i) => e - (slope * tex[i] + intercept));
  const med = median(res);
  const sigma = 1.4826 * median(res.map((r) => Math.abs(r - med))) || 0.05;
  const z = res.map((r) => (r - med) / sigma);

  // Plus grand groupe de blocs voisins anormaux.
  const hot = z.map((v) => v > 7);
  const seen = new Uint8Array(n);
  let largest = 0;
  for (let i = 0; i < n; i++) {
    if (!hot[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop();
      size++;
      const x = k % bw;
      const y = Math.floor(k / bw);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const j = ny * bw + nx;
        if (hot[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    largest = Math.max(largest, size);
  }
  const share = hot.filter(Boolean).length / n;

  // Carte : l'image assombrie, les blocs anormaux en rouge.
  ctx.fillStyle = 'rgba(14,19,48,0.55)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    if (z[i] <= 4) continue;
    ctx.fillStyle = `rgba(232,58,44,${Math.min(0.85, (z[i] - 4) / 10 + 0.25)})`;
    ctx.fillRect((i % bw) * B, Math.floor(i / bw) * B, B, B);
  }
  return { map: c, share, largest, suspicious: largest >= 4 && share < 0.25 };
}

/**
 * Analyse un fichier image de pièce d'identité.
 * Renvoie { verdict: 'ok'|'warn'|'bad', findings, map, descriptor }.
 */
export async function analyzeDocument(file) {
  const findings = [];
  const add = (level, title, detail) => findings.push({ level, title, detail });
  const img = await loadImage(file);

  const editor = await editorTrace(file);
  if (editor) add('bad', 'Fichier passé par un logiciel de retouche', `Le fichier porte la signature de ${editor}.`);
  else add('ok', 'Aucune trace de logiciel de retouche', "Les informations internes du fichier ne mentionnent pas d'éditeur d'image.");

  const isJpeg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const ela = await errorLevels(img);
  if (!isJpeg) add('warn', 'Analyse de compression limitée', "Ce contrôle est fiable surtout sur les photos JPEG. Demandez la photo d'origine.");
  else if (ela.suspicious) add('bad', 'Zone recompressée différemment du reste', `Un groupe de ${ela.largest} blocs voisins réagit anormalement (en rouge sur la carte). C'est typique d'un collage ou d'un texte modifié.`);
  else add('ok', 'Compression homogène', "Aucune zone de l'image ne se distingue nettement du reste.");

  const faces = await facesInImage(img);
  let descriptor = null;
  if (faces.length === 0) add('bad', 'Aucun visage sur le document', "Une pièce d'identité doit porter une photo lisible.");
  else {
    const main = faces.reduce((a, b) => (a.detection.box.area > b.detection.box.area ? a : b));
    descriptor = main.descriptor;
    // Une pièce a souvent une petite photo fantôme : jusqu'à deux visages de la même personne, c'est normal.
    const strangers = faces.filter((f) => f !== main && distance(f.descriptor, main.descriptor) > 0.6);
    if (strangers.length) add('warn', 'Plusieurs personnes différentes sur le document', `${strangers.length + 1} visages distincts ont été trouvés.`);
    else add('ok', 'Photo du titulaire trouvée', 'Le visage du document est lisible.');
  }

  const verdict = findings.some((f) => f.level === 'bad') ? 'bad' : findings.some((f) => f.level === 'warn') ? 'warn' : 'ok';
  return { verdict, findings, map: ela.map, descriptor };
}

/** Compare la photo du document au visage capturé en direct. */
export function matchDocumentToFace(docDescriptor, liveDescriptors) {
  const best = Math.min(...liveDescriptors.map((d) => distance(docDescriptor, d)));
  return { same: best < DOC_MATCH, distance: best };
}

export const VERDICTS = {
  ok: 'Aucun indice de falsification',
  warn: 'À vérifier par un agent',
  bad: 'Document suspect',
};
