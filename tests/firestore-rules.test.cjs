const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require("@firebase/rules-unit-testing");
const {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch
} = require("firebase/firestore");

const PROJECT_ID = "demo-next-wave-rising";
const CURATOR_UID = "tNohkBzhmBML0E4eqmhw74hncUf2";
const EMAIL = "participant@example.test";
const TRACK_URL = "https://open.spotify.com/track/1234567890123456789012";
let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") }
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const anon = () => env.unauthenticatedContext().firestore();
const curator = () => env.authenticatedContext(CURATOR_UID).firestore();

test("public submissions contain no contact email; private contact is unreadable", async () => {
  const db = anon();
  await assertSucceeds(setDoc(doc(db, "submissions/song1"), {
    artist: "Test Artist", title: "Test Song", url: TRACK_URL,
    timestamp: 1, dateString: "18/11/2026", votes: 0
  }));
  await assertFails(setDoc(doc(db, "submissions/song2"), {
    artist: "Test Artist", title: "Test Song", url: TRACK_URL,
    timestamp: 1, email: EMAIL
  }));
  await assertSucceeds(setDoc(doc(db, "private_artist_contacts/song1"), {
    email: EMAIL, artist: "Test Artist", source: "weekly", updatedAt: 1
  }));
  await assertFails(setDoc(doc(db, "private_artist_contacts/bad"), {
    email: "not-an-email", artist: "Test Artist", source: "weekly", updatedAt: 1
  }));
  await assertFails(getDoc(doc(db, "private_artist_contacts/song1")));
  await assertSucceeds(getDoc(doc(curator(), "private_artist_contacts/song1")));
});

test("save declaration is private and tied atomically to a real submission", async () => {
  const db = anon();
  const batch = writeBatch(db);
  batch.set(doc(db, "submissions/review-song"), {
    artist: "Test Artist", title: "Test Song", url: TRACK_URL,
    timestamp: 1, dateString: "18/11/2026", votes: 0
  });
  batch.set(doc(db, "weekly_save_reviews/review1"), {
    submissionId: "review-song", email: EMAIL, artist: "Test Artist",
    title: "Test Song", edition: "Edición de prueba",
    status: "declared", createdAt: 1, updatedAt: 1
  });
  await assertSucceeds(batch.commit());
  await assertFails(getDoc(doc(db, "weekly_save_reviews/review1")));
  await assertSucceeds(getDoc(doc(curator(), "weekly_save_reviews/review1")));
  await assertFails(setDoc(doc(db, "weekly_save_reviews/orphan"), {
    submissionId: "missing", email: EMAIL, artist: "Test Artist",
    title: "Test Song", edition: "Edición de prueba",
    status: "declared", createdAt: 1, updatedAt: 1
  }));
  await assertFails(setDoc(doc(db, "weekly_save_reviews/false-status"), {
    submissionId: "review-song", email: EMAIL, artist: "Test Artist",
    title: "Test Song", edition: "Edición de prueba",
    status: "reviewed", createdAt: 1, updatedAt: 1
  }));
  await assertFails(setDoc(doc(db, "weekly_save_review_history/event1"), {
    reviewId: "review1", fromStatus: "declared", toStatus: "reviewed",
    changedAt: 2, changedBy: "participant"
  }));
  await assertSucceeds(setDoc(doc(curator(), "weekly_save_review_history/event1"), {
    reviewId: "review1", fromStatus: "declared", toStatus: "reviewed",
    changedAt: 2, changedBy: CURATOR_UID
  }));
});

test("weekly submitter email is create-once and private", async () => {
  const db = anon();
  await assertSucceeds(setDoc(doc(db, "weekly_submitters", EMAIL), {
    email: EMAIL, timestamp: 1
  }));
  await assertFails(setDoc(doc(db, "weekly_submitters", EMAIL), {
    email: EMAIL, timestamp: 2
  }));
  await assertFails(getDoc(doc(db, "weekly_submitters", EMAIL)));
  await assertSucceeds(getDoc(doc(curator(), "weekly_submitters", EMAIL)));
});

