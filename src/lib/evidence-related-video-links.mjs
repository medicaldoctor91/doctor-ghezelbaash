/** Render contextual internal video links only from authored, exact Service relationships.
 *
 * A VideoObject page is linked from an Article only if the published source
 * explicitly declares the SAME existing physician-provided Service in both
 * records' about properties. This is not an Offer, a claim of surgery, an
 * inferred diagnosis, or an attempt to force Google indexing.
 */
const array=value=>value==null?[]:Array.isArray(value)?value:[value];
const ref=value=>typeof value==='string'?value:value?.['@id'];
const hasType=(node,type)=>array(node?.['@type']).includes(type);
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const localizedLabel={fa:'ویدئوهای مرتبط با این موضوع',en:'Related clinical videos',ar:'فيديوهات مرتبطة بهذا الموضوع',ckb:'ڤیدیۆی پەیوەندیدار بەم بابەتە'};

export function renderEvidenceRelatedVideos({record,recordByPath,graph,physicianId}) {
  if(!record||!(recordByPath instanceof Map)||!Array.isArray(graph?.['@graph'])||!physicianId)
    throw new TypeError('Required canonical record, route Map, graph and physician ID');
  const origin=new URL(record.canonicalUrl).origin;
  const nodes=graph['@graph'];
  const byId=new Map(nodes.map(node=>[node['@id'],node]));
  const article=nodes.find(node=>hasType(node,'Article')&&node.url===record.canonicalUrl);
  if(!article||!array(article.author).some(value=>ref(value)===physicianId))return '';
  const qualifying=new Set(array(article.about).map(ref).filter(id=>{
    const service=byId.get(id);
    return hasType(service,'Service') && array(service.provider).length===1
      && ref(array(service.provider)[0])===physicianId;
  }));
  if(!qualifying.size)return '';
  const existing=record.bodyHtml??'';
  const videos=nodes.filter(node=>hasType(node,'VideoObject')
    && typeof node.url==='string'
    && array(node.creator).some(value=>ref(value)===physicianId)
    && array(node.about).some(value=>qualifying.has(ref(value))))
    .flatMap(node=>{
      let target;
      try {target=new URL(node.url)} catch{return []}
      if(target.origin!==origin||target.search||target.hash)return [];
      const page=recordByPath.get(target.pathname);
      if(!page||page.canonicalUrl!==node.url||page.path===record.path||existing.includes(target.pathname))return [];
      return [{path:page.path,title:page.title,lang:page.lang}];
    });
  if(!videos.length)return '';
  const unique=[...new Map(videos.map(video=>[video.path,video])).values()]
    .sort((a,b)=>a.path.localeCompare(b.path))
    .slice(0,3);
  const label=localizedLabel[record.lang?.split('-')[0]]??localizedLabel.fa;
  return '<nav data-evidence-related-videos aria-label="'+escape(label)+'"><p><strong>'+escape(label)+
    '</strong></p><ul>'+unique.map(video=>'<li><a href="'+escape(video.path)+'" lang="'+
      escape(video.lang??'fa-IR')+'">'+escape(video.title)+'</a></li>').join('')+'</ul></nav>';
}
