import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';

const persianNumber=(value,digits=0)=>new Intl.NumberFormat('fa-IR',{minimumFractionDigits:digits,maximumFractionDigits:digits,useGrouping:true}).format(Number(value));
const persianGregorianDate=value=>new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value));
const englishDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(String(value)+'T00:00:00Z'));

const bindReleaseTokens=(content,release)=>{
  const values={
    '{{CURRENT_RELEASE}}':release.release,
    '{{CURRENT_VERSION_DOI}}':release.dataset.zenodo.versionDoi,
    '{{CURRENT_VERSION_DOI_URLENCODED}}':encodeURIComponent(release.dataset.zenodo.versionDoi),
    '{{CURRENT_RELEASE_DATE_EN}}':englishDate(release.dateModified),
    '{{MEDICAL_REVIEW_DATE_EN}}':englishDate(release.medicalReviewedAt)
  };
  for(const [token,value] of Object.entries(values))content=content.replaceAll(token,String(value));
  if(/{{[A-Z0-9_]+}}/.test(content))throw new Error('Unresolved canonical page token');
  return content;
};

const bindLiveReputation=async(root,content,release)=>{
  const volatile=JSON.parse(await readFile(path.join(root,'src/data/volatile-facts.json'),'utf8'));
  const rating=Number(volatile.rating),reviewCount=Number(volatile.reviewCount),observedAt=volatile.valueObservedAt;
  if(!(rating>=1&&rating<=5)||!Number.isInteger(reviewCount)||reviewCount<0||volatile.placeId!==release.clinic.placeId||Number.isNaN(Date.parse(observedAt)))throw new Error('Invalid live reputation source for visible binding');
  const replacement='<div class="hero-caption-reputation" id="google-maps-clinic-reputation-current"><strong>'+persianNumber(rating,1)+' از ۵ در <span translate="no">Google Maps</span></strong> · بر اساس '+persianNumber(reviewCount)+' نظر · آخرین تغییر ثبت‌شده در Google: '+persianGregorianDate(observedAt)+' — <a href="https://www.google.com/maps?cid='+release.clinic.cid+'" rel="external noopener">مشاهده نظرها</a></div>';
  const pattern=/<div\b(?=[^>]*\bid=["']google-maps-clinic-reputation-current["'])[^>]*>[\s\S]*?<\/div>/i;
  const matches=content.match(new RegExp(pattern.source,'gi'))||[];
  if(matches.length!==1)throw new Error('Expected one visible reputation slot; found '+matches.length);
  return content.replace(pattern,replacement);
};

export async function canonicalSourceNames(root=process.cwd()){
  const sourceDir=path.join(root,'src/content-source');
  const names=(await readdir(sourceDir)).filter(name=>/\.(?:md|html)$/i.test(name)).sort();
  if(names.length!==1||names[0]!=='page.md')throw new Error('Canonical page source contract drift: '+names.join(', '));
  return names;
}

export async function assembleCanonicalContent({root=process.cwd()}={}){
  const names=await canonicalSourceNames(root);
  const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
  let content=await readFile(path.join(root,'src/content-source/page.md'),'utf8');
  content=bindReleaseTokens(content,release);
  content=await bindLiveReputation(root,content,release);
  return {content,names};
}