function sitePath(value,name){
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\r\n]/.test(value))throw new Error(`${name} must be a relative site path`);
  return value;
}

export function deriveRoutingRows(source,graph){
  if(!source||typeof source!=='object')throw new Error('source required');
  const base=source.canonicalOrigin;
  if(typeof base!=='string'||!/^https:\/\/[^/]+$/.test(base))throw new Error('Invalid canonical origin');
  const resources=source.routes?.resources;
  if(!Array.isArray(resources))throw new Error('source.routes.resources required');
  const representation=source.delivery?.routing?.graphIdentityRepresentations;
  if(!representation)throw new Error('graph identity representations required');
  const routingRowsBySource=new Map();
  const canonicalPaths=new Set(resources.map(resource=>resource.path));
  const addRoute=(row)=>{
    sitePath(row.source,'routing source');sitePath(row.target,'routing target');
    const current=routingRowsBySource.get(row.source);
    if(current&&(current.target!==row.target||current.statusCode!==row.statusCode))throw new Error(`Conflicting route ownership ${row.source}`);
    if(canonicalPaths.has(row.source))throw new Error(`Routing rule shadows canonical document ${row.source}`);
    routingRowsBySource.set(row.source,row);
  };
  for(const resource of resources.filter(resource=>resource.path!=='/')){
    sitePath(resource.path,'canonical route');
    for(const sourcePath of [resource.path+'/',resource.path+'.html'])addRoute({source:sourcePath,target:resource.path,statusCode:301});
  }
  for(const sourcePath of ['/index','/index/'])addRoute({source:sourcePath,target:'/',statusCode:301});
  const visitIdentity=(value)=>{
    if(Array.isArray(value)){value.forEach(visitIdentity);return;}
    if(!value||typeof value!=='object')return;
    if(typeof value['@id']==='string'&&value['@id'].startsWith(base+'/')&&Object.keys(value).length>1){
      const url=new URL(value['@id']);
      if(!url.search&&!url.hash&&(representation.namedRootSubjects.includes(url.pathname)||representation.graphSubjectPrefixes.some(prefix=>url.pathname.startsWith(prefix)))){
        addRoute({source:url.pathname,target:url.pathname.startsWith('/provenance.jsonld/')?representation.provenanceRepresentation:representation.representation,statusCode:200});
      }
    }
    Object.values(value).forEach(visitIdentity);
  };
  visitIdentity(graph?.['@graph']??graph);
  const legacyRedirects=source.routes?.legacyRedirects??[];
  if(!Array.isArray(legacyRedirects))throw new Error('source.routes.legacyRedirects must be an array');
  for(const row of legacyRedirects){
    if(row?.statusCode!==301)throw new Error('Historical routing must contain permanent 301 redirects only');
    if(/[:*]/.test(row?.source??''))throw new Error(`Historical routing source must be exact: ${row?.source}`);
    const target=sitePath(row?.target,'historical routing target');
    const [targetPath,fragment]=target.split('#');
    if(!canonicalPaths.has(targetPath||'/'))throw new Error(`Historical routing target is not a canonical document: ${target}`);
    if(fragment&&source.routes?.htmlIdTargets?.[fragment]!==target)throw new Error(`Historical routing fragment is not owned by its canonical document: ${target}`);
    addRoute({source:row.source,target,statusCode:301});
  }
  const routingRows=[...routingRowsBySource.values()];
  for(const row of routingRows){
    const target=new URL(row.target,base);
    if(target.origin!==base||target.search||(row.statusCode===200&&target.hash)||routingRowsBySource.has(target.pathname))throw new Error(`Nonfinal routing target ${row.source}`);
  }
  return routingRows;
}

export function renderRedirects(rows){
  if(!Array.isArray(rows))throw new Error('routing rows must be an array');
  const seen=new Set();
  let staticCount=0,dynamicCount=0;
  const lines=rows.map((row)=>{
    const source=sitePath(row?.source,'redirect source'),target=sitePath(row?.target,'redirect target');
    if(seen.has(source))throw new Error(`Duplicate redirect source: ${source}`);seen.add(source);
    if(![200,301].includes(row?.statusCode))throw new Error(`Unsupported routing status: ${row?.statusCode}`);
    if(/[:*]/.test(source))dynamicCount++;else staticCount++;
    const line=`${source} ${target} ${row.statusCode}`;
    if(line.length>1000)throw new Error(`Cloudflare _redirects rule length limit exceeded: ${line.length}`);
    return line;
  });
  if(staticCount>2000)throw new Error(`Cloudflare _redirects static redirect limit exceeded: ${staticCount}`);
  if(dynamicCount>100)throw new Error(`Cloudflare _redirects dynamic redirect limit exceeded: ${dynamicCount}`);
  if(staticCount+dynamicCount>2100)throw new Error(`Cloudflare _redirects total limit exceeded: ${staticCount+dynamicCount}`);
  return lines.join('\n')+(lines.length?'\n':'');
}

export function renderRobotsTxt({origin,robots,contentSignal}){
  if(typeof origin!=='string'||!/^https:\/\/[^/]+$/.test(origin))throw new Error('Invalid robots origin');
  if(!robots||!Array.isArray(robots.userAgents)||!robots.userAgents.length)throw new Error('robots.userAgents required');
  if(typeof contentSignal!=='string'||/[\r\n]/.test(contentSignal))throw new Error('Invalid Content-Signal');
  const lines=[];
  for(const agent of robots.userAgents){if(typeof agent!=='string'||/[\r\n]/.test(agent))throw new Error('Invalid user-agent');lines.push(`User-agent: ${agent}`);}
  lines.push(`Content-Signal: ${contentSignal}`);
  for(const value of robots.allow??[])lines.push(`Allow: ${sitePath(value,'robots allow')}`);
  for(const value of robots.disallow??[])lines.push(`Disallow: ${sitePath(value,'robots disallow')}`);
  lines.push(`Sitemap: ${origin}${sitePath(robots.sitemapPath,'robots sitemapPath')}`);
  return lines.join('\n')+'\n';
}
