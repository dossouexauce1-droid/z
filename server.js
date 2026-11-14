// Serveur local de la démo Z. Lancer avec : node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.apk': 'application/vnd.android.package-archive',
};

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Introuvable');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`Z est ouvert sur http://localhost:${PORT}`);
  });
