const faDigits=value=>String(value).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const asArray=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const text=(value,lang='fa')=>{
  if(value==null)return '';
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(Array.isArray(value)){
    const preferred=value.find(item=>item&&typeof item==='object'&&item['@language']===lang);
    return text(preferred??value[0],lang);
  }
  if(typeof value==='object')return String(value['@value']??value.name??'');
  return '';
};
const normalizePhone=value=>`+${String(value??'').replace(/\D/g,'')}`;
const groupLocalPhone=value=>`${value.slice(0,4)} ${value.slice(4,7)} ${value.slice(7)}`;
const groupInternationalPhone=value=>`+${value.slice(1,3)} ${value.slice(3,6)} ${value.slice(6,9)} ${value.slice(9)}`;
const formatDate=(value,calendar)=>new Intl.DateTimeFormat(`fa-IR-u-ca-${calendar}`,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));

export function deriveSiteData(release,graph){
  if(!release?.clinic?.id||!Array.isArray(graph?.['@graph']))throw new Error('Site data requires release + graph');
  const byId=new Map(graph['@graph'].filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
  const clinic=byId.get(release.clinic.id);
  if(!clinic)throw new Error(`Head graph lacks clinic node: ${release.clinic.id}`);
  const address=byId.get(clinic.address?.['@id']);
  if(!address)throw new Error('Head graph lacks canonical clinic address node');

  const phone=normalizePhone(clinic.telephone);
  if(!/^\+98\d{10}$/.test(phone))throw new Error(`Invalid canonical clinic telephone: ${clinic.telephone}`);
  const localPhone=`0${phone.slice(3)}`;
  const instagramUrl=asArray(release.primaryEntity?.verifiedWebIdentityMesh).find(url=>/^https:\/\/www\.instagram\.com\/[A-Za-z0-9._-]+\/?$/.test(String(url)));
  if(!instagramUrl)throw new Error('Official Instagram URL missing from identity mesh');
  const instagramHandle=new URL(instagramUrl).pathname.split('/').filter(Boolean)[0];

  if(String(address.postalCode)!==String(release.clinic.postalCode))throw new Error('Clinic postal-code authority drift');
  const hours=String(release.clinic.hours||'').match(/^Saturday–Thursday (\d{2}:\d{2})–(\d{2}:\d{2}); Friday closed$/);
  if(!hours||release.clinic.fridayClosed!==true)throw new Error(`Unsupported clinic hours contract: ${release.clinic.hours}`);
  const clinicName=text(clinic.name)||'کلینیک زیبایی دکتر سعید قزلباش';
  const locality=text(address.addressLocality);
  const street=text(address.streetAddress);
  if(!locality||!street)throw new Error('Canonical clinic address is incomplete');

  const directions=new URL('https://www.google.com/maps/dir/');
  directions.searchParams.set('api','1');
  directions.searchParams.set('destination',`${clinicName}، ${locality}`);
  directions.searchParams.set('destination_place_id',release.clinic.placeId);

  return Object.freeze({
    phone,
    telHref:`tel:${phone}`,
    phoneDisplay:faDigits(localPhone),
    phoneDisplayGrouped:faDigits(groupLocalPhone(localPhone)),
    phoneDisplayInternational:groupInternationalPhone(phone),
    instagramUrl,
    instagramHandle,
    chatUrl:`https://ig.me/m/${instagramHandle}`,
    mapsUrl:`https://www.google.com/maps?cid=${release.clinic.cid}`,
    directionsUrl:directions.toString(),
    clinicName,
    street,
    locality,
    postalCode:String(address.postalCode),
    hoursDisplay:`شنبه تا پنجشنبه ${faDigits(hours[1])} تا ${faDigits(hours[2])} و جمعه تعطیل`,
    medicalReviewedAt:release.medicalReviewedAt,
    medicalReviewedPersian:formatDate(release.medicalReviewedAt,'persian'),
    medicalReviewedGregorian:formatDate(release.medicalReviewedAt,'gregory'),
  });
}

const siteTokenPattern=/{{(?:CLINIC_[A-Z0-9_]+|OFFICIAL_[A-Z0-9_]+)}}/g;

export function siteTokenValues(site){
  if(!site?.telHref||!site?.instagramUrl||!site?.chatUrl||!site?.mapsUrl)throw new Error('Invalid canonical site token source');
  const hours=String(site.hoursDisplay||'').match(/^شنبه تا پنجشنبه (\S+) تا (\S+) و جمعه تعطیل$/);
  if(!hours)throw new Error(`Unsupported canonical site hours display: ${site.hoursDisplay}`);
  return Object.freeze({
    '{{CLINIC_TEL_HREF}}':site.telHref,
    '{{CLINIC_PHONE_FA}}':site.phoneDisplayGrouped,
    '{{CLINIC_PHONE_INTL}}':site.phoneDisplayInternational,
    '{{OFFICIAL_INSTAGRAM_URL}}':site.instagramUrl,
    '{{OFFICIAL_CHAT_URL}}':site.chatUrl,
    '{{CLINIC_MAPS_URL}}':site.mapsUrl,
    '{{CLINIC_POSTAL_CODE_FA}}':faDigits(site.postalCode),
    '{{CLINIC_HOURS_COMPACT_FA}}':`شنبه تا پنجشنبه ${hours[1].replace(':۰۰','')}–${hours[2].replace(':۰۰','')}؛ جمعه تعطیل`,
    '{{CLINIC_HOURS_WEEKDAYS_FA}}':`شنبه تا پنجشنبه، ${hours[1]} تا ${hours[2]}`,
    '{{CLINIC_FRIDAY_CLOSED_FA}}':'جمعه تعطیل.',
  });
}

export function bindSiteTokens(content,site){
  const source=String(content);
  const values=siteTokenValues(site);
  const seen=new Set(source.match(siteTokenPattern)||[]);
  for(const token of seen)if(!Object.hasOwn(values,token))throw new Error(`Unknown site token: ${token}`);
  const bound=source.replace(siteTokenPattern,token=>String(values[token]));
  const unresolved=bound.match(siteTokenPattern)||[];
  if(unresolved.length)throw new Error(`Unresolved site token: ${[...new Set(unresolved)].join(', ')}`);
  return bound;
}
