(() => {
  const d = document, cache = new Map(), origin = location.origin;
  const keyFor = (path) => path.replace(/\/$/, "") || "/";
  const focused = () => d.documentElement.dataset.routeView === "focused";
  const primaryArticle = () => d.querySelector("main article.medical-guide");
  let homeSource, homeState, readerLoaded = false, expansion, ticket = 0;
  let committedPath = keyFor(location.pathname);

  // Read the current visible region without measuring every deferred source ID.
  // Headings keep their authored IDs when primary/context nodes are rebuilt.
  const captureReadingAnchor = () => {
    const root = d.querySelector("[data-guide-reader]") || primaryArticle();
    if (!root || !d.elementFromPoint) return null;
    let visible;
    for (const y of [Math.min(240, window.innerHeight * .25), Math.min(80, window.innerHeight * .1), 24]) {
      for (const fraction of [.5, .35, .65]) {
        const x = window.innerWidth * fraction, hit = d.elementFromPoint(x, y);
        if (!hit || !root.contains(hit) || hit.closest("[data-route-context],#guide-search")) continue;
        const caret = d.caretRangeFromPoint?.(x, y)?.startContainer;
        const parent = caret?.nodeType === 3 ? caret.parentElement : null;
        const candidate = parent && root.contains(parent) ? parent : hit;
        if (candidate && root.contains(candidate)) { visible = candidate; break; }
      }
      if (visible) break;
    }
    if (!visible) return null;
    let anchor = visible.closest("[id]");
    if (!anchor || !root.contains(anchor) || !anchor.matches("h1,h2,h3,h4,h5,h6,p,li,figcaption,video,table,td,th")) {
      const headings = root.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]");
      anchor = [...headings].reverse().find((node) => !node.closest("[data-route-context]") &&
        (node.contains(visible) || Boolean(node.compareDocumentPosition(visible) & 4)));
    }
    if (!anchor || !root.contains(anchor) || anchor.closest("[data-route-context],#guide-search") || /^rc\d+$/.test(anchor.id)) return null;
    const top = anchor.getBoundingClientRect().top;
    return Number.isFinite(top) ? { id: anchor.id, top } : null;
  };
  let scrollPaused = true, scrollGeneration = 0, scrollTimer, lastScrollWrite = -Infinity, entrySequence = 0;
  const settledPositions = new Map();
  const rememberPosition = () => {
    const previous = window.history.state?.__completeGuideScroll;
    const position = { x: window.scrollX, y: window.scrollY,
      entry: typeof previous?.entry === "string" ? previous.entry : `${performance.timeOrigin}-${++entrySequence}` };
    const anchor = captureReadingAnchor();
    if (anchor) position.anchor = anchor;
    settledPositions.set(position.entry, position);
    if (settledPositions.size > 100) settledPositions.delete(settledPositions.keys().next().value);
    return position;
  };
  window.readGuideScrollState = () => {
    const saved = window.history.state?.__completeGuideScroll;
    return settledPositions.get(saved?.entry) || saved;
  };
  // A focused entry can be shorter than its saved complete-reader position.
  window.saveGuideScrollState = () => {
    if (!readerLoaded || keyFor(location.pathname) !== committedPath) return;
    const previous = window.history.state;
    const position = rememberPosition(), anchor = position.anchor;
    const saved = previous?.__completeGuideScroll;
    if (saved?.entry === position.entry && saved?.x === position.x && saved?.y === position.y &&
      saved?.anchor?.id === anchor?.id && saved?.anchor?.top === anchor?.top) return;
    try {
      window.history.replaceState({
        ...(previous && typeof previous === "object" ? previous : {}),
        __completeGuideScroll: position,
      }, "");
      lastScrollWrite = performance.now();
    } catch { /* Native history remains usable if the browser refuses a write. */ }
  };
  const scheduleScrollState = () => {
    clearTimeout(scrollTimer);
    if (scrollPaused) return;
    const generation = scrollGeneration;
    scrollTimer = setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (scrollPaused || generation !== scrollGeneration || !readerLoaded || keyFor(location.pathname) !== committedPath) return;
        rememberPosition();
        const delay = 500 - (performance.now() - lastScrollWrite);
        if (delay <= 0) window.saveGuideScrollState();
        else scrollTimer = setTimeout(() => {
          if (!scrollPaused && generation === scrollGeneration) window.saveGuideScrollState();
        }, delay);
      }));
    }, 120);
  };
  window.pauseGuideScrollState = () => {
    clearTimeout(scrollTimer); scrollPaused = true;
    return ++scrollGeneration;
  };
  window.resumeGuideScrollState = (generation) => {
    if (generation !== scrollGeneration) return;
    scrollPaused = false; window.saveGuideScrollState();
  };
  window.addEventListener("scroll", scheduleScrollState, { passive: true });
  window.addEventListener("popstate", window.pauseGuideScrollState);
  window.addEventListener("pagehide", () => { if (!scrollPaused) window.saveGuideScrollState(); });
  const fetchHtml = async (path) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, {
        credentials: "same-origin", headers: { Accept: "text/html" }, signal: controller.signal,
      });
      if (!response.ok) throw new Error("Page unavailable");
      return await response.text();
    } finally { clearTimeout(timeout); }
  };
  const snapshot = (doc) => {
    const article = doc.querySelector("article.medical-guide");
    const scope = doc.getElementById("guide-reader-scope");
    return {
      title: doc.title,
      lang: doc.documentElement.getAttribute("lang"),
      dir: doc.documentElement.getAttribute("dir"),
      article: article?.cloneNode(true),
      sourceSignature: doc.head.querySelector('meta[name="guide-source-signature"]')?.getAttribute("content"),
      scope: scope ? JSON.parse(scope.textContent) : null,
      sourceMarker: doc.head.querySelector('meta[name="guide-source-signature"]')?.cloneNode(true),
      scopeScript: scope?.cloneNode(true),
      metas: [...doc.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map((node) => node.cloneNode(true)),
      canonical: doc.head.querySelector('link[rel="canonical"]')?.cloneNode(true),
      alternates: [...doc.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => node.cloneNode(true)),
      scripts: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => node.cloneNode(true)),
    };
  };
  const initialArticle = primaryArticle();
  initialArticle?.setAttribute("data-guide-primary", "");
  if (initialArticle) for (const attr of ["lang", "dir"]) {
    const value = initialArticle.getAttribute(attr) || d.documentElement.getAttribute(attr);
    if (value) initialArticle.setAttribute(attr, value);
  }
  const initialState = snapshot(d);
  const canonicalOrigin = new URL(initialState.canonical?.getAttribute("href") || location.href, origin).origin;
  const isPageDocument = (doc, path) => {
    const canonical = doc.head.querySelector('link[rel="canonical"]');
    if (!canonical || !doc.querySelector("article.medical-guide")) return false;
    try {
      const url = new URL(canonical.getAttribute("href"), canonicalOrigin);
      return url.origin === canonicalOrigin && keyFor(url.pathname) === path && !url.search && !url.hash;
    } catch { return false; }
  };
  cache.set(keyFor(location.pathname), initialState);
  if (!focused() && initialArticle) {
    homeState = initialState;
    homeSource = homeState.article;
    readerLoaded = true;
  }

  const point = (root, value) => {
    if (!value || !Array.isArray(value.path) || value.path.length > 64 ||
      !Number.isInteger(value.offset) || value.offset < 0) throw new Error("Invalid guide boundary");
    let node = root;
    for (const index of value.path) {
      if (!Number.isInteger(index) || index < 0 || !node.childNodes[index])
        throw new Error("Missing guide boundary");
      node = node.childNodes[index];
    }
    const length = node.nodeType === 3 || node.nodeType === 8 ? node.data.length : node.childNodes.length;
    if (value.offset > length) throw new Error("Invalid guide boundary offset");
    return { node, offset: value.offset };
  };
  const partition = (primary, state) => {
    const scope = state.scope;
    if (!homeSource || !scope || scope.schemaVersion !== 1 || !scope.sourceSignature ||
      scope.sourceSignature !== homeState.sourceSignature || state.sourceSignature !== homeState.sourceSignature ||
      !Array.isArray(scope.ranges) || !scope.ranges.length)
      throw new Error("Guide source changed");
    const full = homeSource.cloneNode(true);
    // Resolve every path against the intact source, including inert scripts,
    // whitespace and comments, before any live Range deletes adjust its tree.
    const ranges = scope.ranges.map(({ start, end }) => {
      const first = point(full, start), last = point(full, end), range = d.createRange();
      range.setStart(first.node, first.offset);
      range.setEnd(last.node, last.offset);
      if (range.collapsed) throw new Error("Empty guide boundary");
      return range;
    });
    for (let index = 1; index < ranges.length; index++) {
      const previous = ranges[index - 1].cloneRange(), next = ranges[index].cloneRange();
      previous.collapse(false); next.collapse(true);
      if (previous.compareBoundaryPoints(0, next) > 0) throw new Error("Overlapping guide boundaries");
    }
    const insertion = point(full, scope.insertion), anchor = d.createRange();
    anchor.setStart(insertion.node, insertion.offset); anchor.collapse(true);
    for (const range of [...ranges].reverse()) range.deleteContents();
    const prefix = d.createRange();
    prefix.setStart(full, 0); prefix.setEnd(anchor.startContainer, anchor.startOffset);
    const before = prefix.extractContents(), after = d.createDocumentFragment();
    after.append(...full.childNodes);
    const seen = new Set([...primary.querySelectorAll("[id]")].map((node) => node.id));
    if (primary.id) seen.add(primary.id);
    for (const fragment of [before, after]) {
      // Context is visible source content, never another page's discovery graph.
      for (const script of fragment.querySelectorAll("script")) script.remove();
      for (const image of fragment.querySelectorAll("img")) {
        image.setAttribute("loading", "lazy");
        if (image.getAttribute("fetchpriority") === "high") image.setAttribute("fetchpriority", "auto");
      }
      for (const node of fragment.querySelectorAll("[id]")) {
        if (seen.has(node.id)) node.removeAttribute("id");
        else seen.add(node.id);
      }
      // The focused resource owns the reader's sole H1.
      for (const heading of fragment.querySelectorAll("h1")) {
        const replacement = d.createElement("h2");
        for (const attr of heading.attributes) replacement.setAttribute(attr.name, attr.value);
        replacement.append(...heading.childNodes); heading.replaceWith(replacement);
      }
    }
    return { before, after };
  };
  const readingAnchor = () => {
    const anchor = captureReadingAnchor();
    return anchor ? { id: anchor.id, rect: { top: anchor.top } } : null;
  };
  const restoreAnchor = (position) => {
    const anchor = d.getElementById(position.id);
    if (!anchor) return;
    anchor.closest(".render-chunk")?.classList.add("is-target-chunk");
    for (let parent = anchor; parent; parent = parent.parentElement)
      if (parent.localName === "details") parent.open = true;
    window.scrollBy({ top: anchor.getBoundingClientRect().top - position.rect.top, behavior: "instant" });
  };
  const reusePlayers = (roots, players) => {
    for (const root of roots) for (const video of root.querySelectorAll("video[id]")) {
      const existing = players.get(video.id);
      if (existing) { video.replaceWith(existing); players.delete(video.id); }
    }
  };
  const prepareReader = (state, path, preservePrimary) => {
    if (!state.article || !primaryArticle() || !d.getElementById("main-content"))
      throw new Error("Reader unavailable");
    const candidate = preservePrimary ? primaryArticle() : state.article.cloneNode(true);
    return { candidate, context: path === "/" ? null : partition(candidate, state) };
  };
  const commitReader = ({ candidate, context }, path, preservePrimary = false) => {
    const article = primaryArticle(), main = d.getElementById("main-content");
    const oldWrapper = d.querySelector("[data-guide-reader]");
    const players = new Map([...d.querySelectorAll("video[id]")].map((video) => [video.id, video]));
    const playing = [...players.values()].filter((video) => !video.paused);
    const search = d.getElementById("guide-search");
    const searchFocus = search?.contains(d.activeElement) ? d.activeElement : null;
    const openDetails = new Set([...d.querySelectorAll("details[id][open]")].map((node) => node.id));
    if (!preservePrimary) {
      reusePlayers([candidate], players);
      for (const script of candidate.querySelectorAll("script")) script.remove();
      for (const attr of [...article.attributes]) article.removeAttribute(attr.name);
      for (const attr of candidate.attributes) article.setAttribute(attr.name, attr.value);
      article.replaceChildren(...candidate.childNodes);
    } else {
      for (const video of article.querySelectorAll("video[id]")) players.delete(video.id);
    }
    article.setAttribute("data-guide-primary", "");
    if (path === "/") {
      if (oldWrapper) { oldWrapper.before(main); oldWrapper.remove(); }
    } else {
      reusePlayers([context.before, context.after], players);
      const wrapper = d.createElement("div");
      wrapper.className = "guide-reader"; wrapper.setAttribute("data-guide-reader", "");
      for (const attr of ["lang", "dir"]) {
        const value = homeState.article.getAttribute(attr) || homeState[attr];
        if (value) wrapper.setAttribute(attr, value);
      }
      const aside = (fragment, side) => {
        const node = d.createElement("aside");
        node.className = "medical-guide guide-context";
        node.setAttribute("data-guide-context", side);
        node.setAttribute("aria-label", side === "before" ? "بخش‌های پیشین راهنمای کامل" : "بخش‌های بعدی راهنمای کامل");
        // A split section may retain a label whose heading is now in main.
        // Name that partial region with its context, rather than announcing
        // several different landmarks as the same complete clinical section.
        for (const section of fragment.querySelectorAll("section[aria-labelledby]")) {
          const ids = section.getAttribute("aria-labelledby").split(/\s+/).filter(Boolean);
          if (ids.some((id) => section.querySelector('[id="' + CSS.escape(id) + '"]'))) continue;
          const label = ids.map((id) => homeSource.querySelector('[id="' + CSS.escape(id) + '"]')?.textContent?.trim())
            .filter(Boolean).join(" ");
          if (label) {
            section.setAttribute("aria-label", label + " — " + node.getAttribute("aria-label"));
            section.removeAttribute("aria-labelledby");
          }
        }
        for (const attr of ["lang", "dir"]) {
          const value = wrapper.getAttribute(attr);
          if (value) node.setAttribute(attr, value);
        }
        node.append(fragment); return node;
      };
      if (oldWrapper) oldWrapper.before(wrapper); else main.before(wrapper);
      wrapper.append(aside(context.before, "before"), main, aside(context.after, "after"));
      oldWrapper?.remove();
    }
    // Search owns event listeners and an active query. Move that live subtree
    // to its source launcher instead of replacing it with an inert clone.
    if (search) {
      for (const clone of d.querySelectorAll("#guide-search")) if (clone !== search) clone.remove();
      const launcher = d.querySelector("[data-guide-search-open]");
      if (launcher) launcher.replaceWith(search);
      else if (!search.isConnected) main.insertBefore(search, article);
      if (searchFocus && d.activeElement !== searchFocus) searchFocus.focus({ preventScroll: true });
    }
    for (const video of playing) if (video.isConnected && video.paused) video.play().catch(() => {});
    for (const node of d.querySelectorAll("details[id]")) if (openDetails.has(node.id)) node.open = true;
    readerLoaded = true;
    delete d.documentElement.dataset.routeView;
    for (const node of d.querySelectorAll("[data-guide-expand],[data-guide-expand-status]")) node.remove();
  };
  const commitMetadata = (state) => {
    d.title = state.title;
    for (const attr of ["lang", "dir"]) if (state[attr]) {
      d.documentElement.setAttribute(attr, state[attr]);
      d.body.setAttribute(attr, state[attr]);
    }
    for (const node of d.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"],meta[name="guide-source-signature"],#guide-reader-scope,link[rel="canonical"],link[rel="alternate"][hreflang]')) node.remove();
    for (const node of d.querySelectorAll('script[type="application/ld+json"]')) node.remove();
    for (const node of [...state.metas, state.sourceMarker, state.scopeScript, state.canonical, ...state.alternates, ...state.scripts].filter(Boolean))
      d.head.append(node.cloneNode(true));
  };
  window.syncGuidePageState = async (path) => {
    const key = keyFor(path), current = ++ticket;
    try {
      if (keyFor(location.pathname) !== key) return false;
      if (readerLoaded && key === committedPath) return true;
      if (!cache.has(key)) {
        const doc = new DOMParser().parseFromString(await fetchHtml(key), "text/html");
        if (!isPageDocument(doc, key)) return false;
        cache.set(key, snapshot(doc));
      }
      if (current !== ticket || keyFor(location.pathname) !== key) return false;
      if (!readerLoaded && !await window.expandCompleteGuide()) return false;
      if (current !== ticket || keyFor(location.pathname) !== key) return false;
      // Fragment and video-time history entries share the same primary body.
      // Preserve its live disclosures, focus and native restoration geometry.
      if (key === committedPath) return true;
      const state = cache.get(key), prepared = prepareReader(state, key, false);
      commitReader(prepared, key);
      commitMetadata(state);
      committedPath = key;
      d.dispatchEvent(new CustomEvent("guide:primary-changed"));
      return true;
    } catch { return false; }
  };
  window.expandCompleteGuide = () => {
    if (readerLoaded) return Promise.resolve(true);
    if (expansion) return expansion;
    const current = primaryArticle(), control = d.querySelector("[data-guide-expand]");
    const status = d.querySelector("[data-guide-expand-status]");
    current?.setAttribute("aria-busy", "true");
    if (status) status.textContent = control?.getAttribute("data-loading") || "در حال بارگذاری راهنمای کامل…";
    expansion = (async () => {
      try {
        const home = new DOMParser().parseFromString(await fetchHtml("/"), "text/html");
        const full = home.querySelector("article.medical-guide");
        if (!full || !current || !isPageDocument(home, "/")) throw new Error("Guide unavailable");
        homeState = snapshot(home); homeSource = homeState.article;
        cache.set("/", homeState);
        const path = committedPath, state = cache.get(path);
        const prepared = prepareReader(state, path, true);
        const position = window.completeGuideInteraction && readingAnchor();
        commitReader(prepared, path, true);
        if (position) restoreAnchor(position);
        d.dispatchEvent(new CustomEvent("guide:primary-changed"));
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
    d.body.append(link); link.click(); link.remove();
  };
  d.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    if (link.hasAttribute("data-guide-expand")) {
      event.preventDefault(); window.expandCompleteGuide(); return;
    }
    if (readerLoaded) return;
    const url = new URL(link.href);
    if (![origin, d.querySelector("#guide-search")?.dataset.canonicalOrigin].includes(url.origin)) return;
    if (/\.[A-Za-z0-9]+\/?$/.test(url.pathname)) return;
    if (url.hash && keyFor(url.pathname) === keyFor(location.pathname)) {
      try { if (d.getElementById(decodeURIComponent(url.hash.slice(1)))) return; } catch { return; }
    }
    event.preventDefault();
    window.expandCompleteGuide().then(async (ready) => {
      if (ready) { await window.completeGuideReady; replay(url); }
      else location.assign(url.href);
    });
  }, true);
  d.addEventListener("focusin", (event) => {
    if (event.target.id === "guide-search-input") window.expandCompleteGuide();
  });
  const interactionTypes = ["pointerdown", "wheel", "keydown"];
  const recordInteraction = () => { window.completeGuideInteraction = true; };
  if (focused()) for (const type of interactionTypes)
    window.addEventListener(type, recordInteraction, { once: true, passive: true });
  window.completeGuideReady = window.expandCompleteGuide().finally(() => {
    for (const type of interactionTypes) window.removeEventListener(type, recordInteraction);
  });
})();
