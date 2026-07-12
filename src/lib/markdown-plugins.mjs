import GithubSlugger from 'github-slugger';
import { buildSectionRelationships, classifyHeading, getTopicGroup } from '../domain/concepts.mjs';
import { galleryImages, videos } from '../domain/media.mjs';
import { stableAnchorFor } from '../domain/anchor-utils.ts';
import { site } from '../domain/entities.ts';
import { serviceAliasesForHeading } from '../domain/url-architecture.mjs';

function walk(node, callback) {
  callback(node);
  if (Array.isArray(node?.children)) {
    for (const child of node.children) walk(child, callback);
  }
}

function textContent(node) {
  if (node?.type === 'text') return node.value ?? '';
  if (node?.type === 'element' && node.tagName === 'a' && (node.properties?.className ?? []).includes('heading-anchor')) return '';
  return (node?.children ?? []).map(textContent).join('');
}

function isElement(node, tagName) {
  return node?.type === 'element' && node.tagName === tagName;
}

export function rehypeExternalLinks() {
  return (tree) => {
    walk(tree, (node) => {
      if (node?.type !== 'element' || node.tagName !== 'a') return;
      const href = String(node.properties?.href ?? '');
      if (!/^https?:\/\//i.test(href)) return;
      node.properties ??= {};
      node.properties.target = '_blank';
      node.properties.rel = [
        ...(href.replace(/\/+$/, '') === site.instagram.replace(/\/+$/, '') ? ['me'] : []),
        'noopener',
        'noreferrer',
        'external',
      ];
      node.properties.referrerPolicy = 'strict-origin-when-cross-origin';
    });
  };
}

export function rehypeHeadingAnchors() {
  return (tree) => {
    const slugger = new GithubSlugger();
    walk(tree, (node) => {
      if (node?.type !== 'element' || !/^h[1-4]$/.test(node.tagName)) return;
      const title = textContent(node).trim();
      node.properties ??= {};
      const id = stableAnchorFor(title, String(node.properties.id ?? slugger.slug(title)));
      node.properties.id = id;
      const serviceAliases = serviceAliasesForHeading(id);
      if (serviceAliases.length) {
        node.children ??= [];
        node.children.unshift(...serviceAliases.map((entry) => ({
          type: 'element',
          tagName: 'span',
          properties: {
            id: entry.anchor,
            className: ['service-anchor-alias'],
            ariaHidden: 'true',
            dataServiceId: entry.id,
          },
          children: [],
        })));
      }
      const metadata = classifyHeading(title, Number(node.tagName.slice(1)));
      node.properties ??= {};
      node.properties.tabIndex = -1;
      node.properties.dataIntent = metadata.intents.join(' ');
      if (/[؟?]$/.test(title)) node.properties.className = [...(node.properties.className ?? []), 'question-heading'];
      if (node.tagName === 'h1') return;
      node.children ??= [];
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          className: ['heading-anchor'],
          ariaLabel: 'پیوند مستقیم به این بخش',
        },
        children: [{ type: 'text', value: '¶' }],
      });
    });
  };
}

function sourceNode(type, widths) {
  return {
    type: 'element',
    tagName: 'source',
    properties: {
      type: `image/${type}`,
      srcSet: widths.map((width) => `/images/responsive/doctor-portrait-${width}.${type} ${width}w`).join(', '),
      sizes: '(min-width: 900px) 34vw, 100vw',
    },
    children: [],
  };
}

function heroFigure() {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['grid'] },
    children: [
      {
        type: 'element',
        tagName: 'picture',
        properties: { className: ['w-auto', 'h-auto', 'mx-auto', '[grid-area:1/1/2/2]'] },
        children: [
          sourceNode('avif', [480, 768, 1200, 1600]),
          sourceNode('webp', [480, 768, 1200, 1600]),
          {
            type: 'element',
            tagName: 'img',
            properties: {
              src: '/images/responsive/doctor-portrait-1200.jpg',
              srcSet: '/images/responsive/doctor-portrait-1200.jpg 1200w, /images/responsive/doctor-portrait-1600.jpg 1600w',
              sizes: '(min-width: 900px) 34vw, 100vw',
              alt: 'دکتر سعید قزلباش، پزشک زیبایی در کرمانشاه',
              width: 1600,
              height: 1067,
              fetchPriority: 'high',
              decoding: 'async',
              className: ['w-auto', 'h-auto', 'mx-auto', 'rounded-xl', 'object-cover'],
            },
            children: [],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'figcaption',
        properties: {
          className: ['border-main-200', 'border-2', 'rounded-xl', 'p-5', 'bg-[linear-gradient(-125deg,#E9F6FF_0%,#ffffff_100%)]', 'hidden', 'sm:block', 'sm:max-w-[60%]', 'mr-auto', 'mt-auto', '[grid-area:1/1/2/2]', 'text-black'],
        },
        children: [{ type: 'text', value: 'دکتر محمدسعید قزلباش · شماره نظام پزشکی ۱۶۷۴۳۰ · کرمانشاه' }],
      },
    ],
  };
}


