(function () {
    "use strict";

    const storage = window.VolyStorage;
    const scheduler = window.VolyScheduler;
    const ui = window.VolyUI;
    const GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const SAVE_DELAY = 180;
    let saveTimer = null;
    let selectedRoundNumber = null;

    const elements = {
        setupTab: document.getElementById("setup-tab"),
        resultTab: document.getElementById("result-tab"),
        resultStaleDot: document.getElementById("result-stale-dot"),
        resetButton: document.getElementById("reset-button"),
        brandHome: document.getElementById("brand-home"),
        setupView: document.getElementById("setup-view"),
        resultView: document.getElementById("result-view"),
        duration: document.getElementById("duration-input"),
        durationMinus: document.getElementById("duration-minus"),
        durationPlus: document.getElementById("duration-plus"),
        eventName: document.getElementById("event-name-input"),
        earlyPlay: document.getElementById("early-play-input"),
        spreadMen: document.getElementById("spread-men-input"),
        groupSizeOptions: document.getElementById("group-size-options"),
        participantSummary: document.getElementById("roster-heading"),
        roster: document.getElementById("roster-container"),
        addUnit: document.getElementById("add-unit-button"),
        start: document.getElementById("start-button"),
        importButton: document.getElementById("import-button"),
        copyButton: document.getElementById("copy-button"),
        staleNotice: document.getElementById("stale-result-notice"),
        resultSummary: document.getElementById("result-summary"),
        resultEventName: document.getElementById("result-event-name"),
        resultContent: document.getElementById("result-content"),
        splitNotation: document.getElementById("split-notation"),
    };

    let state = loadInitialState();

    init();

    function init() {
        bindStaticEvents();
        syncControls();
        renderRoster();
        updateSummary();
        updateResultAvailability();
        if (state.result) {
            try {
                renderResult();
            } catch (_error) {
                state.result = null;
                state.resultStale = false;
                storage.save(state);
                updateResultAvailability();
            }
        }
    }

    function loadInitialState() {
        const saved = storage.load();
        if (saved) {
            saved.resultStale = Boolean(saved.resultStale);
            return saved;
        }
        return createDefaultState();
    }

    function createDefaultState() {
        return {
            version: storage.SCHEMA_VERSION,
            settings: {
                eventName: "",
                duration: 3,
                earlyPlay: true,
                spreadMen: true,
                groupSize: 2,
            },
            groups: createBlankGroups(2),
            result: null,
            resultStale: false,
        };
    }

    function createBlankGroups(groupSize, minimumSlots) {
        const slots = Math.min(
            24,
            Math.max(0, minimumSlots == null ? 18 : minimumSlots),
        );
        const groupCount = Math.ceil(slots / groupSize);
        return Array.from({ length: groupCount }, () => ({
            members: Array.from({ length: groupSize }, createBlankMember),
        }));
    }

    function createBlankMember() {
        return { name: "", gender: "F" };
    }

    function bindStaticEvents() {
        elements.setupTab.addEventListener("click", () => switchView("setup"));
        elements.resultTab.addEventListener("click", () =>
            switchView("result"),
        );
        elements.brandHome.addEventListener("click", (event) => {
            event.preventDefault();
            switchView("setup");
        });
        elements.resetButton.addEventListener("click", confirmReset);
        elements.durationMinus.addEventListener("click", () =>
            changeDuration(-0.5),
        );
        elements.durationPlus.addEventListener("click", () =>
            changeDuration(0.5),
        );
        elements.duration.addEventListener("change", commitDuration);
        elements.eventName.addEventListener("input", () => {
            elements.eventName.value = truncateGraphemes(
                elements.eventName.value,
                20,
            );
            state.settings.eventName = elements.eventName.value;
            markResultStale();
        });
        elements.eventName.addEventListener("blur", () => {
            state.settings.eventName = state.settings.eventName.trim();
            elements.eventName.value = state.settings.eventName;
            scheduleSave();
        });
        elements.earlyPlay.addEventListener("change", () => {
            state.settings.earlyPlay = elements.earlyPlay.checked;
            markResultStale();
        });
        elements.spreadMen.addEventListener("change", () => {
            state.settings.spreadMen = elements.spreadMen.checked;
            markResultStale();
        });
        elements.groupSizeOptions.addEventListener(
            "click",
            handleGroupSizeClick,
        );
        elements.roster.addEventListener("input", handleRosterInput);
        elements.roster.addEventListener("change", handleRosterChange);
        elements.roster.addEventListener("focusout", handleRosterBlur);
        elements.roster.addEventListener("click", handleRosterClick);
        elements.addUnit.addEventListener("click", addUnit);
        elements.start.addEventListener("click", startScheduling);
        elements.copyButton.addEventListener("click", copyCurrentInfo);
        elements.importButton.addEventListener("click", beginImport);
    }

    function syncControls() {
        elements.duration.value = Number(state.settings.duration).toFixed(1);
        elements.eventName.value = state.settings.eventName;
        elements.earlyPlay.checked = state.settings.earlyPlay;
        elements.spreadMen.checked = state.settings.spreadMen;
        elements.groupSizeOptions
            .querySelectorAll("button")
            .forEach((button) => {
                const selected =
                    Number(button.dataset.groupSize) ===
                    Number(state.settings.groupSize);
                button.classList.toggle("is-selected", selected);
                button.setAttribute("aria-checked", String(selected));
            });
    }

    function switchView(view) {
        const showResult = view === "result" && Boolean(state.result);
        elements.setupView.hidden = showResult;
        elements.resultView.hidden = !showResult;
        elements.setupTab.classList.toggle("is-active", !showResult);
        elements.resultTab.classList.toggle("is-active", showResult);
        elements.setupTab.setAttribute("aria-selected", String(!showResult));
        elements.resultTab.setAttribute("aria-selected", String(showResult));
        if (showResult) renderResult();
        window.scrollTo({ top: 0, behavior: "auto" });
    }

    function changeDuration(change) {
        const next = clampDuration(Number(state.settings.duration) + change);
        if (next === state.settings.duration) return;
        state.settings.duration = next;
        elements.duration.value = next.toFixed(1);
        markResultStale();
    }

    function commitDuration() {
        const parsed = Number(elements.duration.value);
        const next = Number.isFinite(parsed)
            ? clampDuration(parsed)
            : state.settings.duration;
        elements.duration.value = next.toFixed(1);
        if (next !== state.settings.duration) {
            state.settings.duration = next;
            markResultStale();
        }
    }

    function clampDuration(value) {
        return Math.min(6, Math.max(1, Math.round(value * 2) / 2));
    }

    async function handleGroupSizeClick(event) {
        const button = event.target.closest("button[data-group-size]");
        if (!button) return;
        const nextSize = Number(button.dataset.groupSize);
        if (nextSize === state.settings.groupSize) return;

        if (hasAnyNames()) {
            const choice = await ui.showModal({
                // icon: "↻",
                title: "重新分組",
                message: "是否要保留成員名單，\n由系統依原輸入順序重新分組？",
                actions: [
                    {
                        label: "返回",
                        value: "cancel",
                        className: "modal-button",
                    },
                    {
                        label: "重新分組",
                        value: "regroup",
                        className: "primary-button",
                    },
                ],
            });
            if (choice !== "regroup") return;
            const members = getNamedMembers();
            state.groups = regroupMembers(members, nextSize);
        } else {
            state.groups = createBlankGroups(nextSize);
        }

        state.settings.groupSize = nextSize;
        syncControls();
        renderRoster();
        updateSummary();
        markResultStale();
    }

    function regroupMembers(members, groupSize) {
        const neededSlots = Math.min(
            24,
            Math.max(18, Math.ceil(members.length / groupSize) * groupSize),
        );
        const groups = createBlankGroups(groupSize, neededSlots);
        members.forEach((member, index) => {
            const groupIndex = Math.floor(index / groupSize);
            const memberIndex = index % groupSize;
            groups[groupIndex].members[memberIndex] = {
                name: member.name,
                gender: member.gender,
            };
        });
        return groups;
    }

    function handleRosterInput(event) {
        const input = event.target.closest(".member-name-input");
        if (!input) return;
        const groupIndex = Number(input.dataset.groupIndex);
        const memberIndex = Number(input.dataset.memberIndex);
        const value = truncateGraphemes(input.value, 6);
        if (input.value !== value) input.value = value;
        state.groups[groupIndex].members[memberIndex].name = value;
        updateSummary();
        markResultStale();
    }

    function handleRosterChange(event) {
        const input = event.target.closest(".gender-input");
        if (!input) return;
        const groupIndex = Number(input.dataset.groupIndex);
        const memberIndex = Number(input.dataset.memberIndex);
        state.groups[groupIndex].members[memberIndex].gender =
            input.value === "M" ? "M" : "F";
        updateSummary();
        markResultStale();
    }

    function handleRosterBlur(event) {
        const input = event.target.closest(".member-name-input");
        if (!input) return;
        const groupIndex = Number(input.dataset.groupIndex);
        const memberIndex = Number(input.dataset.memberIndex);
        const trimmed = input.value.trim();
        input.value = trimmed;
        state.groups[groupIndex].members[memberIndex].name = trimmed;
        updateSummary();
        scheduleSave();
    }

    function handleRosterClick(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const groupIndex = Number(button.dataset.groupIndex);
        if (button.dataset.action === "delete-group")
            confirmDeleteGroup(groupIndex);
        if (button.dataset.action === "clear-person") clearPerson(groupIndex);
    }

    async function confirmDeleteGroup(groupIndex) {
        const group = state.groups[groupIndex];
        if (!group) return;
        const names = group.members
            .map((member) => member.name.trim())
            .filter(Boolean);
        const capacityAfterDelete = getCapacity() - state.settings.groupSize;
        if (names.length && capacityAfterDelete < 6) {
            await showMinimumCapacityWarning();
            return;
        }

        const choice = await ui.showModal({
            // icon: "⌫",
            title: "刪除小組",
            message: `確定要刪除以下成員的小組嗎？\n${groupLabel(groupIndex)} 組\n${names.length ? names.join("、") : "（尚無成員）"}`,
            actions: [
                { label: "不要刪", value: "cancel", className: "modal-button" },
                {
                    label: "確認刪除",
                    value: "delete",
                    className: "danger-button",
                },
            ],
        });
        if (choice !== "delete") return;
        state.groups.splice(groupIndex, 1);
        renderRoster();
        updateSummary();
        markResultStale();
    }

    async function clearPerson(groupIndex) {
        if (getCapacity() <= 6) {
            await showMinimumCapacityWarning();
            return;
        }
        const member =
            state.groups[groupIndex] && state.groups[groupIndex].members[0];
        if (!member) return;
        member.name = "";
        member.gender = "F";
        renderRoster();
        updateSummary();
        markResultStale();
    }

    function showMinimumCapacityWarning() {
        return ui.showModal({
            // icon: "!",
            title: "無法刪除",
            message: "最少須保留 6 個成員輸入欄位！",
            actions: [
                { label: "知道了", value: true, className: "modal-button" },
            ],
        });
    }

    function addUnit() {
        const groupSize = state.settings.groupSize;
        if (getCapacity() + groupSize > 24) {
            ui.showToast("最多可建立 24 個成員欄位");
            return;
        }
        state.groups.push({
            members: Array.from({ length: groupSize }, createBlankMember),
        });
        renderRoster();
        updateAddButton();
        scheduleSave();
        window.setTimeout(() => {
            const inputs =
                elements.roster.querySelectorAll(".member-name-input");
            const firstNewInput = inputs[inputs.length - groupSize];
            if (firstNewInput) firstNewInput.focus();
        }, 0);
    }

    function renderRoster() {
        elements.roster.replaceChildren();
        if (state.settings.groupSize === 1) renderSoloRoster();
        else renderGroupedRoster();
        elements.addUnit.textContent =
            state.settings.groupSize === 1 ? "＋ 新增人員" : "＋ 新增小組";
        updateAddButton();
    }

    function renderGroupedRoster() {
        state.groups.forEach((group, groupIndex) => {
            const card = document.createElement("section");
            card.className = "group-card";
            card.id = `input-group-${groupIndex}`;

            const label = document.createElement("div");
            label.className = "group-label";
            label.textContent = `${groupLabel(groupIndex)}組`;

            const memberList = document.createElement("div");
            memberList.className = "member-list";
            group.members.forEach((member, memberIndex) => {
                memberList.appendChild(
                    createMemberRow(member, groupIndex, memberIndex, false),
                );
            });

            const deleteButton = createDeleteButton(
                "delete-group",
                groupIndex,
                "刪除此小組",
                "⌫",
            );
            deleteButton.classList.add("delete-unit");
            card.append(label, memberList, deleteButton);
            elements.roster.appendChild(card);
        });
    }

    function renderSoloRoster() {
        const card = document.createElement("section");
        card.className = "solo-roster-card";
        state.groups.forEach((group, groupIndex) => {
            const row = createMemberRow(group.members[0], groupIndex, 0, true);
            const deleteButton = createDeleteButton(
                "clear-person",
                groupIndex,
                `清空第 ${groupIndex + 1} 位成員`,
                "⌫",
            );
            deleteButton.classList.add("delete-person");
            row.appendChild(deleteButton);
            card.appendChild(row);
        });
        elements.roster.appendChild(card);
    }

    function createMemberRow(member, groupIndex, memberIndex, solo) {
        const row = document.createElement("div");
        row.className = "member-row";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.className = "member-name-input";
        nameInput.value = member.name;
        nameInput.placeholder = `player${solo ? groupIndex + 1 : memberIndex + 1}`;
        nameInput.autocomplete = "off";
        nameInput.maxLength = 12;
        nameInput.dataset.groupIndex = String(groupIndex);
        nameInput.dataset.memberIndex = String(memberIndex);
        nameInput.setAttribute(
            "aria-label",
            `${solo ? `第 ${groupIndex + 1} 位` : `${groupLabel(groupIndex)}組第 ${memberIndex + 1} 位`}成員名稱`,
        );

        const genders = document.createElement("fieldset");
        genders.className = "gender-options";
        const legend = document.createElement("legend");
        legend.className = "sr-only";
        legend.textContent = "性別";
        genders.appendChild(legend);
        genders.appendChild(
            createGenderChoice("F", "女", member, groupIndex, memberIndex),
        );
        genders.appendChild(
            createGenderChoice("M", "男", member, groupIndex, memberIndex),
        );

        row.append(nameInput, genders);
        return row;
    }

    function createGenderChoice(value, text, member, groupIndex, memberIndex) {
        const label = document.createElement("label");
        label.className = "gender-choice";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.className = "gender-input";
        radio.name = `gender-${groupIndex}-${memberIndex}`;
        radio.value = value;
        radio.checked = member.gender === value;
        radio.dataset.groupIndex = String(groupIndex);
        radio.dataset.memberIndex = String(memberIndex);
        label.append(radio, document.createTextNode(text));
        return label;
    }

    function createDeleteButton(action, groupIndex, label, symbol) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action;
        button.dataset.groupIndex = String(groupIndex);
        button.setAttribute("aria-label", label);
        button.textContent = symbol;
        return button;
    }

    function updateAddButton() {
        elements.addUnit.disabled =
            getCapacity() + state.settings.groupSize > 24;
    }

    function updateSummary() {
        const members = getNamedMembers();
        const women = members.filter((member) => member.gender === "F").length;
        const men = members.length - women;
        elements.participantSummary.textContent = `共 ${members.length} 人參與，${women} 女 ${men} 男`;
    }

    function getNamedMembers() {
        return state.groups
            .flatMap((group) => group.members)
            .filter((member) => member.name.trim())
            .map((member) => ({
                name: member.name.trim(),
                gender: member.gender === "M" ? "M" : "F",
            }));
    }

    function hasAnyNames() {
        return getNamedMembers().length > 0;
    }

    function getCapacity() {
        return state.groups.reduce(
            (sum, group) => sum + group.members.length,
            0,
        );
    }

    function groupLabel(index) {
        return GROUP_LABELS[index] || String(index + 1);
    }

    async function startScheduling() {
        commitDuration();
        const memberCount = getNamedMembers().length;
        if (memberCount < 6) {
            await ui.showModal({
                // icon: "〒﹏〒",
                title: "人數過少無法分隊",
                message: "再多揪點人！\n至少須滿 6 人",
                actions: [
                    {
                        label: "好吧 ┐(´д`)┌",
                        value: true,
                        className: "modal-button",
                    },
                ],
            });
            return;
        }

        const duplicates = scheduler.findDuplicates(state.groups);
        if (duplicates.length) {
            const duplicateText = duplicates
                .map((bucket) => {
                    const first = bucket[0];
                    const locations =
                        state.settings.groupSize === 1
                            ? bucket
                                  .map((item) => `第 ${item.groupIndex + 1} 位`)
                                  .join("、")
                            : bucket
                                  .map((item) => `${item.groupLabel}組`)
                                  .join("、");
                    return `${first.name}（${first.gender === "M" ? "男" : "女"}）：${locations}`;
                })
                .join("\n");
            const choice = await ui.showModal({
                // icon: "!",
                title: "發現同名成員",
                message: `以下姓名與性別重複：\n${duplicateText}\n\n系統會自動加上組別或流水號以便辨識，是否仍要分隊？`,
                actions: [
                    {
                        label: "返回修改",
                        value: "cancel",
                        className: "modal-button",
                    },
                    {
                        label: "同名，要分隊",
                        value: "continue",
                        className: "primary-button",
                    },
                ],
            });
            if (choice !== "continue") return;
        }

        if (state.settings.groupSize > 1) {
            state.groups = state.groups.filter((group) =>
                group.members.some((member) => member.name.trim()),
            );
            renderRoster();
            updateSummary();
        }

        ui.showBusy("分隊中");
        await delay(60);
        try {
            state.result = scheduler.generateSchedule({
                settings: state.settings,
                groups: state.groups,
            });
            state.resultStale = false;
            selectedRoundNumber = null;
            storage.save(state);
            updateResultAvailability();
            renderResult();
            await delay(90);
            ui.hideBusy();
            switchView("result");
        } catch (error) {
            ui.hideBusy();
            await ui.showModal({
                // icon: "!",
                title: "暫時無法完成分隊",
                message:
                    error && error.message
                        ? error.message
                        : "請檢查輸入內容後再試一次。",
                actions: [
                    {
                        label: "返回檢查",
                        value: true,
                        className: "modal-button",
                    },
                ],
            });
        }
    }

    function renderResult() {
        const result = state.result;
        if (!result) return;
        selectedRoundNumber = null;
        const women = result.players.filter(
            (player) => player.gender === "F",
        ).length;
        const men = result.players.length - women;
        elements.resultSummary.textContent = `共 ${result.players.length} 人參與，${women} 女 ${men} 男`;
        elements.resultEventName.textContent =
            result.settings.eventName || "未命名場次";
        elements.staleNotice.hidden = !state.resultStale;
        elements.resultContent.replaceChildren();
        elements.splitNotation.hidden = result.settings.groupSize === 1;

        if (result.settings.groupSize === 1) renderSoloResult(result);
        else renderGroupedResult(result);
    }

    function renderGroupedResult(result) {
        const layout = document.createElement("div");
        layout.className = "split-result";

        const groupPane = document.createElement("section");
        groupPane.className = "result-pane";
        const groupTitle = document.createElement("h2");
        groupTitle.className = "result-pane-title";
        groupTitle.textContent = "小組名單（●男）";
        const groupList = document.createElement("div");
        groupList.className = "result-group-list";

        result.groups.forEach((group, groupIndex) => {
            const card = document.createElement("div");
            card.className = "result-group-card";
            card.dataset.groupIndex = String(groupIndex);
            const namedMembers = result.players.filter(
                (player) => player.groupIndex === groupIndex,
            );
            const heading = document.createElement("strong");
            heading.textContent = `${groupLabel(groupIndex)} 組`;
            if (namedMembers.length < result.settings.groupSize) {
                const shortage = document.createElement("span");
                shortage.className = "group-shortage";
                shortage.textContent = "*";
                heading.appendChild(shortage);
            }
            card.append(heading, document.createTextNode("｜"));
            namedMembers.forEach((player, index) => {
                if (index) card.appendChild(document.createTextNode("、"));
                appendPlayerName(card, player);
            });
            groupList.appendChild(card);
        });
        groupPane.append(groupTitle, groupList);

        const schedulePane = document.createElement("section");
        schedulePane.className = "result-pane";
        schedulePane.appendChild(createScheduleTable(result, false));
        layout.append(groupPane, schedulePane);
        elements.resultContent.appendChild(layout);
    }

    function renderSoloResult(result) {
        const container = document.createElement("section");
        container.className = "solo-result";
        container.appendChild(createScheduleTable(result, true));
        elements.resultContent.appendChild(container);
    }

    function createScheduleTable(result, solo) {
        const table = document.createElement("table");
        table.className = "schedule-table";
        const thead = document.createElement("thead");
        const headingRow = document.createElement("tr");
        ["場", "前場地", "後場地"].forEach((text) => {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = text;
            headingRow.appendChild(th);
        });
        thead.appendChild(headingRow);
        const tbody = document.createElement("tbody");

        result.rounds.forEach((round) => {
            const row = document.createElement("tr");
            row.className = "schedule-row";
            row.dataset.round = String(round.number);
            const numberCell = document.createElement("td");
            numberCell.textContent = String(round.number);
            const frontCell = document.createElement("td");
            const backCell = document.createElement("td");

            if (round.type === "placeholder") {
                frontCell.className = "placeholder-team";
                backCell.className = "placeholder-team";
                frontCell.textContent = round.frontLabel;
                backCell.textContent = round.backLabel;
            } else {
                row.classList.add("is-clickable");
                frontCell.className = "front-team";
                backCell.className = "back-team";
                if (solo) {
                    frontCell.appendChild(
                        createSoloTeam(round.front, result.players),
                    );
                    backCell.appendChild(
                        createSoloTeam(round.back, result.players),
                    );
                } else {
                    frontCell.appendChild(
                        createGroupedTeam(round.front, round, result),
                    );
                    backCell.appendChild(
                        createGroupedTeam(round.back, round, result),
                    );
                    row.addEventListener("click", () =>
                        toggleRoundHighlight(round, result),
                    );
                }
            }

            row.append(numberCell, frontCell, backCell);
            tbody.appendChild(row);
        });
        table.append(thead, tbody);
        return table;
    }

    function createGroupedTeam(ids, round, result) {
        const wrapper = document.createElement("span");
        const idSet = new Set(ids);
        const playersByGroup = new Map();
        ids.map((id) => result.players.find((player) => player.id === id))
            .filter(Boolean)
            .forEach((player) => {
                if (!playersByGroup.has(player.groupIndex))
                    playersByGroup.set(player.groupIndex, []);
                playersByGroup.get(player.groupIndex).push(player);
            });

        Array.from(playersByGroup.entries())
            .sort((left, right) => left[0] - right[0])
            .forEach(([groupIndex, sidePlayers], index) => {
                if (index) wrapper.appendChild(document.createTextNode("、"));
                const allGroupPlayers = result.players.filter(
                    (player) => player.groupIndex === groupIndex,
                );
                const isWholeGroup =
                    allGroupPlayers.every((player) => idSet.has(player.id)) &&
                    !round.splitGroups.includes(groupIndex);
                const shortage =
                    allGroupPlayers.length < result.settings.groupSize
                        ? "*"
                        : "";
                const entry = document.createElement("span");
                entry.className = "team-entry";
                if (isWholeGroup) {
                    entry.textContent = `${groupLabel(groupIndex)}${shortage}`;
                } else {
                    entry.textContent = sidePlayers
                        .map(
                            (player) =>
                                `${groupLabel(groupIndex)}${shortage}·${player.displayName}`,
                        )
                        .join("／");
                }
                wrapper.appendChild(entry);
            });
        return wrapper;
    }

    function createSoloTeam(ids, players) {
        const wrapper = document.createElement("span");
        wrapper.className = "solo-team-lines";
        const teamPlayers = ids
            .map((id) => players.find((player) => player.id === id))
            .filter(Boolean);
        for (let index = 0; index < teamPlayers.length; index += 2) {
            const line = document.createElement("span");
            line.className = "solo-team-line";
            appendPlayerName(line, teamPlayers[index]);
            if (teamPlayers[index + 1]) {
                line.appendChild(document.createTextNode("、"));
                appendPlayerName(line, teamPlayers[index + 1]);
            }
            wrapper.appendChild(line);
        }
        if (teamPlayers.length < 6) {
            const shortage = document.createElement("span");
            shortage.className = "team-shortage";
            shortage.textContent = `（缺 ${6 - teamPlayers.length}）`;
            const lastLine = wrapper.lastElementChild;
            if (lastLine) lastLine.appendChild(shortage);
            else wrapper.appendChild(shortage);
        }
        return wrapper;
    }

    function appendPlayerName(parent, player) {
        parent.appendChild(document.createTextNode(player.displayName));
        if (player.gender === "M") {
            const dot = document.createElement("span");
            dot.className = "male-dot";
            dot.textContent = "●";
            parent.appendChild(dot);
        }
    }

    function toggleRoundHighlight(round, result) {
        selectedRoundNumber =
            selectedRoundNumber === round.number ? null : round.number;
        document.querySelectorAll(".schedule-row").forEach((row) => {
            row.classList.toggle(
                "is-selected",
                Number(row.dataset.round) === selectedRoundNumber,
            );
        });
        document.querySelectorAll(".result-group-card").forEach((card) => {
            card.classList.remove("is-front", "is-back", "is-split");
        });
        if (selectedRoundNumber == null) return;

        const frontGroups = groupsForIds(round.front, result.players);
        const backGroups = groupsForIds(round.back, result.players);
        document.querySelectorAll(".result-group-card").forEach((card) => {
            const groupIndex = Number(card.dataset.groupIndex);
            const inFront = frontGroups.has(groupIndex);
            const inBack = backGroups.has(groupIndex);
            if (inFront && inBack) card.classList.add("is-split");
            else if (inFront) card.classList.add("is-front");
            else if (inBack) card.classList.add("is-back");
        });
    }

    function groupsForIds(ids, players) {
        const idSet = new Set(ids);
        return new Set(
            players
                .filter((player) => idSet.has(player.id))
                .map((player) => player.groupIndex),
        );
    }

    async function copyCurrentInfo() {
        const text = storage.serializeExport(state);
        ui.showBusy("複製中");
        await delay(40);
        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                copied = true;
            }
        } catch (_error) {
            copied = false;
        }

        if (!copied) copied = fallbackCopy(text);
        if (copied) {
            ui.showBusyDone("已複製");
            await delay(720);
            ui.hideBusy();
            return;
        }

        ui.hideBusy();
        const textarea = document.createElement("textarea");
        textarea.className = "import-textarea";
        textarea.value = text;
        textarea.readOnly = true;
        await ui.showModal({
            // icon: "▤",
            title: "請手動複製",
            message: "瀏覽器未允許自動複製，請長按下方內容後複製。",
            extra: textarea,
            actions: [
                { label: "完成", value: true, className: "primary-button" },
            ],
        });
    }

    function fallbackCopy(text) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        let succeeded = false;
        try {
            succeeded = document.execCommand("copy");
        } catch (_error) {
            succeeded = false;
        }
        textarea.remove();
        return succeeded;
    }

    async function beginImport() {
        if (hasAnyNames()) {
            const choice = await ui.showModal({
                // icon: "!",
                title: "取代現有資料",
                message: "匯入後會取代目前的設定與成員名單，是否繼續？",
                actions: [
                    {
                        label: "返回",
                        value: "cancel",
                        className: "modal-button",
                    },
                    {
                        label: "取代現有結果",
                        value: "replace",
                        className: "danger-button",
                    },
                ],
            });
            if (choice !== "replace") return;
        }
        await showImportDialog();
    }

    async function showImportDialog() {
        const wrapper = document.createElement("div");
        const textarea = document.createElement("textarea");
        textarea.className = "import-textarea";
        textarea.placeholder = "在此貼上複製的文字";
        textarea.setAttribute("aria-label", "匯入內容");
        const pasteButton = document.createElement("button");
        pasteButton.type = "button";
        pasteButton.className = "paste-button";
        pasteButton.textContent = "貼上剪貼簿內容";
        const status = document.createElement("p");
        status.className = "paste-status";
        pasteButton.addEventListener("click", async () => {
            try {
                if (!navigator.clipboard || !navigator.clipboard.readText)
                    throw new Error("unsupported");
                textarea.value = await navigator.clipboard.readText();
                status.textContent = "已讀取剪貼簿內容";
            } catch (_error) {
                status.textContent =
                    "瀏覽器未允許自動貼上，請長按文字框手動貼上。";
                textarea.focus();
            }
        });
        wrapper.append(textarea, pasteButton, status);

        const choice = await ui.showModal({
            // icon: "↪",
            title: "匯入既有資訊",
            message: "請貼上由【複製目前資訊】產生的文字。",
            extra: wrapper,
            actions: [
                { label: "返回", value: "cancel", className: "modal-button" },
                {
                    label: "確定匯入",
                    value: "import",
                    className: "primary-button",
                },
            ],
        });
        if (choice !== "import") return;

        try {
            const imported = storage.parseImport(textarea.value);
            state = {
                version: storage.SCHEMA_VERSION,
                settings: imported.settings,
                groups: imported.groups,
                result: null,
                resultStale: false,
            };
            selectedRoundNumber = null;
            syncControls();
            renderRoster();
            updateSummary();
            updateResultAvailability();
            storage.save(state);
            ui.showToast("匯入成功！");
        } catch (_error) {
            await ui.showModal({
                // icon: "!",
                title: "內容不符",
                message: "請匯入由【複製目前資訊】產生的文字。",
                actions: [
                    { label: "知道了", value: true, className: "modal-button" },
                ],
            });
        }
    }

    async function confirmReset() {
        const choice = await ui.showModal({
            // icon: "↺",
            title: "確定要重置嗎？",
            message: "所有輸入與分隊結果將被清除\n( ꒪Д꒪)ノ",
            actions: [
                { label: "返回", value: "cancel", className: "modal-button" },
                {
                    label: "確認重置",
                    value: "reset",
                    className: "danger-button",
                },
            ],
        });
        if (choice !== "reset") return;
        window.clearTimeout(saveTimer);
        state = createDefaultState();
        selectedRoundNumber = null;
        storage.clear();
        syncControls();
        renderRoster();
        updateSummary();
        updateResultAvailability();
        switchView("setup");
        ui.showToast("已重置所有資料");
    }

    function markResultStale() {
        if (state.result) state.resultStale = true;
        updateResultAvailability();
        scheduleSave();
    }

    function updateResultAvailability() {
        const hasResult = Boolean(state.result);
        elements.resultTab.disabled = !hasResult;
        elements.resultStaleDot.hidden = !(hasResult && state.resultStale);
        elements.staleNotice.hidden = !state.resultStale;
    }

    function scheduleSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => storage.save(state), SAVE_DELAY);
    }

    function truncateGraphemes(value, maximum) {
        const text = String(value || "");
        if (typeof Intl !== "undefined" && Intl.Segmenter) {
            const segments = Array.from(
                new Intl.Segmenter("zh-Hant", {
                    granularity: "grapheme",
                }).segment(text),
                (item) => item.segment,
            );
            return segments.slice(0, maximum).join("");
        }
        return Array.from(text).slice(0, maximum).join("");
    }

    function delay(milliseconds) {
        return new Promise((resolve) =>
            window.setTimeout(resolve, milliseconds),
        );
    }
})();
