const values=value=>Array.isArray(value)?value:value==null?[]:[value];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

/**
 * Describe the complete graph download without importing its reciprocal
 * inventories into the homepage's bounded Search document.
 */
export function appendHomeDatasetDiscovery(document,graph,origin) {
  const canonical=new Map(graph['@graph'].map(node=>[node['@id'],node]));
  const dataset=canonical.get(origin+'/graph.jsonld/dataset');
  const download=canonical.get(origin+'/graph.jsonld/download');
  if(!values(dataset?.['@type']).includes('Dataset')||!values(download?.['@type']).includes('DataDownload'))
    throw new Error('Homepage graph discovery requires the canonical Dataset and DataDownload');
  if(typeof dataset.name!=='string'||!dataset.name.trim()||typeof dataset.description!=='string')
    throw new Error('Homepage Dataset discovery requires its authored name and description');
  // Keep a complete authored sentence, including abbreviations such as "Dr.".
  // Google Dataset descriptions require at least 50 characters. The canonical
  // description remains complete and unchanged in the downloadable graph.
  const description=dataset.description.match(/^.{50,}?[.!?](?:\s|$)/su)?.[0].trim();
  if(!description||description.length>5000)
    throw new Error('Homepage Dataset discovery requires a complete authored description sentence');
  if(download.contentUrl!==origin+'/graph.jsonld'||download.encodingFormat!=='application/ld+json')
    throw new Error('Homepage Dataset discovery must link the canonical JSON-LD download');
  if(dataset.creator?.['@id']!==origin+'/#saeed-ghezelbash'||
      !document['@graph'].some(node=>node['@id']===dataset.creator['@id']))
    throw new Error('Homepage Dataset discovery requires the existing physician creator');
  if(typeof dataset.license!=='string'||!dataset.license.startsWith('https://'))
    throw new Error('Homepage Dataset discovery requires its authored license URL');
  if(document['@graph'].some(node=>node['@id']===dataset['@id']))
    throw new Error('Duplicate homepage Dataset discovery identity');
  return {...document,'@graph':[...document['@graph'],{
    '@id':dataset['@id'],'@type':'Dataset',name:dataset.name,description,
    creator:structuredClone(dataset.creator),license:dataset.license,
    distribution:{'@type':'DataDownload',contentUrl:download.contentUrl,encodingFormat:download.encodingFormat},
  }]};
}

/**
 * A compact HTML discovery hint keeps the resolved URL, relation and media
 * type. Complete titles, parameters and profiles remain in the resource
 * registry, representation HTTP headers and machine-readable descriptors.
 */
export function renderCompactMachineDiscoveryLinks(resources) {
  return resources.filter(resource=>resource.discoverable).map(resource=>{
    if(!resource.path?.startsWith('/')||resource.path.startsWith('//')||
        !/^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+$/i.test(resource.mediaType)||
        !['describedby','alternate','related','linkset'].includes(resource.rel))
      throw new Error('Invalid compact machine discovery resource');
    return `<link rel="${escape(resource.rel)}" href="${escape(resource.path)}" type="${escape(resource.mediaType)}">`;
  }).join('');
}
