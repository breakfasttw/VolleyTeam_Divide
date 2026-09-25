(function () {
    "use strict";

    const STORAGE_KEY = "voly.team-divider.state.v1";
    const EXPORT_FORMAT = "voly-team-divider";
    const SCHEMA_VERSION = 1;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function safeLoad() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!isStoredState(parsed)) return null;

            return {
                ...parsed,
                settings: sanitizeSettings(parsed.settings),
                groups: sanitizeGroups(
                    parsed.groups,
                    Number(parsed.settings.groupSize),
                ),
            };
        } catch (_error) {
            return null;
        }
    }

    function save(state) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch (_error) {
            return false;
        }
    }

    function clear() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (_error) {
            return false;
        }
    }

    function buildExport(state) {
        return {
            format: EXPORT_FORMAT,
            version: SCHEMA_VERSION,
            settings: clone(state.settings),
            groups: clone(state.groups),
        };
    }

    function serializeExport(state) {
        return JSON.stringify(buildExport(state));
    }

    function parseImport(text) {
        let data;
        try {
            data = JSON.parse(String(text || "").trim());
        } catch (_error) {
            throw new Error("內容不是有效的 JSON 格式");
        }

        if (
            !data ||
            data.format !== EXPORT_FORMAT ||
            data.version !== SCHEMA_VERSION
        ) {
            throw new Error("內容不是 Voly 目前支援的資料格式");
        }
        if (
            !isSettings(data.settings) ||
            !isGroups(data.groups, data.settings.groupSize)
        ) {
            throw new Error("內容缺少必要欄位，或欄位值超出限制");
        }

        return {
            settings: sanitizeSettings(data.settings),
            groups: sanitizeGroups(
                data.groups,
                Number(data.settings.groupSize),
            ),
        };
    }

    function isStoredState(value) {
        return Boolean(
            value &&
            value.version === SCHEMA_VERSION &&
            isSettings(value.settings) &&
            isGroups(value.groups, value.settings.groupSize) &&
            (value.result === null || typeof value.result === "object"),
        );
    }

    function isSettings(value) {
        if (!value || typeof value !== "object") return false;
        const duration = Number(value.duration);
        const groupSize = Number(value.groupSize);
        return (
            typeof value.eventName === "string" &&
            isValidEventName(value.eventName) &&
            Number.isFinite(duration) &&
            duration >= 1 &&
            duration <= 6 &&
            Math.abs(duration * 2 - Math.round(duration * 2)) < 0.0001 &&
            [1, 2, 3].includes(groupSize) &&
            typeof value.earlyPlay === "boolean" &&
            typeof value.spreadMen === "boolean" &&
            (typeof value.spreadBeginners === "undefined" ||
                typeof value.spreadBeginners === "boolean")
        );
    }

    function isValidMemberName(name) {
        const text = String(name || "");
        const limit = /^[A-Za-z0-9]+$/.test(text) ? 10 : 7;
        return Array.from(text).length <= limit;
    }

    function isGroups(groups, groupSizeValue) {
        const groupSize = Number(groupSizeValue);
        if (
            !Array.isArray(groups) ||
            groups.length > 24 ||
            ![1, 2, 3].includes(groupSize)
        )
            return false;
        if (
            groups.reduce(
                (sum, group) =>
                    sum +
                    (Array.isArray(group.members) ? group.members.length : 99),
                0,
            ) > 24
        )
            return false;

        return groups.every((group) => {
            if (!group || !Array.isArray(group.members)) return false;
            if (groupSize === 1 && group.members.length !== 1) return false;
            if (groupSize > 1 && group.members.length !== groupSize)
                return false;
            return group.members.every(
                (member) =>
                    member &&
                    typeof member.name === "string" &&
                    isValidMemberName(member.name) &&
                    ["F", "M"].includes(member.gender) &&
                    (typeof member.isBeginner === "undefined" ||
                        typeof member.isBeginner === "boolean"),
            );
        });
    }

    function sanitizeSettings(settings) {
        return {
            eventName: String(settings.eventName).trim(),
            duration: Math.min(
                6,
                Math.max(1, Math.round(Number(settings.duration) * 2) / 2),
            ),
            earlyPlay: Boolean(settings.earlyPlay),
            spreadMen: Boolean(settings.spreadMen),
            spreadBeginners: Boolean(settings.spreadBeginners),
            groupSize: Number(settings.groupSize),
        };
    }

    function sanitizeGroups(groups, groupSize) {
        return groups.map((group) => ({
            members: group.members.slice(0, groupSize).map((member) => ({
                name: String(member.name).trim(),
                gender: member.gender === "M" ? "M" : "F",
                isBeginner: Boolean(member.isBeginner),
            })),
        }));
    }
    function isValidEventName(name) {
        const text = String(name || "");
        const limit = /^[A-Za-z0-9]+$/.test(text) ? 16 : 12;
        return Array.from(text).length <= limit;
    }

    window.VolyStorage = {
        STORAGE_KEY,
        SCHEMA_VERSION,
        load: safeLoad,
        save,
        clear,
        serializeExport,
        parseImport,
    };
})();
