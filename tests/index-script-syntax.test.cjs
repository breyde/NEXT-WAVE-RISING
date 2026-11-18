const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

test("inline application JavaScript in index.html parses", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const scripts = [];
  let cursor = 0;
  while (true) {
    const open = html.indexOf("<script", cursor);
    if (open < 0) break;
    const tagEnd = html.indexOf(">", open);
    const close = html.indexOf("</script>", tagEnd);
    if (tagEnd < 0 || close < 0) throw new Error("Malformed script tag in index.html");
    const attributes = html.slice(open + 7, tagEnd);
    if (!attributes.includes("src=") && !attributes.includes("type=")) {
      const source = html.slice(tagEnd + 1, close).trim();
      if (source) scripts.push(source);
    }
    cursor = close + 9;
  }
  if (!scripts.length) throw new Error("No inline application script found");
  scripts.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index + 1}.js` }));
});
