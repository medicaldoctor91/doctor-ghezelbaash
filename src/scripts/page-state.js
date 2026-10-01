(() => {
  const d = document, cache = new Map(), origin = location.origin;
  const keyFor = (path) => path.replace(/\/$/, "") || "/";
  const focused = () => d.documentElement.dataset.routeView === "focused";
  const snapshot = (doc) => ({
    title: doc.title,
    lang: doc.documentElement.getAttribute("lang"),
    dir: doc.documentElement.getAttribute("dir"),
    articleLabel: doc.querySelector("article.medical-guide")?.getAttribute("aria-labelledby"),
    metas: [...doc.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map((node) => node.cloneNode(true)),
    canonical: doc.head.querySelector('link[rel="canonical"]')?.cloneNode(true),
    scripts: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.cloneNode(true)),
    context: doc.querySelector("[data-route-context]")?.cloneNode(true),
  });
  cache.set(keyFor(location.pathname), snapshot(d));
  const removeExpandControls = () => {
    if (focused()) return;
    for (const node of d.querySelectorAll("[data-guide-expand],[data-guide-expand-status]")) node.remove();
  };
  let ticket = 0;
  window.syncGuidePageState = async (path) => {
    const key = keyFor(path), current = ++ticket;
    try {
      if (!cache.has(key)) {
        const response = await fetch(key, { credentials: "same-origin", headers: { Accept: "text/html" } });
        if (!response.ok) return;
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!doc.head.querySelector('link[rel="canonical"]') || !doc.querySelector('article.medical-guide')) return;
        cache.set(key, snapshot(doc));
      }
      if (current !== ticket || keyFor(location.pathname) !== key) return;
      const state = cache.get(key);
      d.title = state.title;
      if (state.lang) d.documentElement.setAttribute("lang", state.lang);
      if (state.dir) d.documentElement.setAttribute("dir", state.dir);
      for (const node of d.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"],link[rel="canonical"]')) node.remove();
      for (const node of d.querySelectorAll('script[type="application/ld+json"]')) node.remove();
      for (const node of [...state.metas, state.canonical, ...state.scripts].filter(Boolean)) d.head.append(node.cloneNode(true));
      d.querySelector("[data-route-context]")?.remove();
      if (state.context) d.querySelector("article.medical-guide")?.prepend(state.context.cloneNode(true));
      if (state.articleLabel) d.querySelector("article.medical-guide")?.setAttribute("aria-labelledby", state.articleLabel);
      removeExpandControls();
    } catch { /* Keep readable content when a metadata request fails. */ }
  };
  // The scoped reader initializes immediately. The complete guide is loaded
  // only after an explicit expansion, topic navigation, or search interaction.
  window.completeGuideReady = Promise.resolve();
  let expansion;
  window.expandCompleteGuide = () => {
    if (!focused()) return Promise.resolve(true);
    if (expansion) return expansion;
    const current = d.querySelector("article.medical-guide");
    const control = d.querySelector("[data-guide-expand]");
    const status = d.querySelector("[data-guide-expand-status]");
    current?.setAttribute("aria-busy", "true");
    if (status) status.textContent = control?.getAttribute("data-loading") || "در حال بارگذاری راهنمای کامل…";
    expansion = (async () => {
      try {
        const response = await fetch("/", { credentials: "same-origin", headers: { Accept: "text/html" } });
        if (!response.ok) throw new Error("Guide unavailable");
        const home = new DOMParser().parseFromString(await response.text(), "text/html");
        const full = home.querySelector("article.medical-guide");
        if (!full || !current || !home.head.querySelector('link[rel="canonical"]')) throw new Error("Guide unavailable");
        cache.set("/", snapshot(home));
        for (const script of full.querySelectorAll("script")) script.remove();
        // Reuse existing players, preserving a patient's active playback.
        const fullVideos = [...full.querySelectorAll("video[id]")];
        for (const video of current.querySelectorAll("video[id]"))
          fullVideos.find((node) => node.id === video.id)?.replaceWith(video);
        const context = current.querySelector("[data-route-context]");
        current.replaceChildren(...[context, ...full.childNodes].filter(Boolean));
        delete d.documentElement.dataset.routeView;
        removeExpandControls();
        d.dispatchEvent(new CustomEvent("guide:expanded"));
        return true;
      } catch {
        if (status) status.textContent = control?.getAttribute("data-error") || "بارگذاری انجام نشد؛ دوباره تلاش کنید.";
        return false;
      } finally {
        current?.removeAttribute("aria-busy");
        expansion = undefined;
      }
    })();
    return expansion;
  };
  const replay = (url) => {
    const link = d.createElement("a");
    link.href = url.pathname + url.search + url.hash;
    d.body.append(link);
    link.click();
    link.remove();
  };
  d.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    if (link.hasAttribute("data-guide-expand")) {
      event.preventDefault();
      window.expandCompleteGuide();
      return;
    }
    if (!focused()) return;
    const url = new URL(link.href);
    if (![origin, d.querySelector("#guide-search")?.dataset.canonicalOrigin].includes(url.origin)) return;
    // File/download links keep their native behavior.
    if (/\.[A-Za-z0-9]+\/?$/.test(url.pathname)) return;
    if (url.hash && keyFor(url.pathname) === keyFor(location.pathname)) {
      try { if (d.getElementById(decodeURIComponent(url.hash.slice(1)))) return; } catch { return; }
    }
    event.preventDefault();
    window.expandCompleteGuide().then((ready) => {
      if (ready) replay(url);
      else location.assign(url.href);
    });
  }, true);
  d.addEventListener("focusin", (event) => {
    if (event.target.id === "guide-search-input") window.expandCompleteGuide();
  });
})();
