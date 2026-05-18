const mount = document.getElementById("lanyard-root");
const page = document.getElementById("page4") || mount?.closest(".page4");

let sceneModulePromise = null;
let unmountScene = null;
let loadingScene = false;
let assetsWarmed = false;
let fallbackReturnFrame = 0;
let fallbackReturnToken = 0;
let sceneFailed = false;
let sceneLoadTimeout = 0;
let sceneLoadToken = 0;
const mobileFallbackQuery = window.matchMedia("(max-width: 768px)");
const touchFallbackQuery = window.matchMedia("(hover: none) and (pointer: coarse)");
const mobileDeviceQuery = /Android|iPhone|iPad|iPod|webOS/i;

function assetUrls() {
    return {
        cardUrl: mount.dataset.card || "./card.glb",
        textureUrl: mount.dataset.lanyard || "./lanyard.png",
        cardFaceUrl: mount.dataset.cardFace || ""
    };
}

function pageIsActive() {
    return !!mount && (!page || page.classList.contains("active"));
}

function warmSceneModule() {
    if (!mount || sceneModulePromise) return sceneModulePromise;
    sceneModulePromise = import("./lanyard-scene.js?v=20260518-3").catch(error => {
        sceneModulePromise = null;
        throw error;
    });
    return sceneModulePromise;
}

function warmSceneAssets() {
    if (!mount || assetsWarmed || shouldUseMobileFallback()) return;
    assetsWarmed = true;
    const { cardUrl, textureUrl, cardFaceUrl } = assetUrls();
    [
        [cardUrl, "fetch", "model/gltf-binary"],
        [textureUrl, "image"],
        [cardFaceUrl, "image"]
    ].forEach(([url, as, type]) => {
        if (!url) return;
        addPreloadHint(url, as, type);
        warmBrowserCache(url);
    });
    warmSceneModule()
        .catch(error => {
            assetsWarmed = false;
            sceneFailed = true;
            setFallbackActive(pageIsActive(), "fallback-error");
            console.warn("Lanyard scene failed to preload.", error);
        });
}

function addPreloadHint(href, as, type) {
    const exists = Array.from(document.querySelectorAll('link[rel="preload"]')).some(link => link.getAttribute("href") === href);
    if (!href || exists) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = href;
    link.as = as;
    if (type) link.type = type;
    if (as === "fetch" || as === "image") link.crossOrigin = "anonymous";
    document.head.appendChild(link);
}

function warmBrowserCache(url) {
    if (!url || !window.fetch) return;
    window.fetch(url, { cache: "force-cache" }).catch(() => {});
}

function shouldUseMobileFallback() {
    return mobileFallbackQuery.matches || touchFallbackQuery.matches || mobileDeviceQuery.test(navigator.userAgent);
}

function fallbackElement() {
    return document.querySelector(".lanyard-mobile-fallback");
}

function loadFallbackCardFace() {
    const image = fallbackElement()?.querySelector(".lanyard-mobile-card img");
    if (!image || image.src) return;
    const src = image.dataset.src || assetUrls().cardFaceUrl;
    if (src) image.src = src;
}

function setFallbackActive(active, readyState = "fallback") {
    page?.classList.toggle("use-lanyard-fallback", !!active);
    if (!active) return;
    loadFallbackCardFace();
    if (mount) mount.dataset.lanyardReady = readyState;
}

function fallbackIsActive() {
    return shouldUseMobileFallback() || page?.classList.contains("use-lanyard-fallback");
}

function returnToFirstPage(delay = 0) {
    const token = ++fallbackReturnToken;
    if (fallbackReturnFrame) {
        cancelAnimationFrame(fallbackReturnFrame);
        fallbackReturnFrame = 0;
    }
    window.setTimeout(() => {
        if (token !== fallbackReturnToken) return;
        document.body.classList.remove("smile-cursor");
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        const previousScrollSnapType = root.style.scrollSnapType;
        const startY = window.scrollY;
        const duration = 760;
        const startTime = performance.now();
        const smoothStep = t => t * t * t * (t * (t * 6 - 15) + 10);

        root.style.scrollBehavior = "auto";
        root.style.scrollSnapType = "none";

        function restoreScrollStyles() {
            root.style.scrollBehavior = previousScrollBehavior;
            root.style.scrollSnapType = previousScrollSnapType;
            page?.classList.remove("active");
            if (mount) mount.dataset.lanyardReady = "idle";
            fallbackReturnFrame = 0;
            window.dispatchEvent(new Event("scroll"));
        }

        function step(now) {
            if (token !== fallbackReturnToken) return;
            const t = Math.min(1, (now - startTime) / duration);
            window.scrollTo(0, Math.max(0, startY * (1 - smoothStep(t))));
            if (t < 1 && window.scrollY > 0) {
                fallbackReturnFrame = requestAnimationFrame(step);
            } else {
                window.scrollTo(0, 0);
                requestAnimationFrame(restoreScrollStyles);
            }
        }

        fallbackReturnFrame = requestAnimationFrame(step);
    }, delay);
}

