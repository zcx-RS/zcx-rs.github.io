const mount = document.getElementById("lanyard-root");
const page = document.getElementById("page4") || mount?.closest(".page4");

let sceneModulePromise = null;
let unmountScene = null;
let loadingScene = false;
let assetsWarmed = false;

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
    sceneModulePromise = import("./lanyard-scene.js?v=20260517-3").catch(error => {
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
    if (window.scrollY > window.innerHeight * 1.7) warmSceneAssets();
    if (pageIsActive()) mountScene();
    else stopScene();
}

if (mount) {
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
