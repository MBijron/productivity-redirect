(function () {
    const defaultTargetUrl = "tasker://assistantactions?task=OpenProductivity";
    const redirectDelayMs = 1000;
    const actionLinks = globalThis.document.querySelectorAll("[data-target]");
    const breathingLink = globalThis.document.getElementById("open-breathing");
    const watchPopup = globalThis.document.getElementById("watch-popup");
    const searchParams = new URLSearchParams(globalThis.location.search);
    const isPreviewMode = searchParams.get("preview") === "1";
    let redirectHandle = null;
    let popupHandle = null;

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

    actionLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            event.preventDefault();

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

    if (!isPreviewMode) {
        redirectHandle = globalThis.setTimeout(function () {
            openTarget(defaultTargetUrl);
        }, redirectDelayMs);
    }
}());