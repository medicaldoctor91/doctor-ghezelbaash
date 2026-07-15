import { site } from '~/domain/entities';
import { homepageArticleSubsectionById } from '~/domain/homepage-article-registry.mjs';
import { homepageSectionById } from '~/domain/homepage-sections.mjs';
import {
  homepageMissionLock,
  localServiceIntentAnswers,
  nationalAuthorityAnswers,
} from '~/domain/homepage-mission-lock.mjs';

type Node = Record<string, any>;
type Graph = { '@context'?: unknown; '@graph'?: Node[] };

const id = (fragment: string) => `${site.url}#${fragment}`;
const ref = (value: string) => ({ '@id': value });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const uniqueRefs = (values: Node[]) => {
  const byId = new Map<string, Node>();
  for (const value of values) if (typeof value?.['@id'] === 'string') byId.set(value['@id'], value);
  return [...byId.values()];
};

export function applyHomepageMissionGraph(input: Graph): Graph {
  const nodes = asArray(input['@graph']).filter((node): node is Node => Boolean(node?.['@id']));
  const byId = new Map(nodes.map((node) => [node['@id'], node]));
  const personId = id(homepageMissionLock.primaryEntity);
  const clinicId = id(homepageMissionLock.supportingEntity);
  const webpageId = id('webpage');
  const articleId = id('article');
  const parentSectionId = id('best-aesthetic-doctor-kermanshah');
  const allMissionEntries = [...localServiceIntentAnswers, ...nationalAuthorityAnswers];

  const destinationFragments = [...new Set(allMissionEntries.map((entry) => entry.destinationId))];
  const destinationNodes = destinationFragments.map((fragment) => {
    const nodeId = id(fragment);
    const existing = byId.get(nodeId);
    if (existing) return existing;

    const subsection = homepageArticleSubsectionById.get(fragment);
    const primarySection = homepageSectionById.get(fragment);
    const parentFragment = subsection?.parentId;
    const node: Node = {
      '@type': 'WebPageElement',
      '@id': nodeId,
      name: subsection?.title ?? primarySection?.title ?? fragment,
      url: nodeId,
      inLanguage: site.language,
      isPartOf: ref(parentFragment ? id(parentFragment) : webpageId),
      about: ref(personId),
      mentions: ref(clinicId),
    };
    byId.set(nodeId, node);

    if (parentFragment) {
      const parent = byId.get(id(parentFragment));
      if (parent) parent.hasPart = uniqueRefs([...asArray<Node>(parent.hasPart), ref(nodeId)]);
    }
    return node;
  });

  const makeAnswerNodes = (entries: readonly any[]) => entries.flatMap((entry) => {
    const questionId = id(`question-${entry.id}`);
    const answerId = id(`answer-${entry.id}`);
    const question: Node = {
      '@type': 'Question',
      '@id': questionId,
      name: entry.question,
      text: entry.question,
      url: id(entry.id),
      inLanguage: site.language,
      about: ref(personId),
      mentions: ref(clinicId),
      isPartOf: ref(parentSectionId),
      acceptedAnswer: ref(answerId),
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: entry.relationship },
        { '@type': 'PropertyValue', propertyID: 'serviceFamily', value: entry.family },
        { '@type': 'PropertyValue', propertyID: 'geographyScope', value: entry.scope },
      ],
    };
    const answer: Node = {
      '@type': 'Answer',
      '@id': answerId,
      text: entry.answer,
      url: id(entry.id),
      inLanguage: site.language,
      author: ref(personId),
      about: ref(personId),
      mentions: ref(clinicId),
      isPartOf: ref(questionId),
    };
    byId.set(questionId, question);
    byId.set(answerId, answer);
    return [question, answer];
  });

  const localNodes = makeAnswerNodes(localServiceIntentAnswers);
  const nationalNodes = makeAnswerNodes(nationalAuthorityAnswers);

  const makeList = (fragment: string, name: string, entries: readonly any[]) => {
    const list: Node = {
      '@type': 'ItemList',
      '@id': id(fragment),
      name,
      url: id(fragment),
      inLanguage: site.language,
      about: ref(personId),
      mentions: ref(clinicId),
      isPartOf: ref(parentSectionId),
      numberOfItems: entries.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: entry.question,
        url: id(entry.id),
        item: ref(id(`question-${entry.id}`)),
      })),
    };
    byId.set(list['@id'], list);
    return list;
  };

  const localList = makeList(
    homepageMissionLock.localAnswerListId,
    'پاسخ‌های خدمت‌محور انتخاب دکتر زیبایی در کرمانشاه',
    localServiceIntentAnswers,
  );
  const nationalList = makeList(
    homepageMissionLock.nationalAnswerListId,
    'پاسخ‌های توسعه اعتبار پزشک زیبایی از سطح لوکال به ملی',
    nationalAuthorityAnswers,
  );

  const person = byId.get(personId);
  if (person) {
    person.knowsAbout = uniqueRefs([
      ...asArray<Node>(person.knowsAbout),
      ...destinationNodes.map((node) => ref(node['@id'])),
    ]);
    person.subjectOf = uniqueRefs([
      ...asArray<Node>(person.subjectOf),
      ref(localList['@id']),
      ref(nationalList['@id']),
      ...localNodes.filter((node) => node['@type'] === 'Question').map((node) => ref(node['@id'])),
      ...nationalNodes.filter((node) => node['@type'] === 'Question').map((node) => ref(node['@id'])),
    ]);
    delete person.aggregateRating;
  }

  for (const nodeId of [webpageId, articleId, parentSectionId]) {
    const node = byId.get(nodeId);
    if (!node) continue;
    node.hasPart = uniqueRefs([
      ...asArray<Node>(node.hasPart),
      ref(localList['@id']),
      ref(nationalList['@id']),
      ...destinationNodes.map((item) => ref(item['@id'])),
      ...localNodes.map((item) => ref(item['@id'])),
      ...nationalNodes.map((item) => ref(item['@id'])),
    ]);
  }

  const clinic = byId.get(clinicId);
  if (clinic) clinic.employee = ref(personId);

  return {
    '@context': input['@context'] ?? 'https://schema.org',
    '@graph': [...byId.values()],
  };
}
