const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3001;
const STORE_VERSION = 1;

function getStorePath() {
  if (process.env.OPEN_CALENDAR_STORE_PATH) {
    return process.env.OPEN_CALENDAR_STORE_PATH;
  }

  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'com.open-calendar.app', 'events.json');
  }
  
  // Unix/macOS fallback
  const xdgData = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(xdgData, 'com.open-calendar.app', 'events.json');
}

const dbPath = getStorePath();

// Ensure the directory and file exist
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ version: STORE_VERSION, events: [] }, null, 2));
} else {
  // If file exists, check if it needs migration
  try {
    const rawData = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
      // Migrate old array database
      fs.writeFileSync(dbPath, JSON.stringify({ version: STORE_VERSION, events: parsed }, null, 2));
      console.log('Migrated old array format events.json to structured version 1 format.');
    }
  } catch (e) {
    // If corrupt, start fresh
    fs.writeFileSync(dbPath, JSON.stringify({ version: STORE_VERSION, events: [] }, null, 2));
  }
}

// This server is unauthenticated, so a wildcard CORS policy would let ANY
// website the user visits read or overwrite their calendar via localhost. Lock
// it to the dev app origin(s), and reject requests whose Host isn't loopback to
// defeat DNS-rebinding (where a malicious domain resolves to 127.0.0.1).
const ALLOWED_ORIGINS = new Set(
  (process.env.OPEN_CALENDAR_ALLOWED_ORIGIN
    ? process.env.OPEN_CALENDAR_ALLOWED_ORIGIN.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173']
  ).map((s) => s.trim()),
);

function hostIsLoopback(hostHeader) {
  if (!hostHeader) return true; // non-browser clients (curl) omit meaningful Host
  const host = hostHeader.split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

const server = http.createServer((req, res) => {
  // DNS-rebinding guard: only answer when addressed as a loopback host.
  if (!hostIsLoopback(req.headers.host)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Reflect CORS only for allowed origins; a disallowed cross-site request gets
  // no ACAO header, so the browser blocks it from reading the response.
  const origin = req.headers.origin;
  const originAllowed = !origin || ALLOWED_ORIGINS.has(origin);
  if (origin && originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Block cross-origin data requests from origins we don't recognise.
  if (origin && !originAllowed) {
    res.writeHead(403);
    res.end(JSON.stringify({ error: 'Origin not allowed' }));
    return;
  }

  if (req.url === '/events' && req.method === 'GET') {
    try {
      let data = fs.readFileSync(dbPath, 'utf8');
      
      // Secondary check to ensure it's still valid
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          data = JSON.stringify({ version: STORE_VERSION, events: parsed }, null, 2);
          fs.writeFileSync(dbPath, data, 'utf8');
        }
      } catch {
        data = JSON.stringify({ version: STORE_VERSION, events: [] }, null, 2);
        fs.writeFileSync(dbPath, data, 'utf8');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (req.url === '/events' && req.method === 'POST') {
    const MAX_BODY = 5 * 1024 * 1024; // 5 MB cap to prevent unbounded buffering
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      body += chunk.toString();
      if (body.length > MAX_BODY) {
        aborted = true;
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        // Validate JSON structure
        const parsed = JSON.parse(body);
        if (parsed.version === STORE_VERSION && Array.isArray(parsed.events)) {
          fs.writeFileSync(dbPath, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Unsupported schema or version' }));
        }
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON data' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Bind to loopback only — the store holds personal calendar data and accepts
// unauthenticated writes, so it must never be reachable from the LAN.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`Local Calendar Sync Server running at http://localhost:${PORT}`);
  console.log(`Database file in use: ${dbPath}`);
  console.log(`======================================================\n`);
});
