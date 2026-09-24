"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

for (const scriptName of ["main.js", "interactions.js"]) {
  const source = fs.readFileSync(path.join(root, scriptName), "utf8");
  for (const match of source.matchAll(/getElementById\("([^"]+)"\)/g)) {
    assert.ok(html.includes(`id="${match[1]}"`), `${scriptName} 引用了不存在的 #${match[1]}`);
  }
}

for (const assetName of ["style.css", "storage.js", "scheduler.js", "interactions.js", "main.js"]) {
  assert.ok(fs.existsSync(path.join(root, assetName)), `缺少 ${assetName}`);
  assert.ok(html.includes(assetName), `index.html 未載入 ${assetName}`);
}

console.log("DOM reference tests: ok");
