import {truthText} from './search-contract.mjs';

const biography = '/saeed-ghezelbash-research-education-and-clinical-decisions';
const workshopVideo = '/video-saeed-ghezelbash-thread-lift-workshop';
const researchIds = [
  '/article-omega-3-bipolar-i-2016',
  '/article-mdd-attachment-dissociation-trauma-2021',
];
const workshopId = '/advanced-thread-lift-workshop-tehran-1403-11';
const ref = id => ({'@id':id});

/** Attach only evidence described by the corresponding HTML route. */
export function projectFocusedEvidence(document, {record, byId, personId, visibleLinks}) {
  if (record.path !== biography && record.path !== workshopVideo) return document;
  const origin = new URL(record.canonicalUrl).origin;
  const output = structuredClone(document);
  const nodes = output['@graph'];
  const page = nodes.find(node => node['@id'] === record.canonicalUrl + '#webpage');
  if (!page) throw new Error('Focused evidence page identity is missing: ' + record.path);

  if (record.path === biography) {
    const articles = researchIds.map(path => {
      const article = byId.get(origin + path);
      const authors = [article?.author].flat();
      if (article?.['@type'] !== 'ScholarlyArticle' ||
          !authors.some(author => author?.['@id'] === personId) ||
          ![article.url, ...article.sameAs].some(url => visibleLinks.has(url)))
        throw new Error('No visible source or canonical physician attribution for ' + path);
      return {
        '@id': article['@id'], '@type': article['@type'],
        name: article.name, url: article.url, sameAs: article.sameAs,
        datePublished: article.datePublished['@value'] ?? article.datePublished,
        author: authors,
      };
    });
    page.citation = [...(page.citation ?? []), ...articles.map(article => ref(article['@id']))];
    nodes.push(...articles);
  } else {
    const video = nodes.find(node => node['@id'] === page.mainEntity?.['@id']);
    const workshop = byId.get(origin + workshopId);
    if (!video || ![video['@type']].flat().includes('VideoObject') ||
        !workshop?.['@type'].includes('CourseInstance') || workshop.instructor?.['@id'] !== personId ||
        ![video.embedUrl, video.contentUrl, ...[video.sameAs].flat()].some(url => visibleLinks.has(url)))
      throw new Error('Workshop video or instructor attribution is missing');
    video.recordedAt = ref(workshop['@id']);
    nodes.push({
      '@id': workshop['@id'], '@type': 'CourseInstance',
      name: truthText(workshop.name, record.lang), instructor: ref(personId),
    });
  }
  return output;
}
