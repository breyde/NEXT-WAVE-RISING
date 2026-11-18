const { test } = require("node:test");
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");

test("transition rules compile and shield legacy private collections", async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-next-wave-rising-transition",
    firestore: {
      rules: fs.readFileSync("docs/firestore.rules.transition.proposed", "utf8")
    }
  });
  try {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "submissions/legacy-weekly")));
    await assertFails(getDoc(doc(db, "active_list/legacy-active")));
    await assertFails(getDoc(doc(db, "voters_log/legacy@example.test")));
    await assertFails(getDoc(doc(db, "chat_users/legacy-session")));
    await assertFails(getDoc(doc(db, "chat_presence/legacy-session")));

    // El frontend antiguo puede seguir escribiendo presencia temporal con IP
    // durante la migración, pero el público no puede leer esos documentos.
    await assertSucceeds(setDoc(doc(db, "chat_presence/new-session"), {
      nick: "Participant", lastSeen: 1, ip: "192.0.2.1"
    }));
    await assertFails(getDoc(doc(db, "chat_presence/new-session")));
  } finally {
    await env.cleanup();
  }
});