function responsivePicture(image) {
  const sizes = '(min-width: 1180px) 22vw, (min-width: 700px) 42vw, 84vw';
  const avif = image.widths.map((width) => `/images/responsive/${image.base}-${width}.avif ${width}w`).join(', ');
  const webp = image.widths.map((width) => `/images/responsive/${image.base}-${width}.webp ${width}w`).join(', ');
  const fallbackWidth = image.width >= 1200 ? 1200 : Math.max(...image.widths);
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['group', 'h-full', 'flex', 'flex-col', 'gap-3', 'border-2', 'border-main-200', 'overflow-hidden', 'rounded-xl'] },
    children: [
      {
        type: 'element',
        tagName: 'picture',
        properties: {},
        children: [
          { type: 'element', tagName: 'source', properties: { type: 'image/avif', srcSet: avif, sizes }, children: [] },
          { type: 'element', tagName: 'source', properties: { type: 'image/webp', srcSet: webp, sizes }, children: [] },
          {
            type: 'element', tagName: 'img',
            properties: {
              src: `/images/responsive/${image.base}-${fallbackWidth}.jpg`,
              alt: image.alt,
              width: image.width,
              height: image.height,
              loading: 'lazy',
              decoding: 'async',
              className: ['aspect-2/1', 'w-full', 'h-auto', 'object-cover'],
            },
            children: [],
          },
        ],
      },
      { type: 'element', tagName: 'figcaption', properties: { className: ['text-center', 'p-4'] }, children: [{ type: 'text', value: image.caption }] },
    ],
  };
}

function videoFigure(video) {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: ['video-facade', 'group', 'h-full', 'flex', 'flex-col', 'gap-3', 'border-2', 'border-main-200', 'overflow-hidden', 'rounded-xl'], id: `video-${video.id}` },
    children: [
      {
        type: 'element',
        tagName: 'div',
        properties: {
          className: ['video-facade-shell'],
        },
        children: [
          { type: 'element', tagName: 'img', properties: { src: video.thumbnail, alt: '', width: video.width, height: video.height, loading: 'lazy', decoding: 'async' }, children: [] },
          {
            type: 'element',
            tagName: 'button',
            properties: {
              type: 'button',
              className: ['video-facade-button'],
              ariaLabel: `پخش ${video.title}`,
              dataVideoSrc: `/videos/${video.file}`,
              dataVideoPoster: video.thumbnail,
              ...(video.chapterTrack ? { dataVideoTrack: video.chapterTrack } : {}),
            },
            children: [{ type: 'text', value: 'پخش ویدئو' }],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'figcaption',
        properties: { id: `video-${video.id}-description`, className: ['text-center', 'w-full', 'flex-1', 'flex', 'flex-col', 'justify-between', 'items-center', 'p-4'] },
        children: [
          { type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: video.title }] },
          { type: 'element', tagName: 'p', properties: {}, children: [{ type: 'text', value: video.description }] },
          { type: 'element', tagName: 'a', properties: { href: `/videos/${video.id}/`, className: ['btn', 'btn-outline', 'border-2', 'border-main-200', 'text-main-200', 'rounded-lg', 'hover:bg-main-200', 'hover:text-white', 'w-full', 'mt-auto'] }, children: [{ type: 'text', value: 'صفحهٔ ویدئو، متن و فصل‌بندی' }] },
        ],
      },
    ],
  };
}

function contextualMedia(sectionTitle) {
  const relatedVideos = videos.filter((video) => sectionTitle.includes(video.relatedHeadingIncludes));
  const showGallery = sectionTitle.includes('اسم کلینیک مدرک نیست');
  if (!relatedVideos.length && !showGallery) return null;
  const children = [
    { type: 'element', tagName: 'strong', properties: { className: ['context-media-title'] }, children: [{ type: 'text', value: showGallery ? 'رسانه‌های هویتی و بالینی' : 'ویدئوهای مرتبط با این بخش' }] },
  ];
  if (relatedVideos.length) {
    children.push({
      type: 'element',
      tagName: 'div',
      properties: { className: ['video-rail'] },
      children: relatedVideos.map(videoFigure),
    });
  }
  if (showGallery) {
    children.push({
      type: 'element',
      tagName: 'div',
      properties: { className: ['evidence-gallery'] },
      children: galleryImages.filter((image) => image.id !== 'doctor-portrait').map(responsivePicture),
    });
  }
  return {
    type: 'element',
    tagName: 'aside',
    properties: { className: ['border-2', 'border-main-200', 'rounded-xl', 'p-4', 'lg:p-10', 'bg-[linear-gradient(45deg,#F8FDFF,#FFFFFF)]', 'text-black', 'mt-10'], ariaLabel: `رسانه‌های مرتبط با ${sectionTitle}` },
    children,
  };
}

