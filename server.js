const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 7000;

// Simkl app credentials — set these in Render's Environment Variables tab,
// never hardcode them here since this repo is public
const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;
const SIMKL_CLIENT_SECRET = process.env.SIMKL_CLIENT_SECRET;
const SIMKL_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

// Upstash Redis REST API — used to persist tokens across restarts/redeploys
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!SIMKL_CLIENT_ID || !SIMKL_CLIENT_SECRET) {
  console.warn('WARNING: SIMKL_CLIENT_ID / SIMKL_CLIENT_SECRET are not set. Set them in Render environment variables.');
}
if (!UPSTASH_URL || !UPSTASH_TOKEN) {
  console.warn('WARNING: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. Logins will not survive a restart.');
}

const SIMKL_API_BASE = 'https://api.simkl.com';

// --- Persistent token store (Upstash Redis REST API) ---
async function saveToken(userId, token) {
  await fetch(`${UPSTASH_URL}/set/${userId}/${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
}

async function getToken(userId) {
  const res = await fetch(`${UPSTASH_URL}/get/${userId}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result || null;
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Simple id generator for our own per-user manifest token
function generateUserId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// --- Landing page ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Step 1: Start device/PIN auth flow ---
// Simkl's OAuth device flow: request a code, show it to the user with a link to simkl.com/pin
app.get('/auth/start', async (req, res) => {
  try {
    const response = await fetch(`${SIMKL_API_BASE}/oauth/pin?client_id=${SIMKL_CLIENT_ID}&redirect=${encodeURIComponent(SIMKL_REDIRECT_URI)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Failed to get code from Simkl', details: errText });
    }

    const data = await response.json();
    // data: { result, device_code, user_code, verification_url, expires_in, interval }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error starting auth', details: err.message });
  }
});

// --- Step 2: Poll for token after user enters the code ---
app.get('/auth/poll/:userCode', async (req, res) => {
  const { userCode } = req.params;
  try {
    const response = await fetch(`${SIMKL_API_BASE}/oauth/pin/${userCode}?client_id=${SIMKL_CLIENT_ID}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    // Simkl returns result: "OK" with access_token once the user approves
    if (data.result === 'OK' && data.access_token) {
      const userId = generateUserId();
      await saveToken(userId, data.access_token);
      return res.json({ status: 'connected', userId });
    }

    // Still waiting on the user
    return res.json({ status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Server error polling auth', details: err.message });
  }
});

// --- Manifest (per-user, token in the URL) ---
app.get('/:userId/manifest.json', (req, res) => {
  const { userId } = req.params;
  const manifest = require('./manifest')(userId);
  res.setHeader('Content-Type', 'application/json');
  res.json(manifest);
});

// --- Catalog route ---
app.get('/:userId/catalog/:type/:id.json', async (req, res) => {
  const { userId, type, id } = req.params;

  try {
    const token = await getToken(userId);

    if (!token) {
      return res.status(401).json({ error: 'Unknown or expired user. Please reconnect.' });
    }

    const catalogHandler = require('./catalog');
    const metas = await catalogHandler(type, id, token, SIMKL_CLIENT_ID);
    res.setHeader('Content-Type', 'application/json');
    res.json({ metas });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load catalog', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Simkl Stremio addon listening on port ${PORT}`);
});
