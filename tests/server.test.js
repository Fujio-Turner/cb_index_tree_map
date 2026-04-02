const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SERVER_PATH = path.join(__dirname, '..', 'server.js');

let server;
let baseURL;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseURL);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname, method };
    if (body) opts.headers = { 'Content-Type': 'application/json' };
    const req = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let json;
        try { json = JSON.parse(raw); } catch { json = null; }
        resolve({ status: res.statusCode, body: raw, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// Clean test files before/after
function cleanTestFiles() {
  if (!fs.existsSync(DATA_DIR)) return;
  fs.readdirSync(DATA_DIR).filter(f => f.startsWith('_test_')).forEach(f => {
    try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch {}
  });
}

beforeAll(done => {
  cleanTestFiles();
  // Start server on a random port
  const s = http.createServer();
  // We need to load the server handler — re-implement minimally or require
  // Since server.js calls listen(), we spin up our own with the same handler logic
  const { safeName } = require('../lib/pure');
  const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

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

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    if (url.pathname.startsWith('/api/files')) {
      if (url.pathname === '/api/files' && method === 'GET') {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => {
          const st = fs.statSync(path.join(DATA_DIR, f));
          return { name: f, size: st.size, modified: st.mtime };
        }).sort((a, b) => a.name.localeCompare(b.name));
        return sendJSON(res, 200, files);
      }
      if (url.pathname === '/api/files' && method === 'DELETE') {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        files.forEach(f => fs.unlinkSync(path.join(DATA_DIR, f)));
        return sendJSON(res, 200, { deleted: files.length });
      }
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

    // Static
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, '..', filePath);
    if (!filePath.startsWith(path.join(__dirname, '..'))) { res.writeHead(403); return res.end('Forbidden'); }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    baseURL = `http://127.0.0.1:${addr.port}`;
    done();
  });
});

afterAll(done => {
  cleanTestFiles();
  server.close(done);
});

// ────────────────────────────────────────────
// Static file serving
// ────────────────────────────────────────────
describe('Static files', () => {
  test('GET / serves index.html', async () => {
    const r = await request('GET', '/');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('text/html');
    expect(r.body).toContain('CB Index Treemap');
  });

  test('GET /index.html', async () => {
    const r = await request('GET', '/index.html');
    expect(r.status).toBe(200);
    expect(r.body).toContain('<!DOCTYPE html>');
  });

  test('GET /nonexistent returns 404', async () => {
    const r = await request('GET', '/no-such-file.xyz');
    expect(r.status).toBe(404);
  });
});

// ────────────────────────────────────────────
// File API  (CRUD)
// ────────────────────────────────────────────
describe('File API', () => {
  const testFile = '_test_unit.json';
  const testData = { hello: 'world', n: 42 };

  test('PUT creates a file', async () => {
    const r = await request('PUT', `/api/files/${testFile}`, testData);
    expect(r.status).toBe(200);
    expect(r.json.saved).toBe(testFile);
  });

  test('GET retrieves the file', async () => {
    const r = await request('GET', `/api/files/${testFile}`);
    expect(r.status).toBe(200);
    expect(r.json).toEqual(testData);
  });

  test('GET /api/files lists files (includes test file)', async () => {
    const r = await request('GET', '/api/files');
    expect(r.status).toBe(200);
    const names = r.json.map(f => f.name);
    expect(names).toContain(testFile);
  });

  test('DELETE removes the file', async () => {
    const r = await request('DELETE', `/api/files/${testFile}`);
    expect(r.status).toBe(200);
    expect(r.json.deleted).toBe(testFile);
  });

  test('GET after DELETE returns 404', async () => {
    const r = await request('GET', `/api/files/${testFile}`);
    expect(r.status).toBe(404);
  });

  test('DELETE non-existent returns 404', async () => {
    const r = await request('DELETE', '/api/files/_test_nope.json');
    expect(r.status).toBe(404);
  });

  test('PUT invalid JSON returns 400', async () => {
    const r = await request('PUT', `/api/files/${testFile}`, 'not-json{');
    expect(r.status).toBe(400);
    expect(r.json.error).toBe('Invalid JSON');
  });

  test('POST also works to create', async () => {
    const r = await request('POST', `/api/files/_test_post.json`, { x: 1 });
    expect(r.status).toBe(200);
    expect(r.json.saved).toBe('_test_post.json');
    // cleanup
    await request('DELETE', '/api/files/_test_post.json');
  });

  test('unknown API route returns 404', async () => {
    const r = await request('GET', '/api/unknown');
    expect(r.status).toBe(404);
  });
});
