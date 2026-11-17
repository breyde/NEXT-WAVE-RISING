const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const TZ = "Europe/Madrid";
const now = new Date();
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
const localDate = parts.year + "-" + parts.month + "-" + parts.day;
const hour = Number(parts.hour), minute = Number(parts.minute);
const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
const weekKey = isoWeekKey(localDate);

function isoWeekKey(dateText) {
  const d = new Date(dateText + "T12:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d - first) / 604800000);
  return d.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function madridString() {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, dateStyle: "short", timeStyle: "medium" }).format(new Date());
}
async function readCollection(name, ordered = true) {
  const ref = db.collection(name);
  const snap = ordered ? await ref.orderBy("timestamp", "asc").get() : await ref.get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function writeInBatches(operations) {
  for (let i = 0; i < operations.length; i += 400) {
    const batch = db.batch();
    for (const op of operations.slice(i, i + 400)) {
      if (op.type === "set") batch.set(op.ref, op.data, { merge: false });
      else if (op.type === "delete") batch.delete(op.ref);
      else batch.update(op.ref, op.data);
    }
    await batch.commit();
  }
}
async function addSystemMessage(message, type) {
  await db.collection("contact_messages").add({
    name: "Next Wave Rising", email: "", message,
    timestamp: Date.now(), dateString: madridString(),
    read: false, system: true, type
  });
}
async function closeVoting(stateRef) {
  await db.collection("settings").doc("activeEdition").set({
    votingActive: false, votingClosedAt: madridString(), automationWeek: weekKey
  }, { merge: true });
  await stateRef.set({ closedWeek: weekKey, closedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await addSystemMessage("Las votaciones de la edición semanal se han cerrado automáticamente. La rotación y copia de seguridad están programadas para el cierre del jueves.", "voting_closed");
  console.log("Votación cerrada para " + weekKey);
}
async function makeVerifiedBackup(backupRef) {
  const [activeTracks, weeklyTracks, monthlyTracks, annualTracks, countriesList] = await Promise.all([
    readCollection("active_list"), readCollection("submissions"),
    readCollection("monthly_list"), readCollection("annual_list"),
    readCollection("artist_countries", false)
  ]);
  const settingsSnap = await db.collection("settings").doc("activeEdition").get();
  const cfg = settingsSnap.exists ? settingsSnap.data() : {};
  const payload = {
    scope: "all", edition: "Copia automática de sistema - " + weekKey,
    dateString: madridString(), dateOnly: localDate, timestamp: Date.now(),
    activeCount: activeTracks.length, weeklyCount: weeklyTracks.length,
    monthlyCount: monthlyTracks.length, annualCount: annualTracks.length,
    countriesCount: countriesList.length,
    activeTracks, weeklyTracks, monthlyTracks, annualTracks, countriesList,
    automationWeek: weekKey, editionName: cfg.edition || ""
  };
  await backupRef.set(payload, { merge: false });
  const verify = await backupRef.get();
  if (!verify.exists) throw new Error("No se pudo verificar la copia de seguridad.");
  const saved = verify.data();
  for (const key of ["activeTracks", "weeklyTracks", "monthlyTracks", "annualTracks", "countriesList"]) {
    if (!Array.isArray(saved[key]) || saved[key].length !== payload[key].length) {
      throw new Error("La verificación del backup ha fallado en " + key + ". No se rotarán las listas.");
    }
  }
  return saved;
}
async function rotateLists(backupRef, stateRef) {
  const backup = await makeVerifiedBackupIfNeeded(backupRef);
  const active = backup.activeTracks || [];
  const weekly = backup.weeklyTracks || [];
  const monthly = backup.monthlyTracks || [];
  const annual = backup.annualTracks || [];
  const winner = active.length ? active.reduce((best, item) =>
    (Number(item.votes || 0) > Number(best.votes || 0) ? item : best), active[0]) : null;

  const monthlyResult = monthly.map(item => ({ id: item.id, data: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id")) }));
  for (const item of active) {
    monthlyResult.push({
      id: "auto_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + item.id,
      data: { artist: item.artist || "", title: item.title || "", url: item.url || "", timestamp: Number(item.timestamp || Date.now()) }
    });
  }
  monthlyResult.sort((a, b) => Number(a.data.timestamp || 0) - Number(b.data.timestamp || 0));
  const annualResult = annual.map(item => ({ id: item.id, data: Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id")) }));
  while (monthlyResult.length > 4) {
    const old = monthlyResult.shift();
    annualResult.push({
      id: "auto_archive_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + old.id,
      data: { artist: old.data.artist || "", title: old.data.title || "", url: old.data.url || "", timestamp: Date.now() }
    });
  }
  const ops = [];
  const monthlyRef = db.collection("monthly_list");
  const annualRef = db.collection("annual_list");
  const oldMonthlyIds = new Set(monthly.map(x => x.id));
  const newMonthlyIds = new Set(monthlyResult.map(x => x.id));
  for (const item of monthlyResult) ops.push({ type: "set", ref: monthlyRef.doc(item.id), data: item.data });
  for (const id of oldMonthlyIds) if (!newMonthlyIds.has(id)) ops.push({ type: "delete", ref: monthlyRef.doc(id) });
  for (const item of annualResult) {
    if (String(item.id).startsWith("auto_archive_")) ops.push({ type: "set", ref: annualRef.doc(item.id), data: item.data });
  }

  const activeRef = db.collection("active_list");
  const submissionsRef = db.collection("submissions");
  for (const item of weekly) {
    const id = "auto_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + item.id;
    ops.push({ type: "set", ref: activeRef.doc(id), data: {
      artist: item.artist || "", title: item.title || "", url: item.url || "",
      email: item.email || "", timestamp: Number(item.timestamp || Date.now()),
      dateString: item.dateString || madridString(), votes: 0, voters: []
    }});
  }
  for (const item of active) ops.push({ type: "delete", ref: activeRef.doc(item.id) });
  for (const item of weekly) ops.push({ type: "delete", ref: submissionsRef.doc(item.id) });

  if (winner && Number(winner.votes || 0) > 0) {
    ops.push({ type: "set", ref: submissionsRef.doc("winner_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_")), data: {
      artist: winner.artist || "", title: winner.title || "", url: winner.url || "",
      email: winner.email || "", timestamp: Date.now(), dateString: madridString(), votes: 0, voters: []
    }});
  }

  const yearEnd = localDate.slice(5) === "12-31";
  if (yearEnd) {
    for (const item of monthlyResult) {
      ops.push({ type: "set", ref: annualRef.doc("yearend_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_") + "_" + item.id), data: item.data });
      ops.push({ type: "delete", ref: monthlyRef.doc(item.id) });
    }
  }
  await writeInBatches(ops);

  const voterSnap = await db.collection("voters_log").get();
  if (!voterSnap.empty) await writeInBatches(voterSnap.docs.map(doc => ({ type: "delete", ref: doc.ref })));
  await db.collection("settings").doc("activeEdition").set({
    votingActive: true,
    ...(winner ? { trackUrl: winner.url || "" } : {}),
    lastAutomaticRotation: weekKey,
    votingReopenedAt: madridString()
  }, { merge: true });
  await stateRef.set({ rotatedWeek: weekKey, rotatedAt: admin.firestore.FieldValue.serverTimestamp(), status: "completed" }, { merge: true });
  await addSystemMessage(
    "Rotación automática completada (" + weekKey + "). Backup verificado: " +
    (backup.activeCount || 0) + " temas activos, " + (backup.weeklyCount || 0) +
    " en cola semanal. La votación se ha reabierto. " +
    (winner ? "Tema destacado: " + winner.artist + " — " + winner.title + "." : "No había campeón con votos."),
    "rotation_completed"
  );
  console.log("Rotación completada: " + weekKey);
}
async function makeVerifiedBackupIfNeeded(backupRef) {
  const existing = await backupRef.get();
  if (existing.exists) {
    const data = existing.data();
    for (const key of ["activeTracks", "weeklyTracks", "monthlyTracks", "annualTracks", "countriesList"]) {
      if (!Array.isArray(data[key])) throw new Error("Existe un backup incompleto; se detiene la rotación por seguridad.");
    }
    return data;
  }
  return makeVerifiedBackup(backupRef);
}

(async () => {
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  if (manual) {
    console.log("Ejecución manual: comprobación de conexión y permisos; no modifica listas.");
    await db.collection("settings").doc("activeEdition").get();
    const testRef = db.collection("_automation_healthchecks").doc("manual_permission_test");
    try {
      await testRef.set({ checkedAt: Date.now(), weekKey });
      const testSnap = await testRef.get();
      if (!testSnap.exists || testSnap.data().weekKey !== weekKey) {
        throw new Error("La comprobación de escritura/lectura en Firebase no se pudo verificar.");
      }
      console.log("Firebase permite escribir y leer correctamente.");
    } finally {
      await testRef.delete().catch(() => {});
    }
    console.log("Permisos de Firebase comprobados. Documento temporal eliminado. Semana " + weekKey + ".");
    return;
  }
  const stateRef = db.collection("settings").doc("automationState");
  const backupRef = db.collection("backups").doc("auto_system_" + weekKey.replace(/[^a-zA-Z0-9]/g, "_"));
  const stateSnap = await stateRef.get();
  const state = stateSnap.exists ? stateSnap.data() : {};
  if (weekday === "Thu" && hour === 22 && minute < 15 && state.closedWeek !== weekKey) {
    await closeVoting(stateRef);
    return;
  }
  const rotationWindow = (weekday === "Thu" && hour === 23 && minute >= 59) ||
    (weekday === "Fri" && hour === 0 && minute < 15);
  if (rotationWindow && state.rotatedWeek !== weekKey) {
    if (state.closedWeek !== weekKey) {
      console.log("Rotación aplazada: la votación no figura cerrada para " + weekKey + ".");
      return;
    }
    await rotateLists(backupRef, stateRef);
    return;
  }
  console.log("Sin tarea pendiente. " + weekday + " " + parts.hour + ":" + parts.minute + " " + TZ + " | " + weekKey);
})().catch(async error => {
  console.error(error);
  try {
    await db.collection("contact_messages").add({
      name: "Next Wave Rising", email: "",
      message: "ERROR en la automatización (" + weekKey + "): " + String(error.message || error) + ". Las listas no deben darse por rotadas; revisa GitHub Actions.",
      timestamp: Date.now(), dateString: madridString(), read: false, system: true, type: "automation_error"
    });
  } catch (_) {}
  process.exit(1);
});
