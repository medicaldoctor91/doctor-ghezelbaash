/** Build one bounded search/anchor inventory from the compiled, original outline. */
export function buildGuideSearchManifest({article, root = article, sourceSignature, resources, htmlIdTargets}) {
  if (!article || !/^[a-f0-9]{64}$/.test(sourceSignature)) throw new Error('Invalid search source');
  const attr = (node, name) => node.attrs?.find(value => value.name === name)?.value;
  const text = node => node.nodeName === '#text' ? node.value :
    ['script','style'].includes(node.tagName) ? '' : (node.childNodes ?? []).map(text).join(' ');
  const clean = node => text(node).replace(/\s+/gu, ' ').trim();
  const elements = [], byId = new Map();
  const visit = node => {
    if (node.tagName) elements.push(node);
    const id = attr(node, 'id');
    if (id) byId.set(id, node);
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(root);
  const anchors = {...htmlIdTargets}, routes = new Set(resources.map(resource => resource.path));
  for (const [id, href] of Object.entries(anchors)) {
    const url = new URL(href, 'https://guide.invalid');
    if (!byId.has(id) || url.origin !== 'https://guide.invalid' || !routes.has(url.pathname) || url.search)
      throw new Error('Invalid search anchor ownership: ' + id);
  }
  const language = node => {
    for (let current = node; current; current = current.parentNode) {
      const lang = attr(current, 'lang');
      if (lang) return lang;
    }
    return 'fa-IR';
  };
  const stack = [], records = [];
  for (const node of elements) {
    const id = attr(node, 'id');
    if (!id || !/^h[1-6]$/.test(node.tagName)) continue;
    const level = Number(node.tagName.slice(1)), title = clean(node), parents = [];
    for (let depth = 1; depth < level; depth++) if (stack[depth]) parents.push(stack[depth]);
    stack[level] = title; stack.length = level + 1;
    const href = attr(node, 'data-canonical-href') || anchors[id] || '/#' + encodeURIComponent(id);
    records.push({id, href, text:title, level, parents, lang:language(node),
      retrievalAlias:attr(node, 'data-retrieval-alias') || '',
      summary:clean(node.parentNode ?? node).slice(0, 220)});
  }
  // Authored media/summary routes can lack a heading in the full source. Their
  // existing label is searchable without promoting synthetic focused H1s.
  for (const resource of resources) {
    if (records.some(record => new URL(record.href, 'https://guide.invalid').pathname === resource.path)) continue;
    const node = byId.get(resource.htmlId);
    if (!node) throw new Error('Missing search route label: ' + resource.path);
    let label = node;
    if (node.tagName === 'video') label = node.parentNode?.childNodes?.find(child => child.tagName === 'figcaption') || node;
    const title = (clean(label) || resource.title || '').slice(0, 240);
    if (!title) throw new Error('Empty search route label: ' + resource.path);
    records.push({id:resource.htmlId, href:resource.path, text:title, level:2, parents:[],
      lang:language(node), retrievalAlias:attr(node, 'data-retrieval-alias') || '', summary:title.slice(0, 220)});
  }
  return {schemaVersion:1, sourceSignature, records, anchors};
}

/** Interface translations share the canonical ranker's multilingual vocabulary. */
export function guideSearchCopy(language, canonicalCopy) {
  const localized = {
    en:{ariaLabel:'Search the aesthetic medicine guide',inputAriaLabel:'Search the guide',placeholder:'Botox, filler, complications or choosing a physician…',initialStatus:'Search the titles and topics of this guide.',resultsAriaLabel:'Guide search results',minimumQuery:'Enter at least two characters to search.',empty:'No results. Try a shorter phrase or a related term.',cleared:'Search cleared.',resultCount:'{count} relevant results.',noResultsStatus:'No results.'},
    ar:{ariaLabel:'البحث في دليل الطب التجميلي',inputAriaLabel:'البحث في الدليل',placeholder:'البوتوكس، الفيلر، المضاعفات أو اختيار الطبيب…',initialStatus:'ابحث في عناوين هذا الدليل وموضوعاته.',resultsAriaLabel:'نتائج البحث في الدليل',minimumQuery:'أدخل حرفين على الأقل للبحث.',empty:'لا توجد نتائج؛ جرّب عبارة أقصر أو مصطلحًا مشابهًا.',cleared:'تم مسح البحث.',resultCount:'تم العثور على {count} نتيجة ذات صلة.',noResultsStatus:'لا توجد نتائج.'},
    ckb:{ariaLabel:'گەڕان لە ڕێبەری پزیشکی جوانکاری',inputAriaLabel:'گەڕان لە ڕێبەرەکە',placeholder:'بۆتۆکس، فیلەر، ئاڵۆزییەکان یان هەڵبژاردنی پزیشک…',initialStatus:'لە ناونیشان و بابەتەکانی ئەم ڕێبەرە بگەڕێ.',resultsAriaLabel:'ئەنجامەکانی گەڕان',minimumQuery:'بۆ گەڕان لانیکەم دوو پیت بنووسە.',empty:'ئەنجامێک نەدۆزرایەوە؛ دەستەواژەیەکی کورتتر یان وشەیەکی نزیک تاقی بکەرەوە.',cleared:'گەڕان سڕایەوە.',resultCount:'{count} ئەنجامی پەیوەندیدار دۆزرایەوە.',noResultsStatus:'ئەنجامێک نەدۆزرایەوە.'},
  }[language.split('-')[0]];
  return {...canonicalCopy,...localized};
}
