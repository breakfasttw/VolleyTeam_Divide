"use strict";

const assert = require("node:assert/strict");

const memory = new Map();
global.window = global;
global.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};

require("../storage.js");

const storage = global.VolyStorage;
const state = {
  version: 1,
  settings: {
    eventName: "週六測試",
    duration: 3,
    earlyPlay: true,
    spreadMen: true,
    groupSize: 2
  },
  groups: [
    { members: [{ name: "小明", gender: "M" }, { name: "小美", gender: "F" }] },
    { members: [{ name: "", gender: "F" }, { name: "", gender: "F" }] }
  ],
  result: null,
  resultStale: false
};

assert.equal(storage.save(state), true);
assert.deepEqual(storage.load(), state);

const exported = storage.serializeExport(state);
const imported = storage.parseImport(exported);
assert.deepEqual(imported.settings, state.settings);
assert.deepEqual(imported.groups, state.groups);
assert.equal(Object.hasOwn(JSON.parse(exported), "result"), false, "匯出資料不應包含分隊結果");

assert.throws(() => storage.parseImport('{"format":"unknown"}'));
assert.throws(() => storage.parseImport("not-json"));

assert.equal(storage.clear(), true);
assert.equal(storage.load(), null);

console.log("storage tests: ok");
