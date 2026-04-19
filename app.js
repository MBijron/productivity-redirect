(function () {
    const defaultTargetUrl = "tasker://assistantactions?task=OpenProductivity";
    const redirectDelayMs = 1000;
    const actionLinks = globalThis.document.querySelectorAll("[data-target]");
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

    redirectHandle = globalThis.setTimeout(function () {
        openTarget(defaultTargetUrl);
    }, redirectDelayMs);
}());