function relatedNavigation(section, relationships, sectionById) {
  const relation = relationships.find((item) => item.id === section.id);
  if (!relation?.related?.length) return null;
  const links = relation.related
    .map((id) => sectionById.get(id))
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => ({
      type: 'element',
      tagName: 'li',
      properties: {},
      children: [{
        type: 'element',
        tagName: 'a',
        properties: { href: `#${item.id}` },
        children: [{ type: 'text', value: item.title }],
      }],
    }));

  return {
    type: 'element',
    tagName: 'nav',
    properties: { className: ['border-2', 'border-main-200', 'rounded-xl', 'p-4', 'lg:p-10', 'bg-[linear-gradient(45deg,#F8FDFF,#FFFFFF)]', 'text-black', 'mt-10'], ariaLabel: `بخش‌های مرتبط با ${section.title}` },
    children: [
      { type: 'element', tagName: 'strong', properties: {}, children: [{ type: 'text', value: 'بخش‌های مرتبط' }] },
      { type: 'element', tagName: 'ul', properties: {}, children: links },
    ],
  };
}

export function rehypeSemanticSections(options = {}) {
  const mode = options.mode ?? 'full';
  return (tree) => {
    if (!Array.isArray(tree?.children)) return;

    const h2List = tree.children
      .filter((node) => isElement(node, 'h2'))
      .map((node) => ({ id: String(node.properties?.id ?? ''), title: textContent(node).trim(), node }));
    const relationships = buildSectionRelationships(h2List.map((item) => ({ slug: item.id, text: item.title })));
    const sectionById = new Map(h2List.map((item) => [item.id, item]));

    const introNodes = [];
    const sections = [];
    let activeSection = null;

    for (const node of tree.children) {
      if (isElement(node, 'h2')) {
        if (activeSection) sections.push(activeSection);
        const headingId = String(node.properties?.id ?? '');
        const headingTitle = textContent(node).trim();
        const metadata = classifyHeading(headingTitle, 2);
        const group = getTopicGroup(headingTitle);
        activeSection = {
          type: 'element',
          tagName: 'section',
          properties: {
            className: ['content-section', 'section', `topic-${group.id}`, 'bg-[linear-gradient(45deg,#F8FDFF,#FFFFFF)]', 'text-black', 'rounded-2xl', 'p-4', 'lg:p-10', 'border-2', 'border-main-200'],
            ...(headingId ? { ariaLabelledBy: headingId, dataSectionId: headingId } : {}),
            dataTopicGroup: group.id,
            dataIntents: metadata.intents.join(' '),
            dataModalities: metadata.modalities.join(' '),
          },
          children: [node],
          _sectionMeta: { id: headingId, title: headingTitle },
        };
        continue;
      }
      if (activeSection) activeSection.children.push(node);
      else introNodes.push(node);
    }
    if (activeSection) sections.push(activeSection);

    const firstParagraph = introNodes.find((node) => isElement(node, 'p'));
    if (firstParagraph) {
      firstParagraph.properties ??= {};
      firstParagraph.properties.className = [...(firstParagraph.properties.className ?? []), 'direct-answer'];
    }

    for (const section of sections) {
      const firstAnswer = section.children.find((node, index) => index > 0 && isElement(node, 'p'));
      if (firstAnswer) {
        firstAnswer.properties ??= {};
        firstAnswer.properties.className = [...(firstAnswer.properties.className ?? []), 'section-direct-answer'];
        firstAnswer.properties.dataAnswerRole = 'direct-answer';
      }

      for (let index = 0; index < section.children.length; index += 1) {
        const node = section.children[index];
        if (!isElement(node, 'h3') && !isElement(node, 'h4')) continue;
        const title = textContent(node).trim();
        if (!/[؟?]$/.test(title)) continue;
        node.properties ??= {};
        node.properties.dataQuestion = 'true';
        const answer = section.children.slice(index + 1).find((candidate) => isElement(candidate, 'p'));
        if (answer) {
          answer.properties ??= {};
          answer.properties.className = [...new Set([...(answer.properties.className ?? []), 'question-direct-answer'])];
          answer.properties.dataAnswerRole = 'question-answer';
        }
      }

      const media = contextualMedia(section._sectionMeta.title);
      if (media) section.children.push(media);
      const nav = relatedNavigation(section._sectionMeta, relationships, sectionById);
      if (nav) section.children.push(nav);
      delete section._sectionMeta;
    }

    const heroHeading = introNodes.find((node) => isElement(node, 'h1'));
    if (heroHeading) {
      heroHeading.properties ??= {};
      heroHeading.properties.className = [...(heroHeading.properties.className ?? []), 'healnet-hero-title'];
      const textIndex = (heroHeading.children ?? []).findIndex((child) => child?.type === 'text' && String(child.value ?? '').includes('؛'));
      if (textIndex >= 0) {
        const value = String(heroHeading.children[textIndex].value ?? '');
        const separatorIndex = value.indexOf('؛');
        heroHeading.children.splice(textIndex, 1,
          {
            type: 'element',
            tagName: 'span',
            properties: { className: ['bg-linear-to-r', 'from-[#0179B4]', 'to-[#88D8FF]', 'bg-clip-text', 'text-transparent'] },
            children: [{ type: 'text', value: value.slice(0, separatorIndex) }],
          },
          { type: 'text', value: value.slice(separatorIndex) },
        );
      }
    }

    const introParagraphs = introNodes.filter((node) => isElement(node, 'p'));
    if (introParagraphs[0]) {
      introParagraphs[0].properties ??= {};
      introParagraphs[0].properties.className = [...(introParagraphs[0].properties.className ?? []), 'healnet-template-copy', 'mt-8', 'mb-10'];
    }
    const actionParagraph = introParagraphs.at(-1);
    const actionLinks = (actionParagraph?.children ?? []).filter((node) => isElement(node, 'a'));
    actionLinks.forEach((link, index) => {
      link.properties ??= {};
      link.properties.className = index === 0
        ? ['btn', 'bg-[linear-gradient(125deg,var(--color-main-100),var(--color-main-200))]', 'text-white', 'border-0', 'rounded-xl', 'text-lg', 'py-3', 'px-6', 'h-auto', 'shadow-xl', 'hover:shadow-2xl']
        : ['btn', 'btn-outline', 'border-2', 'border-main-200', 'text-main-200', 'rounded-lg', 'hover:bg-main-200', 'hover:text-white'];
    });

    const intro = {
      type: 'element',
      tagName: 'section',
      properties: {
        className: ['section', 'section-hero', 'py-10', 'sm:py-20', 'my-0!'],
        ariaLabel: 'معرفی و پاسخ مستقیم',
        dataTopicGroup: 'physician-entity-authority',
      },
      children: [
        {
          type: 'element',
          tagName: 'div',
          properties: { className: ['container'] },
          children: [{
            type: 'element',
            tagName: 'div',
            properties: { className: ['grid', 'grid-cols-1', 'md:grid-cols-2', 'items-center', 'gap-10'] },
            children: [
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['text-center', 'sm:text-right'] },
                children: introNodes,
              },
              {
                type: 'element',
                tagName: 'div',
                properties: {},
                children: [heroFigure()],
              },
            ],
          }],
        },
      ],
    };

    if (mode === 'intro') tree.children = [intro];
    else if (mode === 'sections') tree.children = sections;
    else tree.children = [intro, ...sections];
  };
}

