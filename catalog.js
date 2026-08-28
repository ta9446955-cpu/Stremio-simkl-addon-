const fetch = require('node-fetch');

const SIMKL_API_BASE = 'https://api.simkl.com';

// Maps our catalog ids to Simkl's type/status parameters
const CATALOG_MAP = {
  'simkl-movies-watched': { simklType: 'movies', status: 'completed' },
  'simkl-movies-plantowatch': { simklType: 'movies', status: 'plantowatch' },
  'simkl-shows-watched': { simklType: 'shows', status: 'completed' },
  'simkl-shows-plantowatch': { simklType: 'shows', status: 'plantowatch' }
};

module.exports = async function catalogHandler(type, catalogId, token, clientId) {
  const mapping = CATALOG_MAP[catalogId];
  if (!mapping) {
    throw new Error(`Unknown catalog id: ${catalogId}`);
  }

  const url = `${SIMKL_API_BASE}/sync/all-items/${mapping.simklType}/${mapping.status}?extended=full`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'simkl-api-key': clientId,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Simkl API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }

  const isMovie = mapping.simklType === 'movies';
  const itemKey = isMovie ? 'movie' : 'show';
  const stremioType = isMovie ? 'movie' : 'series';

  const metas = [];

  for (const entry of data) {
    const item = entry[itemKey];
    if (!item) continue;

    const imdbId = item.ids && item.ids.imdb;
    // Stremio needs an imdb id (tt...) to link to known catalogs/streams; skip items without one
    if (!imdbId) continue;

    metas.push({
      id: imdbId,
      type: stremioType,
      name: item.title || 'Untitled',
      poster: item.poster
        ? `https://simkl.in/posters/${item.poster}_m.jpg`
        : undefined,
      releaseInfo: item.year ? String(item.year) : undefined
    });
  }

  return metas;
};
