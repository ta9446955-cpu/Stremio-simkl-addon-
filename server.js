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

if (!SIMKL_CLIENT_ID || !SIMKL_CLIENT_SECRET) {
  console.warn('WARNING: SIMKL_CLIENT_ID / SIMKL_CLIENT_SECRET are not set. Set them in Render environment variables.');
}

const SIMKL_API_BASE = 'https://api.simkl.com';

// In-memory store: userToken -> simkl access token
// NOTE: this resets whenever Render's free tier spins the server down.
const userTokens = {};

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
      userTokens[userId] = data.access_token;
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

// --- Placeholder catalog route (filled in next file) ---
app.get('/:userId/catalog/:type/:id.json', async (req, res) => {
  const { userId, type, id } = req.params;
  const token = userTokens[userId];

  if (!token) {
    return res.status(401).json({ error: 'Unknown or expired user. Please reconnect.' });
  }

  const catalogHandler = require('./catalog');
  try {
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
