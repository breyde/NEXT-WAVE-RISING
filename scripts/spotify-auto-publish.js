const admin = require("firebase-admin");
const { spawnSync } = require("child_process"), path = require("path");
const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SERVICE_ACCOUNT) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT.");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SERVICE_ACCOUNT)) });
const db = admin.firestore();
(async () => {
  const snap = await db.collection("settings").doc("spotifyPlaylists").get(), cfg = snap.exists ? snap.data() : {};
  if (cfg.autoPublishEnabled !== true) { console.log("Publicación automática desactivada."); return; }
  console.log("Publicación automática activada. Esperando 5 minutos tras actualizar las copias temporales...");
  await new Promise(resolve => setTimeout(resolve, 300000));
  const result = spawnSync(process.execPath, [path.join(__dirname, "spotify-publish.js")], { env: { ...process.env, PUBLISH_TARGETS: "all" }, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
})().catch(error => { console.error(error); process.exit(1); });
