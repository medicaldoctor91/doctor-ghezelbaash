import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderEvidenceRelatedVideos} from '../src/lib/evidence-related-video-links.mjs';

const origin='https://www.ghezelbaash.ir';
const physician=origin+'/#saeed-ghezelbash';
const procedure=origin+'/procedure-thread-lift';
const articlePath='/thread-lift';
const videoPath='/video-saeed-ghezelbash-thread-lift-workshop';
const record=(path,title,bodyHtml='')=>({path,canonicalUrl:origin+path,title,lang:'fa-IR',bodyHtml});
const records=new Map([[articlePath,record(articlePath,'لیفت نخ')],[videoPath,record(videoPath,'ورکشاپ لیفت نخ')]]);
const graph={'@graph':[
  {'@id':procedure,'@type':['MedicalProcedure','Service'],provider:{'@id':physician}},
  {'@id':origin+articlePath+'#article','@type':'Article',url:origin+articlePath,author:{'@id':physician},about:[{'@id':procedure}]},
  {'@id':origin+'/video-thread-lift-workshop','@type':'VideoObject',url:origin+videoPath,creator:{'@id':physician},about:[{'@id':procedure}]}
]};

test('render an exact physician-authored article-to-watch-page link based on Service.about',()=>{
  const html=renderEvidenceRelatedVideos({record:records.get(articlePath),recordByPath:records,graph,physicianId:physician});
  assert.match(html,/data-evidence-related-videos/);
  assert.match(html,/href="\/video-saeed-ghezelbash-thread-lift-workshop"/);
  assert.match(html,/ورکشاپ لیفت نخ/);
  assert.equal(renderEvidenceRelatedVideos({record:{...records.get(articlePath),bodyHtml:'<a href="'+videoPath+'">video</a>'},recordByPath:records,graph,physicianId:physician}),'','Do not duplicate authored direct links');
});

test('never synthesize topical links without exact Service/provider or first-party video authorship',()=>{
  for(const mutation of ['unrelatedService','differentDoctor','unrelatedVideo','noVideoRoute','personOnly']){
    const sample=structuredClone(graph),routes=new Map(records);
    if(mutation==='unrelatedService')sample['@graph'][1].about=[{'@id':origin+'/other-service'}];
    if(mutation==='differentDoctor')sample['@graph'][0].provider={'@id':origin+'/other-physician'};
    if(mutation==='unrelatedVideo')sample['@graph'][2].creator={'@id':origin+'/another-person'};
    if(mutation==='noVideoRoute')routes.delete(videoPath);
    if(mutation==='personOnly')sample['@graph'][1].about=[{'@id':physician}];
    assert.equal(renderEvidenceRelatedVideos({record:records.get(articlePath),recordByPath:routes,graph:sample,physicianId:physician}),'',mutation);
  }
});

test('published thread-lift articles visibly link to the corresponding existing watch page',()=>{
  const sources=[
    'thread-lift',
    'thread-lift-by-anatomic-area',
    'thread-lift-complications-preparation-and-aftercare',
    'thread-lift-contraindications',
    'thread-lift-pre-treatment-assessment',
    'thread-lift-vs-surgery-hifu-and-radiofrequency',
    'thread-types-and-selection'
  ];
  for(const slug of sources){
    const html=readFileSync(new URL('../dist/'+slug+'.html',import.meta.url),'utf8');
    assert.match(html,/data-evidence-related-videos/,slug+' must have the evidence-linked video navigation');
    assert.match(html,/href="\/video-saeed-ghezelbash-thread-lift-workshop"/,slug+' lacks its exact existing video destination');
  }
  for(const slug of ['mesobotox-and-borderline-treatments','buccal-fat-removal-facial-fullness-assessment']){
    const html=readFileSync(new URL('../dist/'+slug+'.html',import.meta.url),'utf8');
    assert.doesNotMatch(html,/data-evidence-related-videos/,slug+' must not infer unrelated topic links');
  }
});
