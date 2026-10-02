(() => {
  const d = document, cache = new Map(), origin = location.origin;
  const keyFor = (path) => path.replace(/\/$/, "") || "/";
  const focused = () => d.documentElement.dataset.routeView === "focused";
  // A stalled response must not leave the focused reader and its controls
  // waiting forever. Keep the limit active until the HTML body is complete.
  const fetchHtml = async (path) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, {
        credentials: "same-origin", headers: { Accept: "text/html" }, signal: controller.signal,
      });
      if (!response.ok) throw new Error("Page unavailable");
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  };
  const snapshot = (doc) => ({
    title: doc.title,
    lang: doc.documentElement.getAttribute("lang"),
    dir: doc.documentElement.getAttribute("dir"),
    articleLabel: doc.querySelector("article.medical-guide")?.getAttribute("aria-labelledby"),
    articleLang: doc.querySelector("article.medical-guide")?.getAttribute("lang"),
    articleDir: doc.querySelector("article.medical-guide")?.getAttribute("dir"),
    metas: [...doc.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map((node) => node.cloneNode(true)),
    canonical: doc.head.querySelector('link[rel="canonical"]')?.cloneNode(true),
    alternates: [...doc.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => node.cloneNode(true)),
    scripts: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.cloneNode(true)),
    context: doc.querySelector("[data-route-context]")?.cloneNode(true),
  });
  // The complete guide retains its authored language even when the current
  // route's metadata and context use another language.
  const initialArticle = d.querySelector("article.medical-guide");
  if (!focused() && initialArticle) for (const attr of ["lang", "dir"]) {
    const value = initialArticle.getAttribute(attr) || d.documentElement.getAttribute(attr);
    if (value) initialArticle.setAttribute(attr, value);
  }
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
        const doc = new DOMParser().parseFromString(await fetchHtml(key), "text/html");
        if (!doc.head.querySelector('link[rel="canonical"]') || !doc.querySelector('article.medical-guide')) return;
        cache.set(key, snapshot(doc));
      }
      if (current !== ticket || keyFor(location.pathname) !== key) return;
      const state = cache.get(key);
      d.title = state.title;
      if (state.lang) d.documentElement.setAttribute("lang", state.lang);
      if (state.dir) d.documentElement.setAttribute("dir", state.dir);
      for (const node of d.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"],link[rel="canonical"],link[rel="alternate"][hreflang]')) node.remove();
      for (const node of d.querySelectorAll('script[type="application/ld+json"]')) node.remove();
      for (const node of [...state.metas, state.canonical, ...state.alternates, ...state.scripts].filter(Boolean)) d.head.append(node.cloneNode(true));
      const article = d.querySelector("article.medical-guide");
      d.querySelector("[data-route-context]")?.remove();
      if (state.context) {
        const context = state.context.cloneNode(true);
        if (state.lang && !context.getAttribute("lang")) context.setAttribute("lang", state.lang);
        if (state.dir && !context.getAttribute("dir")) context.setAttribute("dir", state.dir);
        article?.prepend(context);
      }
      if (state.articleLabel) article?.setAttribute("aria-labelledby", state.articleLabel);
      if (focused()) {
        if (state.articleLang || state.lang) article?.setAttribute("lang", state.articleLang || state.lang);
        if (state.articleDir || state.dir) article?.setAttribute("dir", state.articleDir || state.dir);
      }
      removeExpandControls();
    } catch { /* Keep readable content when a metadata request fails. */ }
  };
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
        const home = new DOMParser().parseFromString(await fetchHtml("/"), "text/html");
        const full = home.querySelector("article.medical-guide");
        if (!full || !current || !home.head.querySelector('link[rel="canonical"]')) throw new Error("Guide unavailable");
        cache.set("/", snapshot(home));
        for (const script of full.querySelectorAll("script")) script.remove();
        const readingPosition = window.completeGuideInteraction && [...current.querySelectorAll("[id]")]
          .filter((node) => home.getElementById(node.id))
          .map((node) => ({ id: node.id, rect: node.getBoundingClientRect() }))
          .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight)
          .sort((a, b) => Math.abs(a.rect.top) - Math.abs(b.rect.top))[0];
        // Reuse existing players, preserving a patient's active playback.
        const fullVideos = [...full.querySelectorAll("video[id]")];
        for (const video of current.querySelectorAll("video[id]"))
          fullVideos.find((node) => node.id === video.id)?.replaceWith(video);
        const context = current.querySelector("[data-route-context]");
        for (const attr of ["lang", "dir"]) {
          const contextValue = context?.getAttribute(attr) || d.documentElement.getAttribute(attr);
          if (context && contextValue) context.setAttribute(attr, contextValue);
          const guideValue = full.getAttribute(attr) || home.documentElement.getAttribute(attr);
          if (guideValue) current.setAttribute(attr, guideValue);
        }
        current.replaceChildren(...[context, ...full.childNodes].filter(Boolean));
        delete d.documentElement.dataset.routeView;
        removeExpandControls();
        if (readingPosition) {
          const anchor = d.getElementById(readingPosition.id);
          anchor.closest(".render-chunk")?.classList.add("is-target-chunk");
          for (let parent = anchor.parentElement; parent; parent = parent.parentElement)
            if (parent.localName === "details") parent.open = true;
          window.scrollBy({ top: anchor.getBoundingClientRect().top - readingPosition.rect.top, behavior: "instant" });
        }
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
    window.expandCompleteGuide().then(async (ready) => {
      if (ready) {
        // Initial loading also gates the delegated same-document navigator.
        await window.completeGuideReady;
        replay(url);
      }
      else location.assign(url.href);
    });
  }, true);
  d.addEventListener("focusin", (event) => {
    if (event.target.id === "guide-search-input") window.expandCompleteGuide();
  });
  // Direct URLs enter the same complete reader as home. Wait for its content
  // before resolving the destination, including fragments outside the topic.
  // A reader who starts interacting during the request keeps their position.
  const interactionTypes = ["pointerdown", "wheel", "keydown"];
  const recordInteraction = () => { window.completeGuideInteraction = true; };
  if (focused()) for (const type of interactionTypes)
    window.addEventListener(type, recordInteraction, { once: true, passive: true });
  window.completeGuideReady = window.expandCompleteGuide().finally(() => {
    for (const type of interactionTypes) window.removeEventListener(type, recordInteraction);
  });
})();
