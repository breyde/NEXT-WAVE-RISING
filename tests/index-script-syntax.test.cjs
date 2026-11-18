const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

test("inline application JavaScript in index.html parses", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match => !/\\bsrc\\s*=/.test(match[1]))
    .filter(match => !/\\btype\\s*=\\s*["'](?:application\\/ld\\+json|importmap)["']/i.test(match[1]))
    .map(match => match[2].trim())
    .filter(Boolean);
  if (!scripts.length) throw new Error("No inline application script found");
  scripts.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index + 1}.js` }));
});
