(() => {
  const d = document, cache = new Map(), origin = location.origin;
  const snapshot = (doc) => ({
    title: doc.title,
    articleLabel: doc.querySelector("article.medical-guide")?.getAttribute("aria-labelledby"),
    metas: [...doc.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map((node) => node.cloneNode(true)),
    canonical: doc.head.querySelector('link[rel="canonical"]')?.cloneNode(true),
    scripts: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.cloneNode(true)),
    context: doc.querySelector("[data-route-context]")?.cloneNode(true),
  });
    const homePath = "/", initialPath = location.pathname.replace(/\/$/, "") || "/";
  let bootstrapPending = d.documentElement.dataset.routeView === "focused";
  if (bootstrapPending) d.addEventListener("click", (event) => {
    if (!bootstrapPending || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href);
    if (url.hash || !/^\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(url.pathname) && url.pathname !== "/") return;
    if (![origin, d.querySelector("#guide-search")?.dataset.canonicalOrigin].includes(url.origin)) return;
    event.preventDefault();
    window.completeGuideReady.then(() => {
      const retry = d.createElement("a");
      retry.href = url.pathname + url.search;
      d.body.append(retry);
      retry.click();
      retry.remove();
    });
  }, true);
  cache.set(initialPath, snapshot(d));
  let ticket = 0;
  window.syncGuidePageState = async (path) => {
    const key = path.replace(/\/$/, "") || "/", current = ++ticket;
    try {
      if (!cache.has(key)) {
        const response = await fetch(key, { credentials: "same-origin", headers: { Accept: "text/html" } });
        if (!response.ok) return;
        const doc = new DOMParser().parseFromString(await response.text(), "text/html");
        if (!doc.head.querySelector('link[rel="canonical"]') || !doc.querySelector('article.medical-guide')) return;
        cache.set(key, snapshot(doc));
      }
      if (current !== ticket || (location.pathname.replace(/\/$/, "") || "/") !== key) return;
      const state = cache.get(key);
      d.title = state.title;
      for (const node of d.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"],link[rel="canonical"]')) node.remove();
      for (const node of d.querySelectorAll('script[type="application/ld+json"]')) node.remove();
      for (const node of [...state.metas, state.canonical, ...state.scripts].filter(Boolean)) d.head.append(node.cloneNode(true));
      d.querySelector("[data-route-context]")?.remove();
      if (state.context) d.querySelector("article.medical-guide")?.prepend(state.context.cloneNode(true));
      if (state.articleLabel) d.querySelector("article.medical-guide")?.setAttribute("aria-labelledby", state.articleLabel);
    } catch { /* Existing readable content and native links remain usable. */ }
  };
  window.completeGuideReady = (async () => {
    if (d.documentElement.dataset.routeView !== "focused") return;
    try {
      const response = await fetch(homePath, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!response.ok) return;
      const home = new DOMParser().parseFromString(await response.text(), "text/html");
      cache.set("/", snapshot(home));
      const full = home.querySelector("article.medical-guide"), current = d.querySelector("article.medical-guide");
      if (!full || !current) return;
      for (const script of full.querySelectorAll("script")) script.remove();
      const context = current.querySelector("[data-route-context]");
      current.replaceChildren(...[context, ...full.childNodes].filter(Boolean));
      delete d.documentElement.dataset.routeView;
    } catch { /* The focused initial document is still complete for its topic. */ }
  })().finally(() => { bootstrapPending = false; });
})();
