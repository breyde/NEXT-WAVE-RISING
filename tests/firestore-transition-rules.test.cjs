const { test } = require("node:test");
const fs = require("node:fs");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");

test("transition Firestore rules compile in the emulator", async () => {
  const env = await initializeTestEnvironment({
    projectId: "demo-next-wave-rising-transition",
    firestore: {
      rules: fs.readFileSync("docs/firestore.rules.transition.proposed", "utf8")
    }
  });
  await env.cleanup();
});
