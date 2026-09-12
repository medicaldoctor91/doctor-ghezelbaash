import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Execute the shipped runtime with a small event/DOM fixture. Browser-native
// layout, dialog focus restoration and default navigation also need URL testing.
function fixture(runtime, { modal = true, missingInput = false, hash = "", scrollY = 0 } = {}) {
  let document, serial = 0, aliasNormalizations = 0;
  const frames = new Map(), timers = new Map(), closeEvents = [], queries = new Map();
  class Element {
    constructor(tagName, id = "", classes = []) {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.dataset = {};
      this.attributes = new Map();
      this.children = [];
      this.listeners = new Map();
      this.classes = new Set(classes);
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
        contains: (name) => this.classes.has(name),
      };
      this.textContent = "";
      this.value = "";
      this.writes = 0;
    }
    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) || [];
      listeners.push({ callback, once: options.once });
      this.listeners.set(type, listeners);
    }
    append(child) { child.parent = this; this.children.push(child); }
    replaceChildren() { this.children = []; }
    contains(child) { return child === this || this.children.some((x) => x.contains(child)); }
    querySelectorAll(selector) {
      if (!selector.includes("button") || !selector.includes("input")) return [];
      const found = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (["BUTTON", "INPUT", "A"].includes(child.tagName)) found.push(child);
          walk(child);
        }
      };
      walk(this);
      return found;
    }
    matches(selector) {
      if (selector.startsWith(".")) return this.classes.has(selector.slice(1));
      if (selector === 'a[href^="#"]') return this.tagName === "A" && this.href?.startsWith("#");
      const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
      return attribute ? this.attributes.has(attribute) : false;
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
    setAttribute(name, value) { this.writes++; this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.writes++; this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    set tabIndex(value) { this.setAttribute("tabindex", value); }
    get hash() { return this.href || ""; }
    focus() {
      if (document.activeElement !== this) emit(document.activeElement, "blur");
      document.activeElement = this;
    }
  }
  const body = new Element("body"),
    dialog = new Element("dialog", "guide-search", ["guide-search"]),
    input = new Element("input", "guide-search-input"),
    results = new Element("ol", "guide-search-results"),
    status = new Element("p", "guide-search-status"),
    opener = new Element("button"),
    close = new Element("button"),
    top = new Element("a"),
    section = new Element("section", "botox", ["content-section"]),
    chunk = new Element("div", "", ["render-chunk"]),
    heading = new Element("h3", "botox-heading"),
    physician = new Element("h2", "saeed-ghezelbash"),
    tocLink = new Element("a");
  opener.setAttribute("data-guide-search-open", "");
  close.setAttribute("data-guide-search-close", "");
  top.hidden = true;
  top.dataset.visible = "false";
  heading.textContent = "بوتاکس؛ عضله، دوز و نقطه تزریق";
  physician.textContent = "دکتر سعید قزلباش";
  tocLink.href = "#botox";
  dialog.dataset.entityAliases = Array.from({ length: 25 }, (_, i) => `alias-${i}`).join("|");
  dialog.open = false;
  if (modal) {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => {
      if (!dialog.open) return;
      dialog.open = false;
      // Native dialog.close() queues the close event on a separate task. It may
      // arrive after a result's focus frame, rather than during the click.
      closeEvents.push(() => emit(dialog, "close"));
    };
  }
  for (const x of [dialog, opener, top, section, physician, tocLink]) body.append(x);
  for (const x of [close, input, results, status]) dialog.append(x);
  section.append(chunk);
  chunk.append(heading);
  document = new Element("document");
  document.documentElement = new Element("html");
  document.activeElement = body;
  document.append(body);
  const elements = new Map([dialog, input, results, status, section, heading, physician].map((x) => [x.id, x]));
  document.getElementById = (id) => missingInput && id === input.id ? null : elements.get(id) || null;
  document.createElement = (tagName) => new Element(tagName);
  document.querySelector = (selector) => {
    assert.equal(selector, "[data-quick-actions-top]");
    return top;
  };
  document.querySelectorAll = (selector) => {
    queries.set(selector, (queries.get(selector) || 0) + 1);
    if (selector === "main h2[id],main h3[id],main h4[id]") return [heading, physician];
    if (selector === '#aesthetic-medicine-table-of-contents a[href^="#"]') return [tocLink];
    if (selector === "video[data-poster]") return [];
    throw new Error(`Unexpected query: ${selector}`);
  };
  const windowEvents = new Element("window"),
    context = vm.createContext({
      document,
      location: { hash, search: "" },
      scrollY,
      innerHeight: 800,
      URLSearchParams,
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      requestAnimationFrame: (callback) => { frames.set(++serial, callback); return serial; },
      setTimeout: (callback) => { timers.set(++serial, callback); return serial; },
      clearTimeout: (id) => timers.delete(id),
      recordAliasNormalization: () => aliasNormalizations++,
    });
  context.window = context;
  vm.runInContext(`
    const nativeLowerCase = String.prototype.toLocaleLowerCase;
    String.prototype.toLocaleLowerCase = function (...args) {
      if (/^alias-\\d+$/.test(this)) recordAliasNormalization();
      return nativeLowerCase.apply(this, args);
    };
  `, context);
  function emit(target, type, properties = {}) {
    const event = {
      target, button: 0, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      ...properties,
    };
    for (let node = target; node; node = type === "blur" ? null : node.parent) {
      for (const listener of [...(node.listeners.get(type) || [])]) {
        listener.callback(event);
        if (listener.once) node.listeners.set(type, node.listeners.get(type).filter((x) => x !== listener));
      }
    }
    return event;
  }
  function flushFrames() {
    for (let turn = 0; frames.size; turn++) {
      assert.ok(turn < 20, "Animation frame loop did not settle");
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    }
  }
  function flushTimers() {
    const pending = [...timers.values()];
    timers.clear();
    pending.forEach((callback) => callback());
  }
  function flushCloseEvents() {
    closeEvents.splice(0).forEach((callback) => callback());
  }
  vm.runInContext(runtime, context, { filename: "GuideNavigator.site-runtime.js" });
  return {
    document, context, dialog, input, results, status, opener, close, top, heading,
    chunk, tocLink, body, queries, emit, flushFrames, flushTimers, flushCloseEvents,
    aliases: () => aliasNormalizations,
    windowEvent: (type) => emit(windowEvents, type),
  };
}

