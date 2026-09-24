(function () {
  "use strict";

  const ALGORITHM_VERSION = 1;

  function normalizeName(name) {
    return String(name || "").trim().normalize("NFKC");
  }

  function buildPlayers(groups, groupSize) {
    const players = [];
    const duplicateBuckets = new Map();

    groups.forEach((group, groupIndex) => {
      group.members.forEach((member, memberIndex) => {
        const name = String(member.name || "").trim();
        if (!name) return;
        const player = {
          id: `p${players.length}`,
          index: players.length,
          name,
          displayName: name,
          normalizedName: normalizeName(name),
          gender: member.gender === "M" ? "M" : "F",
          groupIndex,
          groupLabel: String.fromCharCode(65 + groupIndex),
          memberIndex
        };
        players.push(player);
        const duplicateKey = `${player.normalizedName}\u0000${player.gender}`;
        if (!duplicateBuckets.has(duplicateKey)) duplicateBuckets.set(duplicateKey, []);
        duplicateBuckets.get(duplicateKey).push(player);
      });
    });

    duplicateBuckets.forEach((bucket) => {
      if (bucket.length < 2) return;
      if (groupSize === 1) {
        bucket.forEach((player, index) => {
          player.displayName = `${player.name}${index + 1}`;
        });
        return;
      }

      const sameGroupCounts = new Map();
      bucket.forEach((player) => {
        sameGroupCounts.set(player.groupIndex, (sameGroupCounts.get(player.groupIndex) || 0) + 1);
      });
      const sameGroupSeen = new Map();
      bucket.forEach((player) => {
        const countInGroup = sameGroupCounts.get(player.groupIndex);
        let suffix = player.groupLabel;
        if (countInGroup > 1) {
          const ordinal = (sameGroupSeen.get(player.groupIndex) || 0) + 1;
          sameGroupSeen.set(player.groupIndex, ordinal);
          suffix += ordinal;
        }
        player.displayName = `${player.name}${suffix}`;
      });
    });

    return players;
  }

  function findDuplicates(groups) {
    const entries = [];
    groups.forEach((group, groupIndex) => {
      group.members.forEach((member, memberIndex) => {
        const normalized = normalizeName(member.name);
        if (!normalized) return;
        entries.push({
          name: String(member.name).trim(),
          normalized,
          gender: member.gender === "M" ? "M" : "F",
          groupIndex,
          memberIndex,
          groupLabel: String.fromCharCode(65 + groupIndex)
        });
      });
    });

    const buckets = new Map();
    entries.forEach((entry) => {
      const key = `${entry.normalized}\u0000${entry.gender}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    });
    return Array.from(buckets.values()).filter((bucket) => bucket.length > 1);
  }

  function generateSchedule(input) {
    const groupSize = Number(input.settings.groupSize);
    const players = buildPlayers(input.groups, groupSize);
    if (players.length < 6) throw new Error("至少需要 6 位成員");

    const totalRounds = Math.round(Number(input.settings.duration) * 4);
    const placeholderRounds = input.settings.earlyPlay ? Math.min(3, totalRounds) : 0;
    const rounds = [];

    if (placeholderRounds >= 1) rounds.push(makePlaceholder(1, "先到先打", "先到先打"));
    if (placeholderRounds >= 2) rounds.push(makePlaceholder(2, "場1勝", "場1休"));
    if (placeholderRounds >= 3) rounds.push(makePlaceholder(3, "場1敗", "場1勝"));

    const stats = createStats(players);
    const groupedCandidates = groupSize > 1 ? createIntactCandidates(players) : [];

    for (let index = placeholderRounds; index < totalRounds; index += 1) {
      const flexibleCandidates = createFlexibleCandidates(players, stats, index);
      const candidates = groupedCandidates.length
        ? groupedCandidates.concat(flexibleCandidates)
        : flexibleCandidates;
      const best = chooseBestCandidate(candidates, players, stats, input.settings, groupSize);
      const round = {
        number: index + 1,
        type: "scheduled",
        front: best.front.slice(),
        back: best.back.slice(),
        splitGroups: getSplitGroups(best, players, groupSize)
      };
      rounds.push(round);
      applyCandidate(best, stats);
    }

    return {
      algorithmVersion: ALGORITHM_VERSION,
      createdAt: new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(input.settings)),
      groups: JSON.parse(JSON.stringify(input.groups)),
      players,
      rounds
    };
  }

  function makePlaceholder(number, frontLabel, backLabel) {
    return {
      number,
      type: "placeholder",
      frontLabel,
      backLabel,
      front: [],
      back: [],
      splitGroups: []
    };
  }

  function createStats(players) {
    const perPlayer = {};
    players.forEach((player) => {
      perPlayer[player.id] = {
        appearances: 0,
        front: 0,
        back: 0,
        playStreak: 0,
        restStreak: 0
      };
    });
    return {
      perPlayer,
      teammates: new Map(),
      opponents: new Map()
    };
  }

  function createIntactCandidates(players) {
    const grouped = groupPlayers(players);
    const total = players.length;
    const candidates = [];

    if (total < 12) {
      const frontTarget = Math.floor(total / 2);
      const backTarget = total - frontTarget;
      const subsets = enumerateSubsetsBySize(grouped, frontTarget);
      subsets.forEach((frontGroups, candidateIndex) => {
        const chosen = new Set(frontGroups);
        const backGroups = grouped.filter((group) => !chosen.has(group));
        if (countMembers(backGroups) !== backTarget) return;
        candidates.push(makeCandidate(flattenGroups(frontGroups), flattenGroups(backGroups), `g-all-${candidateIndex}`));
      });
      return candidates;
    }

    const teamSubsets = enumerateSubsetsBySize(grouped, 6);
    let candidateIndex = 0;
    for (let frontIndex = 0; frontIndex < teamSubsets.length; frontIndex += 1) {
      const frontGroups = teamSubsets[frontIndex];
      const frontSet = new Set(frontGroups);
      for (let backIndex = 0; backIndex < teamSubsets.length; backIndex += 1) {
        const backGroups = teamSubsets[backIndex];
        if (backGroups.some((group) => frontSet.has(group))) continue;
        candidates.push(makeCandidate(
          flattenGroups(frontGroups),
          flattenGroups(backGroups),
          `g-${candidateIndex}`
        ));
        candidateIndex += 1;
      }
    }
    return limitCandidates(candidates, 6000);
  }

  function limitCandidates(candidates, maximum) {
    if (candidates.length <= maximum) return candidates;
    const sampled = [];
    for (let index = 0; index < maximum; index += 1) {
      sampled.push(candidates[Math.floor(index * candidates.length / maximum)]);
    }
    return sampled;
  }

  function groupPlayers(players) {
    const map = new Map();
    players.forEach((player) => {
      if (!map.has(player.groupIndex)) map.set(player.groupIndex, []);
      map.get(player.groupIndex).push(player.id);
    });
    return Array.from(map.entries()).map(([groupIndex, ids]) => ({ groupIndex, ids }));
  }

  function enumerateSubsetsBySize(groups, targetSize) {
    const matches = [];
    const current = [];

    function visit(index, size) {
      if (size === targetSize) {
        matches.push(current.slice());
        return;
      }
      if (size > targetSize || index >= groups.length) return;
      for (let cursor = index; cursor < groups.length; cursor += 1) {
        current.push(groups[cursor]);
        visit(cursor + 1, size + groups[cursor].ids.length);
        current.pop();
      }
    }

    visit(0, 0);
    return matches;
  }

  function countMembers(groups) {
    return groups.reduce((sum, group) => sum + group.ids.length, 0);
  }

  function flattenGroups(groups) {
    return groups.flatMap((group) => group.ids);
  }

  function makeCandidate(front, back, key) {
    return { front, back, key };
  }

  function createFlexibleCandidates(players, stats, roundIndex) {
    const total = players.length;
    const frontTarget = total < 12 ? Math.floor(total / 2) : 6;
    const backTarget = total < 12 ? total - frontTarget : 6;
    const activeTarget = frontTarget + backTarget;
    const candidates = [];
    const seen = new Set();

    for (let salt = 0; salt < 128; salt += 1) {
      let selected;
      if (total <= activeTarget) {
        selected = players.slice();
      } else {
        selected = players.slice().sort((left, right) => {
          const leftStats = stats.perPlayer[left.id];
          const rightStats = stats.perPlayer[right.id];
          return (
            leftStats.appearances - rightStats.appearances ||
            rightStats.restStreak - leftStats.restStreak ||
            stableHash(left.index, salt + roundIndex * 131) - stableHash(right.index, salt + roundIndex * 131) ||
            left.index - right.index
          );
        }).slice(0, activeTarget);
      }

      const candidate = assignTeams(selected, frontTarget, backTarget, stats, salt + roundIndex * 193);
      const signature = `${candidate.front.slice().sort().join(",")}|${candidate.back.slice().sort().join(",")}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidate.key = `f-${roundIndex}-${salt}`;
      candidates.push(candidate);

      const reversedSignature = `${candidate.back.slice().sort().join(",")}|${candidate.front.slice().sort().join(",")}`;
      if (!seen.has(reversedSignature)) {
        seen.add(reversedSignature);
        candidates.push(makeCandidate(candidate.back.slice(), candidate.front.slice(), `fr-${roundIndex}-${salt}`));
      }
    }

    return candidates;
  }

  function assignTeams(selected, frontTarget, backTarget, stats, salt) {
    const byGroup = new Map();
    selected.forEach((player) => {
      if (!byGroup.has(player.groupIndex)) byGroup.set(player.groupIndex, []);
      byGroup.get(player.groupIndex).push(player);
    });
    const chunks = Array.from(byGroup.values()).sort((left, right) => (
      stableHash(left[0].groupIndex, salt) - stableHash(right[0].groupIndex, salt) ||
      right.length - left.length ||
      left[0].groupIndex - right[0].groupIndex
    ));

    const front = [];
    const back = [];
    chunks.forEach((chunk) => {
      const fitsFront = front.length + chunk.length <= frontTarget;
      const fitsBack = back.length + chunk.length <= backTarget;
      if (fitsFront || fitsBack) {
        const side = chooseChunkSide(chunk, front, back, frontTarget, backTarget, stats, fitsFront, fitsBack, salt);
        side.push(...chunk.map((player) => player.id));
        return;
      }

      chunk.slice().sort((left, right) => (
        stableHash(left.index, salt + 17) - stableHash(right.index, salt + 17) || left.index - right.index
      )).forEach((player) => {
        if (front.length >= frontTarget) back.push(player.id);
        else if (back.length >= backTarget) front.push(player.id);
        else if (front.length / frontTarget <= back.length / backTarget) front.push(player.id);
        else back.push(player.id);
      });
    });

    return makeCandidate(front, back, "");
  }

  function chooseChunkSide(chunk, front, back, frontTarget, backTarget, stats, fitsFront, fitsBack, salt) {
    if (!fitsFront) return back;
    if (!fitsBack) return front;
    const frontFill = (front.length + chunk.length) / frontTarget;
    const backFill = (back.length + chunk.length) / backTarget;
    if (Math.abs(frontFill - backFill) > 0.001) return frontFill < backFill ? front : back;

    const frontNeed = chunk.reduce((sum, player) => sum + stats.perPlayer[player.id].front - stats.perPlayer[player.id].back, 0);
    if (frontNeed !== 0) return frontNeed > 0 ? back : front;
    return stableHash(chunk[0].index, salt) % 2 === 0 ? front : back;
  }

  function stableHash(value, salt) {
    let hash = ((value + 1) * 2654435761 + (salt + 1) * 1013904223) >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507) >>> 0;
    hash ^= hash >>> 13;
    return hash >>> 0;
  }

  function chooseBestCandidate(candidates, players, stats, settings, groupSize) {
    if (!candidates.length) throw new Error("找不到符合人數限制的分隊組合");
    let best = candidates[0];
    let bestScore = scoreCandidate(best, players, stats, settings, groupSize);

    for (let index = 1; index < candidates.length; index += 1) {
      const score = scoreCandidate(candidates[index], players, stats, settings, groupSize);
      if (compareScores(score, bestScore) < 0) {
        best = candidates[index];
        bestScore = score;
      }
    }
    return best;
  }

  function scoreCandidate(candidate, players, stats, settings, groupSize) {
    const front = new Set(candidate.front);
    const back = new Set(candidate.back);
    const active = new Set([...candidate.front, ...candidate.back]);
    const appearanceValues = [];
    let appearanceSquares = 0;
    let courtImbalance = 0;
    let streakPenalty = 0;

    players.forEach((player) => {
      const current = stats.perPlayer[player.id];
      const willPlay = active.has(player.id);
      const appearances = current.appearances + (willPlay ? 1 : 0);
      appearanceValues.push(appearances);
      appearanceSquares += appearances * appearances;

      const projectedFront = current.front + (front.has(player.id) ? 1 : 0);
      const projectedBack = current.back + (back.has(player.id) ? 1 : 0);
      courtImbalance += Math.abs(projectedFront - projectedBack);

      if (willPlay) {
        const projectedStreak = current.playStreak + 1;
        if (projectedStreak > 3) streakPenalty += (projectedStreak - 3) * (projectedStreak - 3) * 6;
      } else {
        const projectedRest = current.restStreak + 1;
        if (projectedRest > 1) streakPenalty += (projectedRest - 1) * (projectedRest - 1) * 4;
      }
    });

    const appearanceRange = Math.max(...appearanceValues) - Math.min(...appearanceValues);
    const frontMen = candidate.front.reduce((sum, id) => sum + (playerById(players, id).gender === "M" ? 1 : 0), 0);
    const backMen = candidate.back.reduce((sum, id) => sum + (playerById(players, id).gender === "M" ? 1 : 0), 0);
    const genderDifference = settings.spreadMen ? Math.abs(frontMen - backMen) : 0;
    const teammateRepeat = pairRepeatScore(candidate.front, stats.teammates) + pairRepeatScore(candidate.back, stats.teammates);
    const opponentRepeat = crossRepeatScore(candidate.front, candidate.back, stats.opponents);
    const splitCount = getSplitGroups(candidate, players, groupSize).length;

    return [
      appearanceRange,
      appearanceSquares,
      splitCount,
      genderDifference,
      streakPenalty,
      courtImbalance,
      teammateRepeat,
      opponentRepeat,
      candidate.key
    ];
  }

  function compareScores(left, right) {
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  }

  function playerById(players, id) {
    const index = Number(id.slice(1));
    return players[index];
  }

  function pairRepeatScore(ids, history) {
    let score = 0;
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        score += history.get(pairKey(ids[left], ids[right])) || 0;
      }
    }
    return score;
  }

  function crossRepeatScore(front, back, history) {
    let score = 0;
    front.forEach((frontId) => {
      back.forEach((backId) => {
        score += history.get(pairKey(frontId, backId)) || 0;
      });
    });
    return score;
  }

  function pairKey(left, right) {
    return left < right ? `${left}|${right}` : `${right}|${left}`;
  }

  function getSplitGroups(candidate, players, groupSize) {
    if (groupSize === 1) return [];
    const front = new Set(candidate.front);
    const back = new Set(candidate.back);
    const groupStates = new Map();
    players.forEach((player) => {
      if (!groupStates.has(player.groupIndex)) groupStates.set(player.groupIndex, new Set());
      const state = front.has(player.id) ? "front" : back.has(player.id) ? "back" : "rest";
      groupStates.get(player.groupIndex).add(state);
    });
    return Array.from(groupStates.entries())
      .filter((entry) => entry[1].size > 1)
      .map((entry) => entry[0]);
  }

  function applyCandidate(candidate, stats) {
    const front = new Set(candidate.front);
    const back = new Set(candidate.back);
    const active = new Set([...candidate.front, ...candidate.back]);

    Object.keys(stats.perPlayer).forEach((id) => {
      const item = stats.perPlayer[id];
      if (active.has(id)) {
        item.appearances += 1;
        item.playStreak += 1;
        item.restStreak = 0;
        if (front.has(id)) item.front += 1;
        if (back.has(id)) item.back += 1;
      } else {
        item.playStreak = 0;
        item.restStreak += 1;
      }
    });

    recordPairs(candidate.front, stats.teammates);
    recordPairs(candidate.back, stats.teammates);
    candidate.front.forEach((frontId) => {
      candidate.back.forEach((backId) => incrementMap(stats.opponents, pairKey(frontId, backId)));
    });
  }

  function recordPairs(ids, history) {
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        incrementMap(history, pairKey(ids[left], ids[right]));
      }
    }
  }

  function incrementMap(map, key) {
    map.set(key, (map.get(key) || 0) + 1);
  }

  window.VolyScheduler = {
    ALGORITHM_VERSION,
    normalizeName,
    findDuplicates,
    generateSchedule
  };
})();
