(function () {
    const wikipediaRandomUrl = "https://en.wikipedia.org/wiki/Special:Random";
    const wikiFrame = globalThis.document.getElementById("wiki-frame");
    const refreshButton = globalThis.document.getElementById("wiki-refresh");

    if (!wikiFrame || !refreshButton) {
        return;
    }

    function buildRandomArticleUrl() {
        const targetUrl = new URL(wikipediaRandomUrl);
        targetUrl.searchParams.set("refresh", Date.now().toString(36));
        return targetUrl.toString();
    }

    function loadRandomArticle() {
        wikiFrame.src = buildRandomArticleUrl();
    }

    refreshButton.addEventListener("click", loadRandomArticle);
}());