export function rehypeAccessibleTables() {
  return (tree) => {
    function processChildren(children, inheritedHeading = '') {
      if (!Array.isArray(children)) return;
      let currentHeading = inheritedHeading;
      for (const node of children) {
        if (node?.type === 'element' && /^h[1-4]$/.test(node.tagName)) {
          currentHeading = textContent(node).trim() || currentHeading;
        }
        if (isElement(node, 'table')) {
          node.properties ??= {};
          node.properties.ariaLabel = currentHeading ? `جدول مرتبط با: ${currentHeading}` : 'جدول اطلاعات پزشکی';
          node.properties.dataTableContext = currentHeading || 'medical-information';
          walk(node, (candidate) => {
            if (!isElement(candidate, 'th')) return;
            candidate.properties ??= {};
            candidate.properties.scope ??= 'col';
          });
          const tbody = (node.children ?? []).find((candidate) => isElement(candidate, 'tbody'));
          for (const row of tbody?.children ?? []) {
            if (!isElement(row, 'tr')) continue;
            const firstCell = (row.children ?? []).find((candidate) => isElement(candidate, 'td') || isElement(candidate, 'th'));
            if (firstCell) {
              firstCell.tagName = 'th';
              firstCell.properties ??= {};
              firstCell.properties.scope = 'row';
            }
          }
        }
        processChildren(node?.children, currentHeading);
      }
    }
    processChildren(tree?.children);
  };
}
