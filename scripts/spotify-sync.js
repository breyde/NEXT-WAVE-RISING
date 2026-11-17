const admin = require("firebase-admin");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!CLIENT_ID || !REFRESH_TOKEN || !SERVICE_ACCOUNT) {
  throw new Error("Faltan SPOTIFY_CLIENT_ID, SPOTIFY_REFRESH_TOKEN o FIREBASE_SERVICE_ACCOUNT.");
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SERVICE_ACCOUNT)) });
const db = admin.firestore();

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!response.ok) {
    const detail = data.error?.message || data.error_description || text || response.statusText;
    throw new Error("Spotify API " + response.status + ": " + detail);
  }
  return data;
}

async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: CLIENT_ID
  });
  const data = await request("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!data.access_token) throw new Error("Spotify no devolvió un access token.");
  if (data.refresh_token && data.refresh_token !== REFRESH_TOKEN) {
    throw new Error("Spotify ha rotado el refresh token. Hay que actualizar SPOTIFY_REFRESH_TOKEN en GitHub antes de continuar.");
  }
  return data.access_token;
}

function spotifyTrackUri(value) {
  const raw = String(value || "").trim();
  const uriMatch = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uriMatch) return "spotify:track:" + uriMatch[1];
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (!/(^|\\.)open\\.spotify\\.com$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\\/(?:intl-[a-z]{2}\\/)?track\\/([A-Za-z0-9]{22})\\/?$/i);
  return match ? "spotify:track:" + match[1] : null;
}

async function getPlaylistConfig() {
  const ref = db.collection("settings").doc("spotifyPlaylists");
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : {} };
}

async function ensurePlaylist(token, config, key, name, description) {
  if (config[key]) return config[key];
  const playlist = await request("https://api.spotify.com/v1/me/playlists", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, description, public: false, collaborative: false })
  });
  if (!playlist.id || playlist.public !== false) {
    throw new Error("Spotify no confirmó la creación privada de " + name + ".");
  }
  config[key] = playlist.id;
  await config._ref.set({ [key]: playlist.id, updatedAt: Date.now() }, { merge: true });
  console.log("Playlist privada preparada: " + name);
  return playlist.id;
}

async function readTracks(collectionName) {
  const snap = await db.collection(collectionName).orderBy("timestamp", "asc").get();
  const uris = [];
  const seen = new Set();
  let skipped = 0;
  for (const doc of snap.docs) {
    const uri = spotifyTrackUri(doc.data().url);
    if (!uri) { skipped++; continue; }
    if (!seen.has(uri)) { seen.add(uri); uris.push(uri); }
  }
  return { uris, skipped, sourceCount: snap.size };
}

async function replacePlaylist(token, playlistId, uris) {
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json"
  };
  await request("https://api.spotify.com/v1/playlists/" + playlistId + "/items", {
    method: "PUT", headers, body: JSON.stringify({ uris: uris.slice(0, 100) })
  });
  for (let i = 100; i < uris.length; i += 100) {
    await request("https://api.spotify.com/v1/playlists/" + playlistId + "/items", {
      method: "POST", headers,
      body: JSON.stringify({ uris: uris.slice(i, i + 100) })
    });
  }
}

(async () => {
  const token = await getAccessToken();
  const saved = await getPlaylistConfig();
  const config = { ...saved.data, _ref: saved.ref };
  const definitions = [
    { key: "weeklyPlaylistId", name: "semanal_temp", source: "active_list", description: "Copia privada automática de la lista semanal de Next Wave Rising." },
    { key: "monthlyPlaylistId", name: "mensual_temp", source: "monthly_list", description: "Copia privada automática de la lista mensual de Next Wave Rising." },
    { key: "annualPlaylistId", name: "anual_temp", source: "annual_list", description: "Copia privada automática de la lista anual de Next Wave Rising." }
  ];

  for (const item of definitions) {
    const playlistId = await ensurePlaylist(token, config, item.key, item.name, item.description);
    const tracks = await readTracks(item.source);
    await replacePlaylist(token, playlistId, tracks.uris);
    console.log(item.name + ": " + tracks.uris.length + " canciones sincronizadas; " +
      tracks.skipped + " enlaces no válidos omitidos de " + tracks.sourceCount + " registros.");
  }
  await saved.ref.set({ lastSyncAt: Date.now(), lastSyncStatus: "success" }, { merge: true });
  console.log("Sincronización de las tres playlists privadas completada.");
})().catch(async error => {
  console.error(error);
  try {
    await db.collection("settings").doc("spotifyPlaylists").set({
      lastSyncAt: Date.now(), lastSyncStatus: "error", lastSyncError: String(error.message || error).slice(0, 500)
    }, { merge: true });
  } catch (_) {}
  process.exit(1);
});
