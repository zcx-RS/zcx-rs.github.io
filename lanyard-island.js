const mount = document.getElementById("lanyard-root");
const page = document.getElementById("page4") || mount?.closest(".page4");

let sceneModulePromise = null;
let unmountScene = null;
let loadingScene = false;

function pageIsActive() {
    return !!mount && (!page || page.classList.contains("active"));
}

function warmSceneModule() {
    if (!mount || sceneModulePromise) return sceneModulePromise;
    sceneModulePromise = import("./lanyard-scene.js").catch(error => {
        sceneModulePromise = null;
        throw error;
    });
    return sceneModulePromise;
}

async function mountScene() {
    if (!mount || unmountScene || loadingScene) return;
    loadingScene = true;
    try {
        const scene = await warmSceneModule();
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

    requestAnimationFrame(syncScene);
}
