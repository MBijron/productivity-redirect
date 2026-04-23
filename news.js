(function () {
    const newsSummaryUrl = "./weekly-news.jsonl";
    const legacyNewsSummaryUrl = "./news-summary.json";
    const newsAccessStorageKey = "weekly-news-access";
    const requiredSections = ["world_news", "dutch_news", "tech_news"];
    const allowedSections = new Set(["world_news", "dutch_news", "tech_news", "buddhist_news"]);
    const displayOrder = ["dutch_news", "world_news", "tech_news", "buddhist_news"];
    const sectionTitleMap = {
        dutch_news: "Nederlands nieuws",
        world_news: "World news",
        tech_news: "Tech news",
        buddhist_news: "Buddhist news"
    };
    const statusElement = globalThis.document.getElementById("news-status");
    const messageElement = globalThis.document.getElementById("news-message");
    const contentElement = globalThis.document.getElementById("news-content");
    const generatedElement = globalThis.document.getElementById("news-generated");
    const introElement = globalThis.document.getElementById("news-intro");
    const sectionsElement = globalThis.document.getElementById("news-sections");
    const noteElement = globalThis.document.getElementById("news-note");

    if (!statusElement || !messageElement || !contentElement || !generatedElement || !introElement || !sectionsElement || !noteElement) {
        return;
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

    function clearNewsAccessRecord() {
        try {
            globalThis.localStorage.removeItem(newsAccessStorageKey);
        } catch {
            // Ignore storage failures.
        }
    }

    function writeNewsAccessRecord(weekId, summaryVersion) {
        try {
            globalThis.localStorage.setItem(newsAccessStorageKey, JSON.stringify({
                weekId,
                summaryVersion,
                availableUntil: Date.now() + 24 * 60 * 60 * 1000
            }));
        } catch {
            // Ignore storage failures.
        }
    }

    function formatDisplayDate(dateValue, timeZone) {
        try {
            return new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone
            }).format(new Date(dateValue));
        } catch {
            return dateValue;
        }
    }

    function formatCoverageLabel(timeWindow) {
        if (!timeWindow || typeof timeWindow.start !== "string" || typeof timeWindow.end !== "string") {
            return "";
        }

        try {
            const start = new Date(timeWindow.start);
            const end = new Date(timeWindow.end);

            return `${new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC"
            }).format(start)} to ${new Intl.DateTimeFormat("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC"
            }).format(end)}`;
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

    function buildSummaryAccessVersion(summary) {
        if (!summary || typeof summary.weekId !== "string" || !summary.weekId) {
            return "";
        }

        if (typeof summary.generatedAt === "string" && summary.generatedAt) {
            return `${summary.weekId}:${summary.generatedAt}`;
        }

        return summary.weekId;
    }

    function getHostnameLabel(urlValue) {
        if (typeof urlValue !== "string" || !urlValue) {
            return "";
        }

        try {
            return new URL(urlValue).hostname.replace(/^www\./u, "");
        } catch {
            return "";
        }
    }

    function buildStorySourceLabel(article) {
        const parts = [];
        const hostLabel = getHostnameLabel(article.url);

        if (hostLabel) {
            parts.push(hostLabel);
        }

        if (typeof article.sourcecountry === "string" && article.sourcecountry) {
            parts.push(article.sourcecountry);
        }

        if (typeof article.language === "string" && article.language) {
            parts.push(article.language.toUpperCase());
        }

        return parts.join(" · ");
    }

    function formatListItem(item) {
        if (typeof item === "string") {
            return item;
        }

        if (!item || typeof item !== "object") {
            return "";
        }

        if (typeof item.headline === "string" && typeof item.rationale === "string" && item.headline && item.rationale) {
            return `${item.headline}: ${item.rationale}`;
        }

        if (typeof item.name === "string" && item.name) {
            return item.name;
        }

        if (typeof item.title === "string" && item.title) {
            return item.title;
        }

        return "";
    }

    function normalizeSectionRecord(record) {
        const articles = Array.isArray(record.articles) ? record.articles : [];
        let description = "";

        if (typeof record.overall_take === "string" && record.overall_take) {
            description = record.overall_take;
        } else if (typeof record.summary === "string") {
            description = record.summary;
        }

        return {
            sectionName: record.section,
            title: sectionTitleMap[record.section] || record.section,
            description,
            summary: typeof record.summary === "string" ? record.summary : "",
            articleCount: Number.isFinite(record.article_count) ? record.article_count : articles.length,
            sources: Array.isArray(record.sources) ? record.sources.filter(Boolean) : [],
            topStories: Array.isArray(record.top_stories) ? record.top_stories.map(formatListItem).filter(Boolean) : [],
            themes: Array.isArray(record.themes) ? record.themes.map(formatListItem).filter(Boolean) : [],
            linkTitles: record.section === "tech_news",
            stories: articles.map(function (article) {
                return {
                    sourceLabel: buildStorySourceLabel(article),
                    title: typeof article.title === "string" && article.title ? article.title : "Untitled article",
                    excerpt: typeof article.short_summary === "string" ? article.short_summary : "",
                    publishedAt: typeof article.date === "string" ? article.date : "",
                    url: typeof article.url === "string" ? article.url : "",
                    detailParagraphs: Array.isArray(article.detail_paragraphs) ? article.detail_paragraphs.filter(Boolean) : []
                };
            })
        };
    }

    function normalizeJsonlSummary(records) {
        const sectionMap = new Map();

        records.forEach(function (record) {
            if (record && typeof record.section === "string") {
                sectionMap.set(record.section, record);
            }
        });

        if (records.length < requiredSections.length || records.length > allowedSections.size || sectionMap.size !== records.length) {
            throw new TypeError("Weekly JSONL payload contains an unexpected number of sections");
        }

        if (requiredSections.some(function (sectionName) { return !sectionMap.has(sectionName); })) {
            throw new TypeError("Weekly JSONL payload must contain world_news, dutch_news and tech_news");
        }

        if (records.some(function (record) { return !allowedSections.has(record.section); })) {
            throw new TypeError("Weekly JSONL payload contains an unknown section");
        }

        const referenceRecord = sectionMap.get("world_news");
        const timeWindow = referenceRecord?.time_window || null;
        const weekId = buildWeekIdFromTimeWindow(timeWindow);
        const orderedSections = displayOrder
            .filter(function (sectionName) {
                return sectionMap.has(sectionName);
            })
            .map(function (sectionName) {
                return normalizeSectionRecord(sectionMap.get(sectionName));
            });
        const totalArticles = orderedSections.reduce(function (sum, section) {
            return sum + section.articleCount;
        }, 0);

        if (!weekId) {
            throw new TypeError("Weekly JSONL payload is missing a valid time window");
        }

        return {
            weekId,
            generatedAt: typeof referenceRecord.generated_at === "string" ? referenceRecord.generated_at : "",
            coverageStart: timeWindow ? timeWindow.start : "",
            coverageEnd: timeWindow ? timeWindow.end : "",
            coverageLabel: formatCoverageLabel(timeWindow),
            intro: `This briefing compacts the latest seven-day FreeNewsAPI window into ${orderedSections.length} sections across ${totalArticles} matched articles.`,
            sections: orderedSections,
            note: "Generated from FreeNewsAPI listing and detail responses and the weekly JSONL summary file."
        };
    }

    function setLockedState(message) {
        statusElement.textContent = "News summary unavailable";
        messageElement.hidden = false;
        messageElement.textContent = message;
        contentElement.hidden = true;
    }

    function appendStoryDetails(storyElement, story) {
        if (!Array.isArray(story.detailParagraphs) || story.detailParagraphs.length === 0) {
            return;
        }

        const detailsElement = globalThis.document.createElement("div");
        detailsElement.className = "news-story-details";

        story.detailParagraphs.forEach(function (paragraph) {
            const paragraphElement = globalThis.document.createElement("p");

            paragraphElement.className = "news-story-detail-paragraph";
            paragraphElement.textContent = paragraph;
            detailsElement.appendChild(paragraphElement);
        });

        storyElement.appendChild(detailsElement);
    }

    function renderStory(story) {
        const storyElement = globalThis.document.createElement("article");
        const metaElement = globalThis.document.createElement("p");
        const headingElement = globalThis.document.createElement("h3");
        const excerptElement = globalThis.document.createElement("p");
        const storyDate = story.publishedAt ? formatDisplayDate(story.publishedAt, "Europe/Paris") : "";

        storyElement.className = "news-story";
        metaElement.className = "news-story-meta";
        headingElement.className = "news-story-title";
        excerptElement.className = "news-story-excerpt";
        metaElement.textContent = [story.sourceLabel, storyDate].filter(Boolean).join(" · ");

        if (story.linkTitle && story.url) {
            const titleLinkElement = globalThis.document.createElement("a");

            titleLinkElement.className = "news-story-link";
            titleLinkElement.href = story.url;
            titleLinkElement.target = "_blank";
            titleLinkElement.rel = "noreferrer noopener";
            titleLinkElement.textContent = story.title;
            headingElement.appendChild(titleLinkElement);
        } else {
            headingElement.textContent = story.title;
        }

        excerptElement.textContent = story.excerpt;
        storyElement.appendChild(metaElement);
        storyElement.appendChild(headingElement);
        storyElement.appendChild(excerptElement);
        appendStoryDetails(storyElement, story);
        return storyElement;
    }

    function renderListSection(title, items) {
        if (!Array.isArray(items) || items.length === 0) {
            return null;
        }

        const wrapperElement = globalThis.document.createElement("section");
        const titleElement = globalThis.document.createElement("h3");
        const listElement = globalThis.document.createElement("ul");

        wrapperElement.className = "news-summary-list";
        titleElement.className = "news-summary-list-title";
        listElement.className = "news-summary-list-items";
        titleElement.textContent = title;

        items.forEach(function (item) {
            const itemElement = globalThis.document.createElement("li");

            itemElement.className = "news-summary-list-item";
            itemElement.textContent = item;
            listElement.appendChild(itemElement);
        });

        wrapperElement.appendChild(titleElement);
        wrapperElement.appendChild(listElement);
        return wrapperElement;
    }

    function getNewsAvailability(summary) {
        const accessRecord = readNewsAccessRecord();
        const summaryVersion = buildSummaryAccessVersion(summary);

        if (!accessRecord) {
            return { state: "fresh" };
        }

        if (accessRecord.weekId !== summary.weekId) {
            clearNewsAccessRecord();
            return { state: "fresh" };
        }

        if (summaryVersion && accessRecord.summaryVersion !== summaryVersion) {
            writeNewsAccessRecord(summary.weekId, summaryVersion);
            return {
                state: "open",
                availableUntil: Date.now() + 24 * 60 * 60 * 1000
            };
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

    async function loadLegacySummary() {
        const response = await fetch(legacyNewsSummaryUrl, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Failed to load weekly summary: ${response.status}`);
        }

        const summary = await response.json();

        if (!summary || typeof summary.weekId !== "string" || !Array.isArray(summary.sections)) {
            throw new TypeError("Weekly summary payload is incomplete");
        }

        return summary;
    }

    async function loadSummary() {
        try {
            const response = await fetch(newsSummaryUrl, { cache: "no-store" });

            if (!response.ok) {
                throw new Error(`Failed to load weekly JSONL summary: ${response.status}`);
            }

            const payloadText = await response.text();
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
        } catch {
            return loadLegacySummary();
        }
    }

    function renderSummary(summary, availability) {
        const cetGenerated = summary.generatedAt ? formatDisplayDate(summary.generatedAt, "Europe/Paris") : "";
        const localAvailableUntil = formatDisplayDate(availability.availableUntil, undefined);
        const coverageLabel = typeof summary.coverageLabel === "string" && summary.coverageLabel
            ? summary.coverageLabel
            : "";

        statusElement.textContent = localAvailableUntil
            ? `Available in this browser until ${localAvailableUntil}`
            : "Available for the rest of your 24-hour reading window";
        messageElement.hidden = true;
        contentElement.hidden = false;
        if (cetGenerated) {
            generatedElement.textContent = coverageLabel
                ? `Generated ${cetGenerated} CET/CEST. Coverage window: ${coverageLabel}.`
                : `Generated ${cetGenerated} CET/CEST.`;
        } else {
            generatedElement.textContent = "Generated from the current rolling seven-day window.";
        }
        introElement.textContent = typeof summary.intro === "string" ? summary.intro : "";
        sectionsElement.replaceChildren();

        summary.sections.forEach(function (section) {
            const sectionElement = globalThis.document.createElement("section");
            const titleElement = globalThis.document.createElement("h2");
            const descriptionElement = globalThis.document.createElement("p");
            const metaElement = globalThis.document.createElement("p");
            const summaryElement = globalThis.document.createElement("p");
            const storyListElement = globalThis.document.createElement("div");
            const topStoriesElement = renderListSection("Top stories", section.topStories);
            const themesElement = renderListSection("Themes", section.themes);

            sectionElement.className = "news-section";
            titleElement.className = "news-section-title";
            descriptionElement.className = "news-section-description";
            metaElement.className = "news-section-meta";
            summaryElement.className = "news-section-summary";
            storyListElement.className = "news-story-list";
            titleElement.textContent = section.title;
            sectionElement.appendChild(titleElement);

            metaElement.textContent = `${section.articleCount} articles`;

            if (section.sources?.length) {
                metaElement.textContent += ` · Sources: ${section.sources.slice(0, 6).join(", ")}`;
            }

            sectionElement.appendChild(metaElement);

            if (typeof section.description === "string" && section.description) {
                descriptionElement.textContent = section.description;
                sectionElement.appendChild(descriptionElement);
            }

            if (typeof section.summary === "string" && section.summary && section.summary !== section.description) {
                summaryElement.textContent = section.summary;
                sectionElement.appendChild(summaryElement);
            }

            if (topStoriesElement) {
                sectionElement.appendChild(topStoriesElement);
            }

            if (themesElement) {
                sectionElement.appendChild(themesElement);
            }

            if (Array.isArray(section.stories)) {
                section.stories.forEach(function (story) {
                    storyListElement.appendChild(renderStory({
                        ...story,
                        linkTitle: Boolean(story.linkTitle || section.linkTitles)
                    }));
                });
            }

            sectionElement.appendChild(storyListElement);
            sectionsElement.appendChild(sectionElement);
        });

        noteElement.textContent = typeof summary.note === "string" ? summary.note : "";
    }

    async function loadWeeklySummary() {
        const summary = await loadSummary();
        const availability = getNewsAvailability(summary);

        if (availability.state === "fresh") {
            setLockedState("Open the summary from the main page to start your 24-hour reading window.");
            return;
        }

        if (availability.state === "expired") {
            setLockedState("Your 24-hour reading window has ended. A new window opens when the next summary is published.");
            return;
        }

        renderSummary(summary, availability);
    }

    loadWeeklySummary().catch(function () {
        setLockedState("The weekly briefing file could not be loaded.");
    });
}());