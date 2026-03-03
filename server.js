const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function safeName(raw) {
  let name = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/\.{2,}/g, '.');
  if (!name.endsWith('.json')) name += '.json';
  return name;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  // ---- API ----
  if (url.pathname.startsWith('/api/files')) {

    // List all saved files
    if (url.pathname === '/api/files' && method === 'GET') {
      const files = fs.readdirSync(DATA_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const st = fs.statSync(path.join(DATA_DIR, f));
          return { name: f, size: st.size, modified: st.mtime };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return sendJSON(res, 200, files);
    }

    // Delete ALL files
    if (url.pathname === '/api/files' && method === 'DELETE') {
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
      files.forEach(f => fs.unlinkSync(path.join(DATA_DIR, f)));
      return sendJSON(res, 200, { deleted: files.length });
    }

    // Single-file operations  /api/files/:name
    const match = url.pathname.match(/^\/api\/files\/(.+)$/);
    if (match) {
      const filename = safeName(match[1]);
      const filepath = path.join(DATA_DIR, filename);

      if (method === 'GET') {
        if (!fs.existsSync(filepath)) return sendJSON(res, 404, { error: 'Not found' });
        const content = fs.readFileSync(filepath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(content);
      }

      if (method === 'PUT' || method === 'POST') {
        const body = await readBody(req);
        // Validate it's parseable JSON
        try { JSON.parse(body); } catch { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
        fs.writeFileSync(filepath, body);
        return sendJSON(res, 200, { saved: filename, size: Buffer.byteLength(body) });
      }

      if (method === 'DELETE') {
        if (!fs.existsSync(filepath)) return sendJSON(res, 404, { error: 'Not found' });
        fs.unlinkSync(filepath);
        return sendJSON(res, 200, { deleted: filename });
      }
    }

    return sendJSON(res, 404, { error: 'Unknown API route' });
  }

  // ---- Static files ----
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);

  if (!filePath.startsWith(__dirname)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { res.writeHead(404); return res.end('Not found'); }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🗺️  CB Index Treemap running at http://localhost:${PORT}`);
});
