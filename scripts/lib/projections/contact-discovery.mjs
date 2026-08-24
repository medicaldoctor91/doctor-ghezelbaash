import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {nodeTypes,valueText} from '../projection-context.mjs';

const vEsc=value=>String(value??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(';','\\;').replaceAll(',','\\,');
const foldVCard=line=>{
  const out=[];
  let buffer='';
  for(const char of line){
    const next=buffer+char;
    if(Buffer.byteLength(next,'utf8')>73){out.push(buffer);buffer=' '+char;}else buffer=next;
  }
  if(buffer)out.push(buffer);
  return out.join('\r\n');
};
const vCard=lines=>lines.map(foldVCard).join('\r\n')+'\r\n';
const xmlEsc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const isoDurationSeconds=value=>{
  const match=String(value??'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if(!match)return null;
  return Math.round((Number(match[1]||0)*3600)+(Number(match[2]||0)*60)+Number(match[3]||0));
};

export async function compileContactDiscovery(context){
  const {generatedPublic,projections,release,graph,byId}=context;
  const clinic=byId.get(release.clinic.id);
  const addressNode=byId.get(clinic?.address?.['@id']);
  const personPortrait=byId.get(`${release.canonicalUrl}#image-saeed-ghezelbash-portrait-master`);
  const clinicImages=(Array.isArray(clinic?.image)?clinic.image:[clinic?.image].filter(Boolean)).map(value=>value?.['@id']);
  const clinicPhoto=byId.get(clinicImages.find(id=>id&&id!==`${release.canonicalUrl}#image-doctor-ghezelbaash-clinic-logo`));
  const rev=`${release.dateModified.replaceAll('-','')}T000000Z`;
  await mkdir(generatedPublic,{recursive:true});

  const doctorVcf=vCard([
    'BEGIN:VCARD','VERSION:4.0',`PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
    `UID:${release.primaryEntity.id}`,'FN:دکتر سعید قزلباش','N:قزلباش;سعید;;;دکتر','TITLE:پزشک زیبایی',
    `TEL;TYPE=work,voice:${clinic?.telephone||''}`,
    `ADR;TYPE=work:;;${vEsc(addressNode?.streetAddress)};${vEsc(addressNode?.addressLocality)};${vEsc(addressNode?.addressRegion)};${vEsc(addressNode?.postalCode)};${vEsc(addressNode?.addressCountry)}`,
    `URL:${release.canonicalUrl}`,`SOURCE:${release.canonicalUrl}doctor.vcf`,personPortrait?.contentUrl?`PHOTO;MEDIATYPE=image/jpeg:${personPortrait.contentUrl}`:'',
    `X-GOOGLE-KG-ID:${release.primaryEntity.googleKnowledgeGraphId}`,`X-WIKIDATA:${release.primaryEntity.wikidata}`,
    'X-IRIMC:167430','X-ORCID:0009-0001-9346-8475',`X-OWNED-CLINIC:${release.clinic.id}`,
    `X-ENTITY-VERSION:${release.release}`,`REV:${rev}`,'END:VCARD',
  ].filter(Boolean));
  const clinicVcf=vCard([
    'BEGIN:VCARD','VERSION:4.0',`PRODID:-//ghezelbaash.ir//Entity Contact Projection ${release.release}//FA`,
    `UID:${release.clinic.id}`,'FN:کلینیک زیبایی دکتر سعید قزلباش','ORG:کلینیک زیبایی دکتر سعید قزلباش',
    `TEL;TYPE=work,voice:${clinic?.telephone||''}`,
    `ADR;TYPE=work:;;${vEsc(addressNode?.streetAddress)};${vEsc(addressNode?.addressLocality)};${vEsc(addressNode?.addressRegion)};${vEsc(addressNode?.postalCode)};${vEsc(addressNode?.addressCountry)}`,
    `URL:${release.canonicalUrl}`,`SOURCE:${release.canonicalUrl}clinic.vcf`,clinicPhoto?.contentUrl?`PHOTO;MEDIATYPE=image/webp:${clinicPhoto.contentUrl}`:'',
    `X-GOOGLE-KG-ID:${release.clinic.googleLocalKgmid}`,`X-GOOGLE-PLACE-ID:${release.clinic.placeId}`,`X-GOOGLE-MAPS-CID:${release.clinic.cid}`,
    'X-WIKIDATA:Q140288589',`X-OWNER:${release.primaryEntity.id}`,`X-PRICE-RANGE:${release.clinic.priceRange}`,
    `X-HOURS:${release.clinic.hours}`,`X-ENTITY-VERSION:${release.release}`,`REV:${rev}`,'END:VCARD',
  ].filter(Boolean));
  await writeFile(path.join(generatedPublic,'doctor.vcf'),doctorVcf);
  await writeFile(path.join(generatedPublic,'clinic.vcf'),clinicVcf);

  const imageIds=[
    `${release.canonicalUrl}#image-saeed-ghezelbash-portrait`,
    `${release.canonicalUrl}#image-saeed-ghezelbash-clinical-examination`,
    `${release.canonicalUrl}#image-saeed-ghezelbash-clinic-team`,
    `${release.canonicalUrl}#image-ghezelbash-clinic-interior-kermanshah`,
    `${release.canonicalUrl}#image-ghezelbash-clinic-reception-kermanshah`,
  ];
  const clinicImageUrls=(Array.isArray(clinic?.image)?clinic.image:[clinic?.image].filter(Boolean)).filter(value=>typeof value==='string'&&value.startsWith(release.canonicalUrl));
  const imageLocs=[...new Set([...imageIds.map(id=>byId.get(id)?.contentUrl).filter(Boolean),...clinicImageUrls])];
  const videos=graph['@graph'].filter(node=>nodeTypes(node).includes('VideoObject'));
  let sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n  <url>\n    <loc>${release.canonicalUrl}</loc>\n    <lastmod>${release.dateModified}</lastmod>\n`;
  for(const url of imageLocs)sitemap+=`    <image:image><image:loc>${xmlEsc(url)}</image:loc></image:image>\n`;
  for(const video of videos){
    const thumb=valueText(video.thumbnailUrl||video.thumbnail?.contentUrl||video.thumbnail);
    const content=valueText(video.contentUrl||video.url);
    const title=valueText(video.name);
    const description=valueText(video.description);
    const date=valueText(video.uploadDate||video.datePublished);
    const duration=isoDurationSeconds(valueText(video.duration));
    sitemap+=`    <video:video><video:thumbnail_loc>${xmlEsc(thumb)}</video:thumbnail_loc><video:title>${xmlEsc(title)}</video:title><video:description>${xmlEsc(description)}</video:description><video:content_loc>${xmlEsc(content)}</video:content_loc>${date?`<video:publication_date>${xmlEsc(date)}</video:publication_date>`:''}${duration?`<video:duration>${duration}</video:duration>`:''}</video:video>\n`;
  }
  sitemap+='  </url>\n</urlset>\n';
  await writeFile(path.join(projections,'sitemap.xml'),sitemap);
  return {imageCount:imageLocs.length,videoCount:videos.length};
}
