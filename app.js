(function () {
    const defaultTargetUrl = "tasker://assistantactions?task=OpenProductivity";
    const redirectDelayMs = 1000;
    const actionLinks = globalThis.document.querySelectorAll("[data-target]");
    const searchParams = new URLSearchParams(globalThis.location.search);
    const isPreviewMode = searchParams.get("preview") === "1";
    let redirectHandle = null;

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

    actionLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            event.preventDefault();
            openTarget(link.dataset.target || defaultTargetUrl);
        });
    });

    if (!isPreviewMode) {
        redirectHandle = globalThis.setTimeout(function () {
            openTarget(defaultTargetUrl);
        }, redirectDelayMs);
    }
}());