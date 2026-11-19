const admin = require("firebase-admin");

const SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const ACTION = String(process.env.MANUAL_LIST_ACTION || "none").toLowerCase();
if (!SERVICE_ACCOUNT) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT.");
if (!["active_to_monthly", "queue_to_active", "featured_to_queue"].includes(ACTION)) {
  throw new Error("Acción de rotación manual no válida: " + ACTION);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SERVICE_ACCOUNT)) });
const db = admin.firestore();
const now = Date.now();
const suffix = new Date(now).toISOString().replace(/[-:.TZ]/g, "");

async function snapshotCollections(names) {
  const snapshots = await Promise.all(names.map(name => db.collection(name).get()));
  const data = {};
  names.forEach((name, i) => {
    data[name] = snapshots[i].docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
  return data;
}
async function saveVerifiedBackup(data) {
  const ref = db.collection("backups").doc("manual_rotation_" + suffix);
  const payload = {
    scope: "manual_list_rotation",
    action: ACTION,
    timestamp: now,
    dateString: new Date(now).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
    collections: data
  };
  await ref.set(payload, { merge: false });
  const saved = await ref.get();
  if (!saved.exists) throw new Error("No se pudo verificar la copia de seguridad.");
  const stored = saved.data().collections || {};
  for (const [name, records] of Object.entries(data)) {
    if (!Array.isArray(stored[name]) || stored[name].length !== records.length) {
      throw new Error("La copia de seguridad no coincide en " + name + ". No se modificarán las listas.");
    }
  }
  console.log("Copia de seguridad verificada: " + ref.id);
}
async function commitOperations(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === "set") batch.set(op.ref, op.data, { merge: false });
      else batch.delete(op.ref);
    }
    await batch.commit();
  }
}
async function activeToMonthly() {
  const data = await snapshotCollections(["active_list", "monthly_list", "annual_list"]);
  const active = data.active_list;
  if (!active.length) throw new Error("La lista activa está vacía. No hay temas que pasar a mensual.");
  await saveVerifiedBackup(data);

  const monthly = data.monthly_list.map(item => ({
    id: item.id,
    data: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"))
  }));
  for (const item of active) {
    monthly.push({
      id: "manual_" + suffix + "_" + item.id,
      data: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"))
    });
  }
  monthly.sort((a, b) => Number(a.data.timestamp || 0) - Number(b.data.timestamp || 0));
  const annual = data.annual_list.map(item => ({
    id: item.id,
    data: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"))
  }));
  while (monthly.length > 4) {
    const oldest = monthly.shift();
    annual.push({
      id: "manual_archive_" + suffix + "_" + oldest.id,
      data: Object.fromEntries(Object.entries(oldest.data).filter(([key]) => key !== "id"))
    });
  }

  const ops = [];
  const monthlyRef = db.collection("monthly_list");
  const annualRef = db.collection("annual_list");
  const oldMonthlyIds = new Set(data.monthly_list.map(item => item.id));
  const newMonthlyIds = new Set(monthly.map(item => item.id));
  for (const item of monthly) ops.push({ type: "set", ref: monthlyRef.doc(item.id), data: item.data });
  for (const id of oldMonthlyIds) if (!newMonthlyIds.has(id)) ops.push({ type: "delete", ref: monthlyRef.doc(id) });
  for (const item of annual) {
    if (String(item.id).startsWith("manual_archive_")) {
      ops.push({ type: "set", ref: annualRef.doc(item.id), data: item.data });
    }
  }
  for (const item of active) ops.push({ type: "delete", ref: db.collection("active_list").doc(item.id) });
  await commitOperations(ops);

  const [activeCheck, monthlyCheck] = await Promise.all([
    db.collection("active_list").get(), db.collection("monthly_list").get()
  ]);
  if (!activeCheck.empty || monthlyCheck.size !== monthly.length) {
    throw new Error("La verificación posterior no coincide. Conserva la copia de seguridad manual y revisa Firebase.");
  }
  console.log("Correcto: " + active.length + " temas movidos de active_list a monthly_list. active_list queda vacía.");
}