export async function guideNavigatorContract() {
  const source = await readFile(new URL("../src/components/GuideNavigator.astro", import.meta.url), "utf8"),
    runtime = source.match(/<script\b[^>]*\bid="site-runtime"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(runtime, "The actual shipped site runtime is required");
  const page = await readFile(new URL("../src/content-source/page.md", import.meta.url), "utf8");
  assert.match(page, /<button\b(?=[^>]*\bdata-guide-search-open\b)(?=[^>]*\btype="button")[^>]*>/);
  const f = fixture(runtime),
    headingQuery = "main h2[id],main h3[id],main h4[id]",
    tocQuery = '#aesthetic-medicine-table-of-contents a[href^="#"]';
  assert.equal(f.aliases(), 0, "Unused search must not normalize aliases");
  assert.equal(f.queries.get(headingQuery) || 0, 0, "Unused search must not scan headings");
  assert.equal(f.queries.get(tocQuery) || 0, 0, "Empty initial hash must not scan TOC links");
  assert.equal(f.emit(f.opener, "click").defaultPrevented, true);
  f.flushFrames();
  assert.equal(f.document.activeElement, f.input);
  const tabForward = f.emit(f.input, "keydown", { key: "Tab" });
  assert.equal(tabForward.defaultPrevented, true, "Tab at the end of the dialog must wrap");
  assert.equal(f.document.activeElement, f.close);
  const tabWithin = f.emit(f.close, "keydown", { key: "Tab" });
  assert.equal(tabWithin.defaultPrevented, false, "native Tab order must remain available inside the dialog");
  f.input.focus();
  assert.equal(f.document.activeElement, f.input);
  f.close.focus();
  const tabBackward = f.emit(f.close, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(tabBackward.defaultPrevented, true, "Shift+Tab at the start must wrap");
  assert.equal(f.document.activeElement, f.input);
  f.input.focus();
  f.input.value = "ب";
  f.emit(f.input, "input");
  assert.equal(f.aliases(), 0, "A too-short query must not build the index");
  f.input.value = "بوتاکس";
  f.emit(f.input, "input");
  assert.equal(f.aliases(), 25);
  const result = f.results.children[0]?.children[0];
  assert.ok(result, "Real heading search must produce a result");
  assert.equal(result.href, "#botox-heading");
  for (let visit = 0; visit < 2; visit++) {
    f.emit(f.opener, "click");
    f.flushFrames();
    assert.equal(f.dialog.open, true);
    const selection = f.emit(result, "click");
    // Exercise both native task orders: a late close event must never reclaim
    // the heading focus, including when choosing a retained result again.
    if (visit === 0) f.flushFrames();
    f.flushCloseEvents();
    f.flushFrames();
    assert.equal(selection.defaultPrevented, false, "Result hash navigation remains native");
    assert.equal(f.dialog.open, false, "Repeated selection of retained result must close dialog");
    assert.equal(f.document.activeElement, f.heading);
    assert.equal(f.heading.getAttribute("tabindex"), "-1");
    f.opener.focus();
    assert.equal(f.heading.hasAttribute("tabindex"), false, "Temporary focusability must be restored");
  }
  f.input.value = "alias-24";
  f.emit(f.input, "input");
  assert.equal(f.results.children[0].children[0].href, "#saeed-ghezelbash");
  assert.equal(f.aliases(), 26, "Only the new query may normalize; cached aliases are reused");
  assert.equal(f.queries.get(headingQuery), 1);
  f.emit(f.opener, "click");
  f.flushFrames();
  for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    f.dialog.open = false;
    assert.equal(f.emit(f.opener, "click", modifier).defaultPrevented, false);
    assert.equal(f.dialog.open, false, "Modified launcher activation must remain native");
    f.dialog.open = true;
    f.emit(f.results.children[0].children[0], "click", modifier);
    assert.equal(f.dialog.open, true, "Modified result activation must preserve current dialog");
  }
  f.emit(f.close, "click");
  assert.equal(f.dialog.open, false);
  f.flushCloseEvents();
  f.flushFrames();
  assert.equal(f.document.activeElement, f.opener, "Dialog close restores launcher focus");
  f.emit(f.opener, "click");
  f.flushFrames();
  const missingResult = f.document.createElement("a");
  missingResult.href = "#missing-heading";
  f.results.append(missingResult);
  f.emit(missingResult, "click");
  f.flushFrames();
  f.flushCloseEvents();
  f.flushFrames();
  assert.equal(f.document.activeElement, f.opener, "A missing result target must preserve opener restoration");
  f.body.focus();
  assert.equal(f.emit(f.document, "keydown", { key: "/" }).defaultPrevented, true);
  f.flushFrames();
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.emit(f.document, "keydown", { key: "/" }).defaultPrevented, false, "Typing must not be intercepted");
  assert.equal(f.emit(f.dialog, "cancel").defaultPrevented, false, "Native Escape/cancel must remain available");
  f.emit(f.dialog, "click");
  assert.equal(f.dialog.open, false, "Backdrop activation closes the dialog");
  f.flushCloseEvents();
  f.context.location.hash = "#botox-heading";
  f.windowEvent("hashchange");
  assert.equal(f.chunk.classList.contains("is-target-chunk"), true);
  assert.equal(f.tocLink.getAttribute("aria-current"), "location");
  f.context.location.hash = "";
  f.windowEvent("hashchange");
  assert.equal(f.chunk.classList.contains("is-target-chunk"), false);
  assert.equal(f.tocLink.hasAttribute("aria-current"), false);
  assert.equal(f.queries.get(tocQuery), 1);
  f.context.location.hash = "#botox-heading";
  f.context.scrollY = 1500;
  f.windowEvent("pageshow");
  f.flushFrames();
  f.flushTimers();
  assert.equal(f.chunk.classList.contains("is-target-chunk"), true);
  assert.equal(f.top.hidden, false, "Restored scroll must reveal the top control");
  assert.equal(f.top.dataset.visible, "true");
  const writes = f.top.writes;
  f.windowEvent("scroll");
  f.flushFrames();
  assert.equal(f.top.writes, writes, "Unchanged top-control state must not rewrite attributes");
  f.context.scrollY = 0;
  f.context.location.hash = "";
  f.windowEvent("pageshow");
  f.flushFrames();
  f.flushTimers();
  assert.equal(f.top.hidden, true);
  assert.equal(f.chunk.classList.contains("is-target-chunk"), false);
  const deep = fixture(runtime, { hash: "#botox-heading", scrollY: 1500 });
  deep.flushFrames();
  assert.equal(deep.tocLink.getAttribute("aria-current"), "location");
  assert.equal(deep.top.hidden, false);
  for (const options of [{ modal: false }, { missingInput: true }]) {
    const fallback = fixture(runtime, options);
    assert.equal(fallback.emit(fallback.opener, "click").defaultPrevented, false, "Unavailable enhancement must preserve TOC navigation");
    assert.equal(fallback.emit(fallback.document, "keydown", { key: "/" }).defaultPrevented, false);
    assert.equal(fallback.dialog.open, false);
  }
  console.log("GUIDE_NAVIGATOR_CONTRACT_PASS");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await guideNavigatorContract();
