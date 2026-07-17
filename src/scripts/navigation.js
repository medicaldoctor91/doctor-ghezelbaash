(() => {
  const header = document.getElementById('site-header');
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navLinks = [...document.querySelectorAll('.primary-nav a[href^="#"], .quick-nav a[href^="#"]')]
    .filter((link) => link instanceof HTMLAnchorElement);
  const navTargets = [...new Set(navLinks
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter((target) => target instanceof HTMLElement))]
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const offset = () => (header?.getBoundingClientRect().height ?? 0) + 16;

  const updateOffset = () => {
    root.style.setProperty('--sticky-offset', `${offset()}px`);
  };

  /** @param {string} hash */
  const targetForHash = (hash) => {
    if (!hash || hash === '#') return null;
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return null;
    }
  };

  /** @param {HTMLElement} target */
  const revealTarget = (target) => {
    const closedAncestors = [];
    let parent = target.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement && !parent.open) closedAncestors.push(parent);
      parent = parent.parentElement;
    }
    closedAncestors.reverse().forEach((details) => { details.open = true; });
  };

  /** @param {HTMLElement} target */
  const focusTarget = (target) => {
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };

  /** @param {string} hash @param {'push' | 'replace'} mode */
  const setHistory = (hash, mode) => {
    if (location.hash === hash) return;
    const url = new URL(location.href);
    url.hash = hash;
    if (mode === 'replace') history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  };

  /**
   * @param {HTMLElement} target
   * @param {{ historyMode?: 'push' | 'replace' | null, focus?: boolean }} [options]
   */
  const scrollToTarget = (target, { historyMode = null, focus = true } = {}) => {
    revealTarget(target);
    updateOffset();
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset());
    if (historyMode) setHistory(`#${encodeURIComponent(target.id)}`, historyMode);
    window.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    if (focus) focusTarget(target);
  };

  /** @param {() => void} callback */
  const afterLayout = async (callback) => {
    try {
      await document.fonts?.ready;
    } catch {
      // Font failure must not disable navigation.
    }
    requestAnimationFrame(() => requestAnimationFrame(callback));
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
    const target = targetForHash(url.hash);
    if (!target) return;
    event.preventDefault();
    scrollToTarget(target, { historyMode: 'push', focus: true });
  });

  const restoreHash = () => {
    const target = targetForHash(location.hash);
    if (target) afterLayout(() => scrollToTarget(target, { focus: true }));
  };

  window.addEventListener('hashchange', restoreHash);
  window.addEventListener('pageshow', restoreHash);

  let ticking = false;
  const updateCurrentNavigation = () => {
    ticking = false;
    const marker = window.scrollY + offset() + 32;
    /** @type {string | null} */
    let current = null;
    for (const target of navTargets) {
      if (window.scrollY + target.getBoundingClientRect().top <= marker) current = target.id;
    }
    for (const link of navLinks) {
      if (decodeURIComponent(link.hash.slice(1)) === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateCurrentNavigation);
  }, { passive: true });

  updateOffset();
  updateCurrentNavigation();
  if ('ResizeObserver' in window && header) new ResizeObserver(updateOffset).observe(header);
})();
