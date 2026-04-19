(function () {
    const wikipediaOrigin = "https://en.wikipedia.org";
    const fallbackArticleUrl = `${wikipediaOrigin}/wiki/Special:Random`;
    const featuredPageName = "Wikipedia:Featured_articles";
    const vitalOverviewPageName = "Wikipedia:Vital_articles";
    const vitalSubpagePathPrefix = "/wiki/Wikipedia:Vital_articles/Level_4/";
    const wikiFrame = globalThis.document.getElementById("wiki-frame");
    const refreshButton = globalThis.document.getElementById("wiki-refresh");
    const domParser = new DOMParser();
    let currentArticlePath = "";
    let featuredPoolPromise;
    let vitalSubpagesPromise;
    const vitalPoolPromisesByPage = new Map();

    if (!wikiFrame || !refreshButton) {
        return;
    }

    function buildParseApiUrl(pageName) {
        const targetUrl = new URL("/w/api.php", wikipediaOrigin);
        targetUrl.searchParams.set("action", "parse");
        targetUrl.searchParams.set("page", pageName);
        targetUrl.searchParams.set("prop", "text");
        targetUrl.searchParams.set("format", "json");
        targetUrl.searchParams.set("formatversion", "2");
        targetUrl.searchParams.set("origin", "*");
        return targetUrl.toString();
    }

    async function fetchPageHtml(pageName) {
        const response = await fetch(buildParseApiUrl(pageName));

        if (!response.ok) {
            throw new Error(`Failed to fetch ${pageName}: ${response.status}`);
        }

        const payload = await response.json();

        if (!payload.parse || typeof payload.parse.text !== "string") {
            throw new Error(`Wikipedia parse response missing HTML for ${pageName}`);
        }

        return payload.parse.text;
    }

    function parseHtml(html) {
        return domParser.parseFromString(html, "text/html");
    }

    function normalizeArticlePath(href) {
        if (!href) {
            return "";
        }

        try {
            const articleUrl = new URL(href, wikipediaOrigin);

            if (articleUrl.origin !== wikipediaOrigin || !articleUrl.pathname.startsWith("/wiki/")) {
                return "";
            }

            const articleSlug = decodeURIComponent(articleUrl.pathname.slice("/wiki/".length));

            if (!articleSlug || articleSlug.includes(":")) {
                return "";
            }

            if (articleUrl.pathname === "/wiki/Main_Page") {
                return "";
            }

            return articleUrl.pathname;
        } catch {
            return "";
        }
    }

    function extractArticlePaths(html) {
        const document = parseHtml(html);
        const articlePaths = new Set();

        for (const anchor of document.querySelectorAll(".mw-parser-output a[href^='/wiki/']")) {
            if (anchor.classList.contains("new") || anchor.closest(".mw-editsection, .navbox, .vertical-navbox, .metadata")) {
                continue;
            }

            const articlePath = normalizeArticlePath(anchor.getAttribute("href"));

            if (articlePath) {
                articlePaths.add(articlePath);
            }
        }

        return Array.from(articlePaths);
    }

    function extractVitalSubpages(html) {
        const document = parseHtml(html);
        const pageNames = new Set();

        for (const anchor of document.querySelectorAll(`a[href^='${vitalSubpagePathPrefix}']`)) {
            const href = anchor.getAttribute("href");

            if (!href) {
                continue;
            }

            const articleUrl = new URL(href, wikipediaOrigin);
            const pageName = decodeURIComponent(articleUrl.pathname.slice("/wiki/".length));

            if (pageName.startsWith("Wikipedia:Vital_articles/Level_4/")) {
                pageNames.add(pageName);
            }
        }

        return Array.from(pageNames);
    }

    function pickRandomItem(items, excludedItem) {
        const availableItems = items.filter((item) => item !== excludedItem);
        const sourceItems = availableItems.length > 0 ? availableItems : items;

        if (sourceItems.length === 0) {
            return "";
        }

        const randomIndex = Math.floor(Math.random() * sourceItems.length);
        return sourceItems[randomIndex];
    }

    function shuffle(items) {
        const copy = [...items];

        for (let index = copy.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            const currentItem = copy[index];
            copy[index] = copy[swapIndex];
            copy[swapIndex] = currentItem;
        }

        return copy;
    }

    function cachePromise(setter, factory) {
        const pendingPromise = factory().catch((error) => {
            setter(undefined);
            throw error;
        });

        setter(pendingPromise);
        return pendingPromise;
    }

    function loadFeaturedPool() {
        if (featuredPoolPromise) {
            return featuredPoolPromise;
        }

        return cachePromise((value) => {
            featuredPoolPromise = value;
        }, async () => {
            const html = await fetchPageHtml(featuredPageName);
            return extractArticlePaths(html);
        });
    }

    function loadVitalSubpages() {
        if (vitalSubpagesPromise) {
            return vitalSubpagesPromise;
        }

        return cachePromise((value) => {
            vitalSubpagesPromise = value;
        }, async () => {
            const html = await fetchPageHtml(vitalOverviewPageName);
            return extractVitalSubpages(html);
        });
    }

    function loadVitalPool(pageName) {
        const existingPromise = vitalPoolPromisesByPage.get(pageName);

        if (existingPromise) {
            return existingPromise;
        }

        const pendingPromise = fetchPageHtml(pageName)
            .then((html) => extractArticlePaths(html))
            .catch((error) => {
                vitalPoolPromisesByPage.delete(pageName);
                throw error;
            });

        vitalPoolPromisesByPage.set(pageName, pendingPromise);
        return pendingPromise;
    }

    async function pickFeaturedArticlePath() {
        const articlePaths = await loadFeaturedPool();
        return pickRandomItem(articlePaths, currentArticlePath);
    }

    async function pickVitalArticlePath() {
        const vitalSubpages = await loadVitalSubpages();
        const pageName = pickRandomItem(vitalSubpages, "");

        if (!pageName) {
            return "";
        }

        const articlePaths = await loadVitalPool(pageName);
        return pickRandomItem(articlePaths, currentArticlePath);
    }

    async function loadCuratedArticlePath() {
        const sourceLoaders = shuffle([pickFeaturedArticlePath, pickVitalArticlePath]);

        for (const loadArticlePath of sourceLoaders) {
            try {
                const articlePath = await loadArticlePath();

                if (articlePath) {
                    return articlePath;
                }
            } catch {
                // Try the other source before falling back to Special:Random.
            }
        }

        return "";
    }

    function setLoadingState(isLoading) {
        refreshButton.disabled = isLoading;
        refreshButton.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    async function loadRandomArticle() {
        setLoadingState(true);

        try {
            const articlePath = await loadCuratedArticlePath();

            if (articlePath) {
                currentArticlePath = articlePath;
                wikiFrame.src = `${wikipediaOrigin}${articlePath}`;
                return;
            }

            currentArticlePath = "";
            wikiFrame.src = fallbackArticleUrl;
        } finally {
            setLoadingState(false);
        }
    }

    refreshButton.addEventListener("click", loadRandomArticle);
    loadRandomArticle();
}());
