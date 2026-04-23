(function () {
    const defaultTargetUrl = "tasker://assistantactions?task=OpenProductivity";
    const redirectDelayMs = 1000;
    const newsSummaryUrl = "./weekly-news.jsonl";
    const legacyNewsSummaryUrl = "./news-summary.json";
    const newsAccessStorageKey = "weekly-news-access";
    const newsAccessDurationMs = 24 * 60 * 60 * 1000;
    const actionLinks = globalThis.document.querySelectorAll("[data-target]");
    const breathingLink = globalThis.document.getElementById("open-breathing");
    const newsLink = globalThis.document.getElementById("open-news-summary");
    const watchPopup = globalThis.document.getElementById("watch-popup");
    const searchParams = new URLSearchParams(globalThis.location.search);
    const isPreviewMode = searchParams.get("preview") === "1";
    let redirectHandle = null;
    let popupHandle = null;
    let newsSummaryPromise;

    function cancelRedirect() {
        if (redirectHandle !== null) {
            globalThis.clearTimeout(redirectHandle);
            redirectHandle = null;
        }
    }

    function openTarget(targetUrl) {
        cancelRedirect();
        globalThis.location.href = targetUrl;
    }

    function showWatchPopup() {
        if (!watchPopup) {
            return;
        }

        watchPopup.classList.add("is-visible");
        watchPopup.setAttribute("aria-hidden", "false");

        if (popupHandle !== null) {
            globalThis.clearTimeout(popupHandle);
        }

        popupHandle = globalThis.setTimeout(function () {
            watchPopup.classList.remove("is-visible");
            watchPopup.setAttribute("aria-hidden", "true");
            popupHandle = null;
        }, 1400);
    }

    function readNewsAccessRecord() {
        try {
            const rawValue = globalThis.localStorage.getItem(newsAccessStorageKey);

            if (!rawValue) {
                return null;
            }

            const parsedValue = JSON.parse(rawValue);

            if (!parsedValue || typeof parsedValue !== "object") {
                return null;
            }

            return parsedValue;
        } catch {
            return null;
        }
    }

    function writeNewsAccessRecord(weekId) {
        try {
            globalThis.localStorage.setItem(newsAccessStorageKey, JSON.stringify({
                weekId,
                availableUntil: Date.now() + newsAccessDurationMs
            }));
        } catch {
            // Ignore storage failures and still allow the current navigation.
        }
    }

    function clearNewsAccessRecord() {
        try {
            globalThis.localStorage.removeItem(newsAccessStorageKey);
        } catch {
            // Ignore storage failures.
        }
    }

    function getNewsButtonLabel() {
        return newsLink ? newsLink.querySelector(".button-label") : null;
    }

    function formatLocalDateTime(timestamp) {
        if (!Number.isFinite(timestamp)) {
            return "";
        }

        try {
            return new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short"
            }).format(new Date(timestamp));
        } catch {
            return "";
        }
    }

    function buildWeekIdFromTimeWindow(timeWindow) {
        if (!timeWindow || typeof timeWindow.start !== "string" || typeof timeWindow.end !== "string") {
            return "";
        }

        return `${timeWindow.start.slice(0, 10)}:${timeWindow.end.slice(0, 10)}`;
    }

    function normalizeJsonlSummary(records) {
        const requiredSections = ["world_news", "dutch_news", "tech_news"];
        const allowedSections = new Set(["world_news", "dutch_news", "tech_news", "buddhist_news"]);
        const sectionNames = new Set();

        records.forEach(function (record) {
            if (record && typeof record.section === "string") {
                sectionNames.add(record.section);
            }
        });

        if (records.length < requiredSections.length || records.length > allowedSections.size || sectionNames.size !== records.length) {
            throw new TypeError("Weekly JSONL payload contains an unexpected number of sections");
        }

        if (requiredSections.some(function (sectionName) { return !sectionNames.has(sectionName); })) {
            throw new TypeError("Weekly JSONL payload must contain world_news, dutch_news and tech_news sections");
        }

        if (records.some(function (record) { return !allowedSections.has(record.section); })) {
            throw new TypeError("Weekly JSONL payload contains an unknown section");
        }

        const referenceRecord = records.find(function (record) {
            return record?.time_window;
        });
        const weekId = buildWeekIdFromTimeWindow(referenceRecord ? referenceRecord.time_window : null);

        if (!weekId) {
            throw new TypeError("Weekly JSONL payload is missing a valid time window");
        }

        return {
            weekId,
            sections: records
        };
    }

    async function loadLegacyNewsSummary() {
        const response = await fetch(legacyNewsSummaryUrl, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Failed to load weekly summary: ${response.status}`);
        }

        const summary = await response.json();

        if (!summary || typeof summary.weekId !== "string" || !Array.isArray(summary.sections) || summary.sections.length === 0) {
            throw new TypeError("Weekly summary payload is incomplete");
        }

        return summary;
    }

    function loadNewsSummary() {
        if (newsSummaryPromise) {
            return newsSummaryPromise;
        }

        newsSummaryPromise = fetch(newsSummaryUrl, { cache: "no-store" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(`Failed to load weekly JSONL summary: ${response.status}`);
                }

                return response.text();
            })
            .then(function (payloadText) {
                const records = payloadText
                    .split(/\r?\n/u)
                    .map(function (line) {
                        return line.trim();
                    })
                    .filter(Boolean)
                    .map(function (line) {
                        return JSON.parse(line);
                    });

                return normalizeJsonlSummary(records);
            })
            .catch(function () {
                return loadLegacyNewsSummary();
            })
            .catch(function (error) {
                newsSummaryPromise = undefined;
                throw error;
            });

        return newsSummaryPromise;
    }

    function setNewsButtonState(options) {
        if (!newsLink) {
            return;
        }

        const label = getNewsButtonLabel();

        newsLink.classList.toggle("is-disabled", options.disabled);
        newsLink.setAttribute("aria-disabled", options.disabled ? "true" : "false");
        newsLink.dataset.available = options.disabled ? "false" : "true";

        if (label && options.label) {
            label.textContent = options.label;
        }

        if (options.title) {
            newsLink.title = options.title;
        } else {
            newsLink.removeAttribute("title");
        }
    }

    function getNewsAvailability(summary) {
        const accessRecord = readNewsAccessRecord();

        if (!accessRecord) {
            return { state: "fresh" };
        }

        if (accessRecord.weekId !== summary.weekId) {
            clearNewsAccessRecord();
            return { state: "fresh" };
        }

        if (!Number.isFinite(accessRecord.availableUntil)) {
            clearNewsAccessRecord();
            return { state: "fresh" };
        }

        if (accessRecord.availableUntil > Date.now()) {
            return {
                state: "open",
                availableUntil: accessRecord.availableUntil
            };
        }

        return {
            state: "expired",
            availableUntil: accessRecord.availableUntil
        };
    }

    async function syncNewsButtonState() {
        if (!newsLink) {
            return;
        }

        setNewsButtonState({
            disabled: true,
            label: "Loading weekly briefing…",
            title: "Checking the current weekly briefing"
        });

        try {
            const summary = await loadNewsSummary();
            const availability = getNewsAvailability(summary);

            if (availability.state === "expired") {
                const untilLabel = formatLocalDateTime(availability.availableUntil);

                setNewsButtonState({
                    disabled: true,
                    label: "Weekly briefing locked",
                    title: untilLabel ? `Available until ${untilLabel}` : "This briefing stays open for 24 hours after first launch"
                });
                return;
            }

            const untilLabel = availability.state === "open" ? formatLocalDateTime(availability.availableUntil) : "";

            setNewsButtonState({
                disabled: false,
                label: "Read news summary",
                title: untilLabel ? `Available until ${untilLabel}` : "This briefing stays open for 24 hours after first launch"
            });
        } catch {
            setNewsButtonState({
                disabled: true,
                label: "Summary unavailable",
                title: "The weekly briefing file could not be loaded"
            });
        }
    }

    async function handleNewsClick() {
        if (!newsLink) {
            return;
        }

        try {
            const summary = await loadNewsSummary();
            const availability = getNewsAvailability(summary);

            if (availability.state === "expired") {
                setNewsButtonState({
                    disabled: true,
                    label: "Weekly briefing locked",
                    title: "A new weekly briefing will unlock the next reading window"
                });
                return;
            }

            if (availability.state === "fresh") {
                writeNewsAccessRecord(summary.weekId);
            }

            openTarget(newsLink.dataset.target || defaultTargetUrl);
        } catch {
            setNewsButtonState({
                disabled: true,
                label: "Summary unavailable",
                title: "The weekly briefing file could not be loaded"
            });
        }
    }

    actionLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            event.preventDefault();

            if (link === newsLink) {
                cancelRedirect();

                if (link.dataset.available === "false") {
                    return;
                }

                handleNewsClick();
                return;
            }

            if (link === breathingLink) {
                showWatchPopup();
                globalThis.setTimeout(function () {
                    openTarget(link.dataset.target || defaultTargetUrl);
                }, 180);
                return;
            }

            openTarget(link.dataset.target || defaultTargetUrl);
        });
    });

    if (newsLink) {
        syncNewsButtonState();
    }

    if (!isPreviewMode) {
        redirectHandle = globalThis.setTimeout(function () {
            openTarget(defaultTargetUrl);
        }, redirectDelayMs);
    }
}());