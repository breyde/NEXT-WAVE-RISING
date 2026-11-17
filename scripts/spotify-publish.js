const admin = require("firebase-admin");
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID, REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN, SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const TARGETS = String(process.env.PUBLISH_TARGETS || "all").split(",").map(x => x.trim()).filter(Boolean);
const REAL = { weekly: "0MAX34xiCSEGAIiQ9VwpQF", monthly: "7udGxOgE8PFBJJkNYh5Kj8", annual: "42amKpyPKH1hSZ4VgUiuEg" };
if (!CLIENT_ID || !REFRESH_TOKEN || !SERVICE_ACCOUNT) throw new Error("Faltan variables de Spotify o Firebase.");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SERVICE_ACCOUNT)) });
const db = admin.firestore();
async function request(url, options = {}) {
  const response = await fetch(url, options), raw = await response.text(); let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
  if (!response.ok) throw new Error("Spotify API " + response.status + ": " + (data.error?.message || data.error_description || raw || response.statusText));
  return data;
}
async function accessToken() {
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID });
  const data = await request("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!data.access_token) throw new Error("Spotify no devolvió access token.");
  if (data.refresh_token && data.refresh_token !== REFRESH_TOKEN) throw new Error("Spotify rotó el refresh token; actualiza SPOTIFY_REFRESH_TOKEN en GitHub.");
  return data.access_token;
}
async function readPlaylist(token, id) {
  const uris = []; let offset = 0;
  while (true) {
    const page = await request("https://api.spotify.com/v1/playlists/" + id + "/items?limit=100&offset=" + offset, { headers: { Authorization: "Bearer " + token } });
    for (const entry of page.items || []) { const item = entry.item || entry.track || entry; if (item && item.uri && item.type === "track" && !item.is_local) uris.push(item.uri); }
    if (!page.next || !page.items || !page.items.length) break;
    offset += page.items.length;
  }
  return uris;
}
async function replace(token, id, uris) {
  const headers = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  await request("https://api.spotify.com/v1/playlists/" + id + "/items", { method: "PUT", headers, body: JSON.stringify({ uris: uris.slice(0, 100) }) });
  for (let i = 100; i < uris.length; i += 100) await request("https://api.spotify.com/v1/playlists/" + id + "/items", { method: "POST", headers, body: JSON.stringify({ uris: uris.slice(i, i + 100) }) });
}
(async () => {
  const snap = await db.collection("settings").doc("spotifyPlaylists").get(), cfg = snap.exists ? snap.data() : {};
  const defs = { weekly: { temp: cfg.weeklyPlaylistId, label: "semanal" }, monthly: { temp: cfg.monthlyPlaylistId, label: "mensual" }, annual: { temp: cfg.annualPlaylistId, label: "anual" } };
  const chosen = TARGETS.includes("all") ? Object.keys(defs) : TARGETS;
  if (!chosen.length || chosen.some(k => !defs[k])) throw new Error("Selección de listas no válida.");
  const token = await accessToken(), results = [];
  for (const key of chosen) {
    const source = defs[key]; if (!source.temp) throw new Error("No existe la playlist temporal " + source.label + ".");
    const uris = await readPlaylist(token, source.temp);
    if (!uris.length) { console.log("Se omite " + source.label + ": la copia temporal está vacía; la playlist pública no se modifica."); results.push(key + ": omitida (vacía)"); continue; }
    await replace(token, REAL[key], uris); console.log(source.label + ": " + uris.length + " canciones publicadas."); results.push(key + ": " + uris.length + " canciones");
  }
  await db.collection("settings").doc("spotifyPlaylists").set({ lastPublicSyncAt: Date.now(), lastPublicSyncStatus: "success", lastPublicSyncError: "", lastPublicSyncSummary: results.join(" · ") }, { merge: true });
  console.log("Publicación completada: " + results.join(" | "));
})().catch(async error => {
  console.error(error);
  try { await db.collection("settings").doc("spotifyPlaylists").set({ lastPublicSyncAt: Date.now(), lastPublicSyncStatus: "error", lastPublicSyncError: String(error.message || error).slice(0, 500) }, { merge: true }); } catch (_) {}
  process.exit(1);
});
