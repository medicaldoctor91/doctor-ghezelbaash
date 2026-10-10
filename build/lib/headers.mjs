const MUTABLE_ROOT_ASSETS=['/favicon.png','/favicon.svg','/apple-touch-icon.png','/2d0a99837e327f6744f9184ec6d2877f.txt'];

export function assertValidLinkTypes(headers){
  for(const line of headers.split('\n').filter(line=>/^\s*Link:/i.test(line))){
    const attributes=[...line.matchAll(/;\s*type\s*=/gi)];
    const valid=[...line.matchAll(/;\s*type\s*=\s*"[!#$%&'*+.^_`|~A-Za-z0-9-]+\/[!#$%&'*+.^_`|~A-Za-z0-9-]+"(?=\s*(?:;|,|$))/gi)];
    if(attributes.length!==valid.length)throw new Error('Invalid Link type hint: expected a quoted bare media type');
  }
}
function requirePath(value,name){if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\r\n]/.test(value))throw new Error(`${name} must be an absolute site path`);return value;}
function linkValue(origin,cssPath,poster,{earlyHints=true}={}){
  const parts=[`</graph.jsonld>; rel=describedby; type="application/ld+json"`,`</graph.ttl>; rel=describedby; type="text/turtle"`,`<${origin}/#saeed-ghezelbash>; rel=about`];
  if(earlyHints)parts.unshift(`<${cssPath}>; rel=preload; as=style`);
  if(earlyHints&&poster)parts.splice(1,0,`<${poster}>; rel=preload; as=image`);
  return parts.join(', ');
}
function kebab(value){return value.replace(/[A-Z]/g,(m)=>'-'+m.toLowerCase());}
function permissionsPolicy(policy={}){return Object.entries(policy).sort(([a],[b])=>a.localeCompare(b)).map(([name,allow])=>`${kebab(name)}=(${(allow??[]).join(' ')})`).join(', ');}
function contentSecurityPolicy(policy={}){return Object.entries(policy).map(([name,value])=>{const directive=kebab(name);if(value===true)return directive;if(!Array.isArray(value)||!value.length)return '';return `${directive} ${value.join(' ')}`;}).filter(Boolean).join('; ');}
function contentType(resource){
  const params=Object.entries(resource?.parameters??{}).map(([name,value])=>`${name}=${/^[a-z0-9.+-]+$/i.test(value)?value:'"'+String(value).replaceAll('"','\\"')+'"'}`);
  if(resource?.mediaType!=='text/turtle'&&resource?.profiles?.length)params.push('profile="'+[...new Set(resource.profiles)].join(' ')+'"');
  return [resource.mediaType,...params].join('; ');
}
function resourceLinks(origin,resource,resourceByPath,defaultAbout=[]){
  const links=[`<${origin}${resource.canonicalPath??resource.path}>; rel=canonical`];
  for(const relation of resource.httpRelationships??[]){const target=resourceByPath.get(relation.path);const type=target?`; type="${target.mediaType}"`:'';links.push(`<${relation.path}>; rel=${relation.rel}${type}`);}
  for(const id of resource.about??defaultAbout)links.push(`<${id}>; rel=about`);
  return links.join(', ');
}
function profileFor(delivery,indexing){return delivery?.http?.indexingProfiles?.[indexing]??null;}
function globalBlock(delivery){
  if(!delivery)return null;const http=delivery.http??{},security=http.security??{},lines=['/*'];
  if(http.contentSignal)lines.push(`  Content-Signal: ${http.contentSignal}`);
  if(http.compression?.vary?.length)lines.push(`  Vary: ${http.compression.vary.join(', ')}`);
  if(security.strictTransportSecurity)lines.push(`  Strict-Transport-Security: ${security.strictTransportSecurity}`);
  if(security.referrerPolicy)lines.push(`  Referrer-Policy: ${security.referrerPolicy}`);
  if(security.xContentTypeOptions)lines.push(`  X-Content-Type-Options: ${security.xContentTypeOptions}`);
  if(security.crossOriginOpenerPolicy)lines.push(`  Cross-Origin-Opener-Policy: ${security.crossOriginOpenerPolicy}`);
  if(security.originAgentCluster)lines.push(`  Origin-Agent-Cluster: ${security.originAgentCluster}`);
  if(security.xFrameOptions)lines.push(`  X-Frame-Options: ${security.xFrameOptions}`);
  const pp=permissionsPolicy(security.permissionsPolicy);if(pp)lines.push(`  Permissions-Policy: ${pp}`);
  const csp=contentSecurityPolicy(security.csp);if(csp)lines.push(`  Content-Security-Policy: ${csp}`);
  return lines.length>1?lines.join('\n'):null;
}
function machineBlock({origin,resource,resourceByPath,delivery,detachHtml=false}){
  const lines=[resource.path];
  if(detachHtml){lines.push('  ! Cache-Control','  ! Link');}
  const cache=resource.indexing==='canonical-html'?delivery.html.cacheControl:delivery.machine.cacheControl;
  lines.push(`  Cache-Control: ${cache}`);
  lines.push(`  Content-Type: ${contentType(resource)}`);
  lines.push(`  Link: ${resourceLinks(origin,resource,resourceByPath,delivery.http.documentIdentity?.about??[])}`);
  const profile=profileFor(delivery,resource.indexing);if(profile?.default)lines.push(`  X-Robots-Tag: ${profile.default}`);
  if(['machine','contact'].includes(resource.indexing)){
    const cors=delivery.http.machineCors??{};
    if(cors.origin)lines.push(`  Access-Control-Allow-Origin: ${cors.origin}`);
    if(cors.exposeHeaders?.length)lines.push(`  Access-Control-Expose-Headers: ${cors.exposeHeaders.join(', ')}`);
    if(cors.resourcePolicy)lines.push(`  Cross-Origin-Resource-Policy: ${cors.resourcePolicy}`);
  }
  return lines.join('\n');
}
function countPotential({routes,machineResources,watchPosters}){return 1+routes.length+machineResources.length+3+MUTABLE_ROOT_ASSETS.length+2+2+(watchPosters?.size??0);}
export function generateHeaders({origin,routes,cssPath,watchPosters=new Map(),earlyHints=true,delivery=null,machineResources=[]}){
  if(origin!=='https://www.ghezelbaash.ir')throw new Error('Unexpected canonical origin');requirePath(cssPath,'cssPath');
  machineResources=[...machineResources,...(delivery?.releaseResources??[])];
  const blocks=[];const global=globalBlock(delivery);if(global)blocks.push(global);
  const compact=delivery&&countPotential({routes,machineResources,watchPosters})>100&&routes.filter(r=>r!=='/').every(r=>/^\/[a-z0-9-]+$/i.test(r));
  if(compact){
    blocks.push(`/\n  Cache-Control: ${delivery.html.cacheControl}\n  Link: ${linkValue(origin,cssPath,null,{earlyHints})}`);
    blocks.push(`/:route\n  Cache-Control: ${delivery.html.cacheControl}\n  Link: ${linkValue(origin,cssPath,null,{earlyHints})}`);
    if(earlyHints)for(const [route,poster] of [...watchPosters.entries()].sort(([a],[b])=>a.localeCompare(b))){requirePath(route,'route');requirePath(poster,'poster');blocks.push(`${route}\n  Link: <${poster}>; rel=preload; as=image`);}
  }else{
    for(const route of routes){requirePath(route,'route');const poster=watchPosters.get(route);if(poster)requirePath(poster,'poster');const cache=delivery?.html?.cacheControl??'public, max-age=0, must-revalidate';blocks.push(`${route}\n  Cache-Control: ${cache}\n  Link: ${linkValue(origin,cssPath,poster,{earlyHints})}`);}
  }
  if(delivery&&machineResources.length){const resourceByPath=new Map(machineResources.map(r=>[r.path,r]));for(const resource of machineResources){requirePath(resource.path,'machine resource');blocks.push(machineBlock({origin,resource,resourceByPath,delivery,detachHtml:compact&&/^\/[a-z0-9._-]+$/i.test(resource.path)}));}}
  if(delivery?.routing?.graphIdentityRepresentations){
    const policy=delivery.routing.graphIdentityRepresentations;
    const patterns=[...policy.namedRootSubjects,...policy.graphSubjectPrefixes.map(prefix=>prefix+'*')];
    for(const pattern of patterns){
      const representation=pattern.startsWith('/provenance.jsonld/')?policy.provenanceRepresentation:policy.representation;
      const resource=machineResources.find(r=>r.path===representation);
      if(!resource)throw new Error('Unregistered identity representation '+representation);
      blocks.push(`${pattern}\n  ! Link\n  ! Cache-Control\n  Content-Type: ${contentType(resource)}\n  X-Robots-Tag: noindex, follow\n  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Link, Content-Type\n  Cross-Origin-Resource-Policy: cross-origin\n  Cache-Control: ${delivery.machine.cacheControl}\n  Link: <${representation}>; rel=describedby; type="${resource.mediaType}"`);
    }
  }
  blocks.push(`/assets/*\n  ! Link\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable`);
  blocks.push(`/assets/guide*\n  X-Robots-Tag: noindex`);
  blocks.push(`/media/*\n  ! Link\n  ! Cache-Control\n  Cache-Control: public, max-age=3600, must-revalidate`);
  blocks.push(`/fonts/*\n  ! Link\n  ! Cache-Control\n  Cache-Control: public, max-age=3600, must-revalidate`);
  for(const route of MUTABLE_ROOT_ASSETS)blocks.push(`${route}\n  ! Link\n  ! Cache-Control\n  Cache-Control: public, max-age=3600, must-revalidate`);
  if(delivery?.routing?.notFound?.cacheControl){const p=profileFor(delivery,delivery.routing.notFound.indexing);for(const route of ['/404.html','/404'])blocks.push(`${route}\n  ! Link\n  ! Cache-Control\n  Content-Type: text/html; charset=utf-8\n  Cache-Control: ${delivery.routing.notFound.cacheControl}${p?.default?`\n  X-Robots-Tag: ${p.default}`:''}`);}
  const preview=delivery?.http?.indexingProfiles?.preview?.default??'noindex';blocks.push(`https://:project.pages.dev/*\n  X-Robots-Tag: ${preview}`);blocks.push(`https://:version.:project.pages.dev/*\n  X-Robots-Tag: ${preview}`);
  if(blocks.length>100)throw new Error(`Cloudflare _headers rule limit exceeded: ${blocks.length}`);
  const output=blocks.join('\n\n')+'\n';for(const line of output.split('\n'))if(line.length>2000)throw new Error(`Cloudflare _headers line limit exceeded: ${line.length}`);assertValidLinkTypes(output);return output;
}
export function generateSecurityTxt({origin,email,expires}){if(origin!=='https://www.ghezelbaash.ir')throw new Error('Unexpected canonical origin');if(!/^[^@\s]+@[^@\s]+$/.test(email))throw new Error('Invalid security contact email');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expires))throw new Error('Expires must be an RFC3339 UTC timestamp');return `Contact: mailto:${email}\nExpires: ${expires}\nPreferred-Languages: fa, en\nCanonical: ${origin}/.well-known/security.txt\n`;}
