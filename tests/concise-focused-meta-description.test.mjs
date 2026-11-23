import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {conciseFocusedMetaDescription, conciseMetaRoutes} from '../src/lib/concise-focused-meta-description.mjs';

const origin='https://www.ghezelbaash.ir/';
const attr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
const walk=(node,acc=[])=>{acc.push(node);for(const child of node.childNodes??[])walk(child,acc);return acc;};
const examples=new Map([
  ['/buccal-fat-removal-facial-fullness-assessment',
   'بوکال فت یا چربی بوکال یکی از بخش‌های عمقی چربی گونه است. این چربی نه همان چربی زیر چانه است، نه عضله ماستر و نه هر پُری‌ای که در نگاه اول روبه‌رو دیده می‌شود. پهنی پایین صورت می‌تواند از استخوان، عضله ماستر، چربی سطحی، افتادگی، فرم فک، وزن بدن یا ترکیب چند عامل بیاید.'],
  ['/video-saeed-ghezelbash-subcision-technique',
   'در این ویدئوی ۳۶ ثانیه‌ای، دکتر سعید قزلباش درباره سابسیژن اسکار آکنه، آزادسازی بافت‌های چسبیده و نقش فیلر مونوفازیک در برنامه درمانی توضیح می‌دهد. متن گفتار، زیرنویس و فصل‌های زمان‌دار همراه ویدئو در دسترس‌اند.'],
  ['/video-saeed-ghezelbash-kurdish-patient-review',
   'لە ئەم ڤیدیۆیەی ٢٠ چرکەییدا، مراجعێکی کوردزمان لە هەولێر ئەزموونی سەردانی خۆی دەگێڕێتەوە و سوپاسی دکتۆر سەعید قزلباش دەکات. بەشەکانی ڤیدیۆ کات‌نیشانکراون و بەستەری بڵاوکراوە سەرەکییەکەی ئینستاگرام لە پەڕەکەدا هەیە.'],
  ['/video-saeed-ghezelbash-thread-lift-workshop',
   'گزیده‌ای ۳۹ ثانیه‌ای از ورکشاپ لیفت نخ دکتر سعید قزلباش در تهران، با توضیح جهت نخ، نقطه ورود و تفاوت رفتار بافت اسکار‌دار. ویدئو همراه با زیرنویس فارسی، متن گفتار و فصل‌های زمان‌دار ارائه شده است.'],
]);

test('four measured metadata warnings are shortened only at complete authored sentence boundaries',()=>{
  assert.deepEqual([...examples.keys()],conciseMetaRoutes);
  for(const [path,source] of examples) {
    const excerpt=conciseFocusedMetaDescription(path,source);
    assert.ok(source.startsWith(excerpt),path+' must be exact authored prefix');
    assert.match(excerpt,/[.!?؟]$/u,path+' must end at a sentence boundary');
    assert.ok(excerpt.length>=70&&excerpt.length<=160,path+' expected length 70..160, found '+excerpt.length);
    assert.ok(excerpt.length<source.length,path+' must actually improve overlong metadata');
  }
  assert.equal(conciseFocusedMetaDescription('/other',examples.values().next().value),examples.values().next().value);
});

test('metadata source drift or non-sentence fragments cannot produce invented clinical language',()=>{
  for(const path of examples.keys()) {
    assert.throws(()=>conciseFocusedMetaDescription(path,'Unrelated short text.'),/source changed/);
    assert.throws(()=>conciseFocusedMetaDescription(path,undefined),/authored text/);
  }
  assert.throws(()=>conciseFocusedMetaDescription(
    '/buccal-fat-removal-facial-fullness-assessment',
    'بوکال فت یا چربی بوکال '+'طولانی '.repeat(40)),
    /No faithful/);
});

test('each corrected live route emits identical concise meta, Open Graph and Twitter summaries',()=>{
  for(const path of examples.keys()) {
    const html=readFileSync(new URL('../dist/'+path.slice(1)+'.html',import.meta.url),'utf8');
    const doc=parse(html),head=walk(doc).find(n=>n.tagName==='head');
    assert.ok(head,path+' has HEAD');
    const tags=walk(head).filter(n=>n.tagName==='meta');
    const desc=tags.find(n=>attr(n,'name')==='description');
    const og=tags.find(n=>attr(n,'property')==='og:description');
    const tw=tags.find(n=>attr(n,'name')==='twitter:description');
    assert.ok(desc&&og&&tw,path+' has three descriptions');
    const text=attr(desc,'content');
    assert.equal(attr(og,'content'),text,path+' OG parity');
    assert.equal(attr(tw,'content'),text,path+' Twitter parity');
    assert.ok(text.length>=70&&text.length<=160,path+' metadata length must meet cap');
    assert.ok(examples.get(path).startsWith(text),path+' description must remain authored');
    assert.equal(walk(head).filter(n=>n.tagName==='link'&&attr(n,'rel')==='canonical').length,1);
    assert.ok(walk(head).some(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json'));
  }
});