async function featuredToQueue() {
  const editionSnap = await db.collection("settings").doc("activeEdition").get();
  const edition = editionSnap.exists ? editionSnap.data() : {};
  const url = String(edition.trackUrl || "").trim().split("?")[0];
  const match = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/);
  if (!match) throw new Error("No hay un enlace válido guardado en Tema Destacado.");
  const trackId = match[1];
  const [queueSnap, publicSnap] = await Promise.all([
    db.collection("submissions").get(), db.collection("weekly_public").get()
  ]);
  if ([...queueSnap.docs, ...publicSnap.docs].some(d => String(d.data().url || "").split("?")[0].includes(trackId))) {
    throw new Error("El Tema Destacado ya está en la cola semanal. No se ha duplicado.");
  }
  const backupRef = db.collection("backups").doc("featured_queue_" + suffix);
  await backupRef.set({
    scope: "featured_track_to_weekly_queue", action: ACTION, timestamp: now,
    collections: {
      submissions: queueSnap.docs.map(d => ({id:d.id,...d.data()})),
      weekly_public: publicSnap.docs.map(d => ({id:d.id,...d.data()})),
      activeEdition: edition
    }
  });
  const backup = await backupRef.get();
  if (!backup.exists || backup.data().collections.submissions.length !== queueSnap.size ||
      backup.data().collections.weekly_public.length !== publicSnap.size) {
    throw new Error("No se pudo verificar la copia de seguridad. No se añadirá el tema.");
  }
  const data = {
    artist: String(edition.featuredArtist || edition.trackArtist || "Tema destacado").trim(),
    title: String(edition.featuredTitle || edition.trackTitle || "Tema destacado").trim(),
    url, email: "", timestamp: now,
    dateString: new Date(now).toLocaleString("es-ES", {timeZone:"Europe/Madrid"}),
    votes: 0, voters: [], source: "featured_track"
  };
  const id = "featured_" + trackId;
  const batch = db.batch();
  batch.set(db.collection("submissions").doc(id), data);
  batch.set(db.collection("weekly_public").doc(id), {
    artist:data.artist,title:data.title,url,timestamp:now,source:"featured_track"
  });
  await batch.commit();
  const [q,p] = await Promise.all([
    db.collection("submissions").doc(id).get(),
    db.collection("weekly_public").doc(id).get()
  ]);
  if (!q.exists || !p.exists) throw new Error("No se pudo verificar la incorporación.");
  console.log("Tema destacado añadido a la cola semanal interna. Spotify no se ha modificado.");
}

async function queueToActive() {
  const data = await snapshotCollections(["submissions", "active_list"]);
  const queue = data.submissions;
  const active = data.active_list;
  if (!queue.length) throw new Error("La cola semanal está vacía. No hay temas que pasar a activa.");
  if (active.length) throw new Error("La lista activa todavía contiene " + active.length + " temas. Primero pásala a mensual para evitar sobrescribir canciones.");
  await saveVerifiedBackup(data);

  const ops = [];
  const activeRef = db.collection("active_list");
  for (const item of queue) {
    const record = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"));
    ops.push({ type: "set", ref: activeRef.doc(item.id), data: {
      ...record,
      timestamp: Number(record.timestamp || now),
      dateString: record.dateString || new Date(now).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
      votes: 0,
      voters: []
    }});
    ops.push({ type: "delete", ref: db.collection("submissions").doc(item.id) });
  }
  await commitOperations(ops);

  const [activeCheck, queueCheck] = await Promise.all([
    db.collection("active_list").get(), db.collection("submissions").get()
  ]);
  if (activeCheck.size !== queue.length || !queueCheck.empty) {
    throw new Error("La verificación posterior no coincide. Conserva la copia de seguridad manual y revisa Firebase.");
  }
  await db.collection("settings").doc("activeEdition").set({
    votingActive: true,
    votingReopenedAt: new Date(now).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }),
    lastManualRotationAt: now
  }, { merge: true });
  console.log("Correcto: " + queue.length + " temas movidos de submissions a active_list. Los votos se han reiniciado.");
}

(async () => {
  if (ACTION === "active_to_monthly") await activeToMonthly();
  else if (ACTION === "queue_to_active") await queueToActive();
  else await featuredToQueue();
  await db.collection("settings").doc("manualListRotation").set({
    lastAction: ACTION, lastRunAt: now, lastStatus: "success"
  }, { merge: true });
})().catch(async error => {
  console.error(error);
  try {
    await db.collection("settings").doc("manualListRotation").set({
      lastAction: ACTION, lastRunAt: now, lastStatus: "error",
      lastError: String(error.message || error).slice(0, 500)
    }, { merge: true });
  } catch (_) {}
  process.exit(1);
});