function setupFallbackCard() {
    const fallback = fallbackElement();
    const card = fallback?.querySelector(".lanyard-mobile-card");
    if (!fallback || !card || fallback.dataset.bound === "true") return;
    fallback.dataset.bound = "true";

    let dragging = false;
    let startX = 0;
    let startY = 0;

    function release(event) {
        if (!dragging) return;
        dragging = false;
        try {
            card.releasePointerCapture(event.pointerId);
        } catch {}
        fallback.classList.remove("is-dragging");
        fallback.style.removeProperty("--drag-x");
        fallback.style.removeProperty("--drag-y");
        fallback.style.removeProperty("--drag-r");
        fallback.style.removeProperty("--clip-x");
        fallback.style.removeProperty("--clip-y");
        fallback.classList.add("is-returning");
        returnToFirstPage(240);
        window.setTimeout(() => fallback.classList.remove("is-returning"), 820);
    }

    card.addEventListener("pointerdown", event => {
        if (!fallbackIsActive() || !pageIsActive()) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        fallback.classList.remove("is-returning");
        fallback.classList.add("is-dragging");
        card.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    card.addEventListener("pointermove", event => {
        if (!dragging) return;
        const dx = Math.max(-46, Math.min(46, event.clientX - startX));
        const dy = Math.max(-52, Math.min(46, event.clientY - startY));
        fallback.style.setProperty("--drag-x", `${dx}px`);
        fallback.style.setProperty("--drag-y", `${dy}px`);
        fallback.style.setProperty("--drag-r", `${dx * 0.03}deg`);
        fallback.style.setProperty("--clip-x", `${dx * 0.35}px`);
        fallback.style.setProperty("--clip-y", `${dy * 0.18}px`);
    });

    card.addEventListener("pointerup", release);
    card.addEventListener("pointercancel", release);
}

async function mountScene() {
    if (!mount || unmountScene || loadingScene) return;
    loadingScene = true;
    const token = ++sceneLoadToken;
    clearTimeout(sceneLoadTimeout);
    sceneLoadTimeout = window.setTimeout(() => {
        if (loadingScene && token === sceneLoadToken && pageIsActive()) setFallbackActive(true, "fallback-loading");
    }, 2200);
    try {
        const scene = await warmSceneModule();
        scene.preloadLanyard?.(mount);
        if (!pageIsActive() || unmountScene) return;
        unmountScene = scene.mountLanyard(mount);
        sceneFailed = false;
        setFallbackActive(false);
        mount.dataset.lanyardReady = "true";
    } catch (error) {
        sceneFailed = true;
        console.warn("Lanyard scene failed to load.", error);
        mount.dataset.lanyardReady = "error";
        setFallbackActive(pageIsActive(), "fallback-error");
    } finally {
        clearTimeout(sceneLoadTimeout);
        loadingScene = false;
    }
}

function stopScene() {
    if (!unmountScene) return;
    unmountScene();
    unmountScene = null;
    if (mount) {
        mount.dataset.lanyardReady = "idle";
        mount.replaceChildren();
    }
}

function syncScene() {
    if (shouldUseMobileFallback()) {
        stopScene();
        setFallbackActive(pageIsActive(), pageIsActive() ? "mobile-fallback" : "idle");
        if (!pageIsActive()) setFallbackActive(false);
        return;
    }
    if (sceneFailed) {
        stopScene();
        setFallbackActive(pageIsActive(), pageIsActive() ? "fallback-error" : "idle");
        if (!pageIsActive()) setFallbackActive(false);
        return;
    }
    if (window.scrollY > window.innerHeight * 1.7) warmSceneAssets();
    if (pageIsActive()) mountScene();
    else {
        stopScene();
        setFallbackActive(false);
    }
}

function watchMediaQuery(query) {
    if (query.addEventListener) query.addEventListener("change", syncScene);
    else query.addListener?.(syncScene);
}

if (mount) {
    setupFallbackCard();

    if (page) {
        new MutationObserver(syncScene).observe(page, {
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    window.addEventListener("scroll", () => {
        syncScene();
    }, { passive: true });

    window.addEventListener("resize", syncScene, { passive: true });
    watchMediaQuery(mobileFallbackQuery);
    watchMediaQuery(touchFallbackQuery);
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopScene();
        else syncScene();
    });

    const requestIdle = window.requestIdleCallback?.bind(window) || (callback => window.setTimeout(callback, 1600));
    window.addEventListener("load", () => {
        if (!shouldUseMobileFallback()) requestIdle(warmSceneAssets, { timeout: 4200 });
    }, { once: true });

    requestAnimationFrame(syncScene);
}