test("voter records are private and require three distinct tracks", async () => {
  const db = anon();
  await assertSucceeds(setDoc(doc(db, "voters_log", EMAIL), {
    email: EMAIL, votedTracks: ["a", "b", "c"], timestamp: 1
  }));
  await assertFails(getDoc(doc(db, "voters_log", EMAIL)));
  await assertSucceeds(getDoc(doc(curator(), "voters_log", EMAIL)));
  await assertFails(setDoc(doc(db, "voters_log", "second@example.test"), {
    email: "second@example.test", votedTracks: ["a", "a", "c"], timestamp: 1
  }));
});

test("public active-list updates may increment only the vote counter by one", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "active_list/song1"), {
      artist: "A", title: "B", url: TRACK_URL, timestamp: 1, votes: 2
    });
  });
  const db = anon();
  await assertSucceeds(updateDoc(doc(db, "active_list/song1"), { votes: 3 }));
  await assertFails(updateDoc(doc(db, "active_list/song1"), { votes: 5 }));
  await assertFails(updateDoc(doc(db, "active_list/song1"), { artist: "Changed" }));
});

test("artist country data is private and public counter only increments", async () => {
  const db = anon();
  const record = {
    email: EMAIL, artist: "Test Artist", firstPublishedDate: "18/11/2026",
    lastSubmissionDate: "18/11/2026", submissionsCount: 1,
    country: "ES", city: "Sevilla", flag: "🇪🇸"
  };
  await assertSucceeds(setDoc(doc(db, "artist_countries", "artist1"), record));
  await assertFails(getDoc(doc(db, "artist_countries", "artist1")));
  await assertSucceeds(updateDoc(doc(db, "artist_countries", "artist1"), {
    submissionsCount: 2, lastSubmissionDate: "19/11/2026"
  }));
  await assertFails(updateDoc(doc(db, "artist_countries", "artist1"), {
    submissionsCount: 99
  }));
});

test("contact messages and chat-user records are private", async () => {
  const db = anon();
  const contact = await addDoc(collection(db, "contact_messages"), {
    name: "Participant", email: EMAIL, message: "Hello", timestamp: 1
  });
  await assertFails(getDoc(doc(db, "contact_messages", contact.id)));
  const msg = await addDoc(collection(db, "chat_users"), {
    nick: "Participant", ip: "192.0.2.1", timestamp: 1
  });
  await assertFails(getDoc(doc(db, "chat_users", msg.id)));
  await assertSucceeds(getDoc(doc(curator(), "chat_users", msg.id)));
});

test("chat presence and messages remain public without exposing presence IP", async () => {
  const db = anon();
  await assertSucceeds(setDoc(doc(db, "chat_presence/session1"), {
    nick: "Participant", lastSeen: 1
  }));
  await assertSucceeds(getDoc(doc(db, "chat_presence/session1")));
  await assertFails(updateDoc(doc(db, "chat_presence/session1"), { ip: "192.0.2.1" }));
  await assertSucceeds(addDoc(collection(db, "chat_messages"), {
    nick: "Participant", text: "Hello", timestamp: 1
  }));
});

test("settings and backups are curator-only for writes and reads", async () => {
  await assertFails(setDoc(doc(anon(), "settings/test"), { value: 1 }));
  await assertSucceeds(setDoc(doc(curator(), "settings/test"), { value: 1 }));
  await assertFails(setDoc(doc(anon(), "backups/test"), { timestamp: 1 }));
  await assertFails(getDoc(doc(anon(), "backups/test")));
  await assertSucceeds(setDoc(doc(curator(), "backups/test"), { timestamp: 1 }));
});

test("public visitor counter can only increment by one", async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "stats/visitors"), { total: 4 });
  });
  await assertSucceeds(updateDoc(doc(anon(), "stats/visitors"), { total: 5 }));
  await assertFails(updateDoc(doc(anon(), "stats/visitors"), { total: 10 }));
});
