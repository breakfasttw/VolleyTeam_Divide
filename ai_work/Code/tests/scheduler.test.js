"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../scheduler.js");

const scheduler = global.VolyScheduler;

function member(name, gender) {
  return { name, gender: gender || "F" };
}

function groupsFromSizes(sizes) {
  let playerIndex = 0;
  return sizes.map((size, groupIndex) => ({
    members: Array.from({ length: size }, () => {
      const current = playerIndex;
      playerIndex += 1;
      return member(`成員${String(current + 1).padStart(2, "0")}`, (current + groupIndex) % 3 === 0 ? "M" : "F");
    })
  }));
}

function settings(groupSize, earlyPlay) {
  return {
    eventName: "測試場",
    duration: 3,
    earlyPlay,
    spreadMen: true,
    groupSize
  };
}

function scheduledRounds(result) {
  return result.rounds.filter((round) => round.type === "scheduled");
}

function appearanceRange(result) {
  const counts = new Map(result.players.map((player) => [player.id, 0]));
  scheduledRounds(result).forEach((round) => {
    [...round.front, ...round.back].forEach((id) => counts.set(id, counts.get(id) + 1));
  });
  const values = Array.from(counts.values());
  return Math.max(...values) - Math.min(...values);
}

(function testGroupedScheduleAndPlaceholders() {
  const input = { settings: settings(2, true), groups: groupsFromSizes(Array(9).fill(2)) };
  const first = scheduler.generateSchedule(input);
  const second = scheduler.generateSchedule(input);
  assert.equal(first.rounds.length, 12);
  assert.deepEqual(first.rounds.slice(0, 3).map((round) => round.type), ["placeholder", "placeholder", "placeholder"]);
  assert.ok(scheduledRounds(first).every((round) => round.front.length === 6 && round.back.length === 6));
  assert.deepEqual(first.rounds, second.rounds, "相同輸入必須產生相同賽程");
  assert.ok(appearanceRange(first) <= 1, "上場次數差距應不超過一場");
})();

(function testSplitFallbackForUnevenGroups() {
  const input = { settings: settings(3, false), groups: groupsFromSizes([3, 3, 2]) };
  const result = scheduler.generateSchedule(input);
  assert.ok(scheduledRounds(result).every((round) => round.front.length === 4 && round.back.length === 4));
  assert.ok(scheduledRounds(result).some((round) => round.splitGroups.length > 0), "無法整組均分時應允許拆組");
})();

(function testSoloSchedule() {
  const input = { settings: settings(1, false), groups: groupsFromSizes(Array(17).fill(1)) };
  const result = scheduler.generateSchedule(input);
  assert.equal(result.rounds.length, 12);
  assert.ok(result.rounds.every((round) => round.front.length === 6 && round.back.length === 6));
  assert.ok(appearanceRange(result) <= 1);
})();

(function testFullWidthDuplicateNormalizationAndCaseSensitivity() {
  const duplicateGroups = [
    { members: [member("ＡＢＣ", "F"), member("其他", "F")] },
    { members: [member("ABC", "F"), member("abc", "F")] }
  ];
  const duplicates = scheduler.findDuplicates(duplicateGroups);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].length, 2);
})();

(function testIncompleteGroupEventuallyPlays() {
  const input = { settings: settings(3, false), groups: groupsFromSizes([3, 3, 3, 3, 1]) };
  const result = scheduler.generateSchedule(input);
  assert.ok(appearanceRange(result) <= 1, "不完整小組成員也不應長期被排除");
})();

(function testSupportedPlayerCountsAndModes() {
  for (const groupSize of [1, 2, 3]) {
    for (let count = 6; count <= 24; count += 1) {
      let cursor = 0;
      const groups = Array.from({ length: Math.ceil(count / groupSize) }, () => ({
        members: Array.from({ length: groupSize }, () => {
          const index = cursor;
          cursor += 1;
          return index < count ? member(`P${index}`, index % 4 === 0 ? "M" : "F") : member("");
        })
      }));
      const result = scheduler.generateSchedule({
        settings: { ...settings(groupSize, false), duration: 1 },
        groups
      });
      result.rounds.forEach((round) => {
        const activeCount = round.front.length + round.back.length;
        assert.equal(activeCount, Math.min(count, 12));
        assert.ok(round.front.length <= 6 && round.back.length <= 6);
        assert.ok(Math.abs(round.front.length - round.back.length) <= 1);
      });
    }
  }
})();

console.log("scheduler tests: ok");
