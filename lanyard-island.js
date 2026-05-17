const mount = document.getElementById("lanyard-root");
const page = document.getElementById("page4") || mount?.closest(".page4");

let sceneModulePromise = null;
let unmountScene = null;
let loadingScene = false;
let assetsWarmed = false;
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
    sceneModulePromise = import("./lanyard-scene.js?v=20260517-5").catch(error => {
        sceneModulePromise = null;
        throw error;
    });
    return sceneModulePromise;
}

function warmSceneAssets() {
    if (!mount || assetsWarmed) return;
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

function returnToFirstPage(delay = 0) {
    window.setTimeout(() => {
        document.body.classList.remove("smile-cursor");
        const root = document.documentElement;
        const previousScrollBehavior = root.style.scrollBehavior;
        const previousScrollSnapType = root.style.scrollSnapType;
        const startY = window.scrollY;
        const duration = 500;
        const startTime = performance.now();
        const easeOutQuint = t => 1 - Math.pow(1 - t, 5);

        root.style.scrollBehavior = "auto";
        root.style.scrollSnapType = "none";

        function restoreScrollStyles() {
            root.style.scrollBehavior = previousScrollBehavior;
            root.style.scrollSnapType = previousScrollSnapType;
        }

        function step(now) {
            const t = Math.min(1, (now - startTime) / duration);
            window.scrollTo(0, Math.max(0, startY * (1 - easeOutQuint(t))));
            if (t < 1 && window.scrollY > 0) {
                requestAnimationFrame(step);
            } else {
                window.scrollTo(0, 0);
                requestAnimationFrame(restoreScrollStyles);
            }
        }

        requestAnimationFrame(step);
    }, delay);
}

function setupMobileFallback() {
    const fallback = document.querySelector(".lanyard-mobile-fallback");
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
        card.style.transform = "";
        fallback.classList.add("is-returning");
        returnToFirstPage(240);
        window.setTimeout(() => fallback.classList.remove("is-returning"), 820);
    }

    card.addEventListener("pointerdown", event => {
        if (!shouldUseMobileFallback() || !pageIsActive()) return;
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        fallback.classList.remove("is-returning");
        card.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    card.addEventListener("pointermove", event => {
        if (!dragging) return;
        const dx = Math.max(-95, Math.min(95, event.clientX - startX));
        const dy = Math.max(-115, Math.min(90, event.clientY - startY));
        card.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${dx * 0.045}deg)`;
    });

    card.addEventListener("pointerup", release);
    card.addEventListener("pointercancel", release);
}

async function mountScene() {
    if (!mount || unmountScene || loadingScene) return;
    loadingScene = true;
    try {
        const scene = await warmSceneModule();
        scene.preloadLanyard?.(mount);
        if (!pageIsActive() || unmountScene) return;
        unmountScene = scene.mountLanyard(mount);
        mount.dataset.lanyardReady = "true";
    } catch (error) {
        console.warn("Lanyard scene failed to load.", error);
        mount.dataset.lanyardReady = "error";
    } finally {
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
        if (mount) mount.dataset.lanyardReady = pageIsActive() ? "mobile-fallback" : "idle";
        return;
    }
    if (window.scrollY > window.innerHeight * 1.7) warmSceneAssets();
    if (pageIsActive()) mountScene();
    else stopScene();
}

function watchMediaQuery(query) {
    if (query.addEventListener) query.addEventListener("change", syncScene);
    else query.addListener?.(syncScene);
}

if (mount) {
    setupMobileFallback();

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
        requestIdle(warmSceneAssets, { timeout: 4200 });
    }, { once: true });

    requestAnimationFrame(syncScene);
}
