import {readFile,writeFile} from 'node:fs/promises';

const path='src/content-source/page.md';
let source=await readFile(path,'utf8');
const replaceOnce=(from,to,label)=>{
  const first=source.indexOf(from),last=source.lastIndexOf(from);
  if(first<0||first!==last)throw new Error(`${label}: expected exactly one source match`);
  source=source.slice(0,first)+to+source.slice(first+from.length);
};

replaceOnce('<div aria-label="اقدام‌های اصلی برای مراجعه و استفاده از راهنما" class="hero-actions">','<div aria-label="اقدام‌های اصلی برای مراجعه و استفاده از راهنما" class="hero-actions" role="group">','hero actions ARIA owner');
replaceOnce('aria-label="مشاهده نمونه‌کارهای دکتر سعید قزلباش در اینستاگرام"','aria-label="مشاهده نمونه‌کارهای دکتر قزلباش در اینستاگرام رسمی"','Instagram accessible name');
replaceOnce('loading="eager" sizes="{{HERO_IMAGE_SIZES}}" src="/media/images/physician/saeed-ghezelbash-portrait-delivery-640.b267bddf872d.webp"','loading="eager" src="/media/images/physician/saeed-ghezelbash-portrait-delivery-640.b267bddf872d.webp"','fallback image sizes');
replaceOnce('<div aria-label="اطلاعات اعتماد و دسترسی" class="hero-caption-facts">','<div aria-label="اطلاعات اعتماد و دسترسی" class="hero-caption-facts" role="group">','hero caption ARIA owner');
replaceOnce('<div aria-label="هویت تأییدشده پزشک" class="verified-identity-core figure-identity-core" id="verified-physician-identity-core">','<div aria-label="هویت تأییدشده پزشک" class="verified-identity-core figure-identity-core" id="verified-physician-identity-core" role="group">','verified identity ARIA owner');
replaceOnce('</dd></dl>\n</section>\n<section aria-labelledby="medical-content-governance-title"','</dd></dl>\n</div>\n</section>\n<section aria-labelledby="medical-content-governance-title"','close rc109 before clinic section');
replaceOnce('</aside>\n</section>\n</div>\n<details class="final-collapsible-section multilingual-aesthetic-section"','</aside>\n</section>\n<details class="final-collapsible-section multilingual-aesthetic-section"','remove cross-section stray div');

await writeFile(path,source,'utf8');
console.log(JSON.stringify({patched:true,path,bytes:Buffer.byteLength(source),integrity:'PASS'}));
