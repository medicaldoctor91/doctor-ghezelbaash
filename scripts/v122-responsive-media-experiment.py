#!/usr/bin/env python3
import hashlib,json,os,re,shutil,subprocess,sys
from pathlib import Path

ROOT=Path.cwd()
MEDIA=ROOT/'public/media/images/physician'
TMP=Path('/tmp/v122-responsive-media-v3')
TMP.mkdir(parents=True,exist_ok=True)
(TMP/'ref').mkdir(exist_ok=True);(TMP/'candidates').mkdir(exist_ok=True)

def run(args,**kw):
    print('+',' '.join(map(str,args)),flush=True)
    return subprocess.run(list(map(str,args)),check=True,**kw)

def out(args):
    return subprocess.check_output(list(map(str,args)),text=True).strip()

def sha12(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()[:12]

def ffmpeg_ssim(ref,img):
    p=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(ref),'-i',str(img),'-lavfi','ssim','-f','null','-'],capture_output=True,text=True)
    text=(p.stderr or '')+'\n'+(p.stdout or '')
    matches=re.findall(r'All:([0-9]+(?:\.[0-9]+)?)',text)
    if not matches:
        print(text,file=sys.stderr);raise RuntimeError(f'FFmpeg SSIM metric missing for {img}')
    return float(matches[-1])

def resize_ref(master,width,name):
    ref=TMP/'ref'/f'{name}.png'
    run(['convert',master,'-auto-orient','-resize',f'{width}x','-strip',ref])
    return ref

def baseline_threshold(master,low,high,prefix):
    r640=resize_ref(master,640,f'{prefix}-640')
    r960=resize_ref(master,960,f'{prefix}-960')
    a=ffmpeg_ssim(r640,low);b=ffmpeg_ssim(r960,high)
    threshold=min(a,b)
    print(json.dumps({'baseline':prefix,'ssim640':a,'ssim960':b,'threshold':threshold}))
    return threshold

def copy_metadata(src,dst):
    exif=ROOT/'node_modules/.bin/exiftool'
    run([exif,'-config','scripts/exiftool-entity.config','-TagsFromFile',src,'-all:all','-overwrite_original',dst],stdout=subprocess.DEVNULL)

def choose(master,width,fmt,threshold,logical,metadata_source,upper_source):
    ref=resize_ref(master,width,logical)
    settings=[36,34,32,30,28,26,24,22,20,18] if fmt=='avif' else [65,70,75,80,85,90,95]
    accepted=[]
    for q in settings:
        candidate=TMP/'candidates'/f'{logical}-{q}.{fmt}'
        if fmt=='avif': run(['avifenc','--min',q,'--max',q,'--speed','6',ref,candidate],stdout=subprocess.DEVNULL)
        else: run(['convert',ref,'-quality',q,candidate])
        copy_metadata(metadata_source,candidate)
        score=ffmpeg_ssim(ref,candidate);size=candidate.stat().st_size
        ok=score>=threshold
        print(json.dumps({'candidate':logical,'format':fmt,'setting':q,'bytes':size,'ssim':score,'threshold':threshold,'accepted':ok}))
        if ok: accepted.append((size,q,score,candidate))
    if not accepted: raise RuntimeError(f'No quality-safe candidate for {logical}.{fmt}')
    size,q,score,candidate=min(accepted,key=lambda x:x[0])
    upper=Path(upper_source).stat().st_size
    if size>=upper: raise RuntimeError(f'{logical}.{fmt} not smaller than 960 source: {size}>={upper}')
    fp=sha12(candidate);final=MEDIA/f'{logical}.{fp}.{fmt}'
    shutil.copy2(candidate,final)
    if sha12(final)!=fp: raise RuntimeError(f'Fingerprint mismatch {final}')
    wh=out(['identify','-format','%w|%h',final])
    print(json.dumps({'selected':logical,'format':fmt,'setting':q,'bytes':size,'upperBytes':upper,'ssim':score,'threshold':threshold,'path':str(final),'dimensions':wh}))
    return final,wh

def replace_once(path,old,new):
    p=Path(path);text=p.read_text();count=text.count(old)
    if count!=1: raise RuntimeError(f'{path}: expected one target, got {count}: {old[:100]}')
    p.write_text(text.replace(old,new))

def main():
    hero_master=MEDIA/'master/saeed-ghezelbaash-physician-portrait.55e6a60c60bc.jpg'
    clinical_master=MEDIA/'master/saeed-ghezelbaash-in-clinical-office.da2f60febc2e.jpg'
    sources={
      'hero_a640':MEDIA/'saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif','hero_a960':MEDIA/'saeed-ghezelbash-portrait-960.497fc78613ac.avif',
      'clinical_a640':MEDIA/'saeed-ghezelbash-in-clinical-office-delivery-640.92cc73c7a8c8.avif','clinical_a960':MEDIA/'saeed-ghezelbash-clinical-examination-960.c7b107d19e68.avif',
      'hero_w640':MEDIA/'saeed-ghezelbash-portrait-delivery-640.b267bddf872d.webp','hero_w960':MEDIA/'saeed-ghezelbash-portrait-960.d67587e1de85.webp',
      'clinical_w640':MEDIA/'saeed-ghezelbash-in-clinical-office-delivery-640.87655757c9a5.webp','clinical_w960':MEDIA/'saeed-ghezelbash-clinical-examination-960.db655b6d5de3.webp'}
    for p in [hero_master,clinical_master,*sources.values()]:
        if not p.is_file(): raise RuntimeError(f'Missing source {p}')
    for pat in ['saeed-ghezelbash-portrait-720.*.*','saeed-ghezelbash-portrait-800.*.*','saeed-ghezelbash-clinical-examination-720.*.*','saeed-ghezelbash-clinical-examination-800.*.*']:
        if list(MEDIA.glob(pat)): raise RuntimeError(f'Experiment output already exists: {pat}')
    thresholds={
      'hero_avif':baseline_threshold(hero_master,sources['hero_a640'],sources['hero_a960'],'hero-avif'),
      'clinical_avif':baseline_threshold(clinical_master,sources['clinical_a640'],sources['clinical_a960'],'clinical-avif'),
      'hero_webp':baseline_threshold(hero_master,sources['hero_w640'],sources['hero_w960'],'hero-webp'),
      'clinical_webp':baseline_threshold(clinical_master,sources['clinical_w640'],sources['clinical_w960'],'clinical-webp')}
    selected={}
    for width in (720,800):
        selected[(f'saeed-ghezelbash-portrait-{width}','avif')]=choose(hero_master,width,'avif',thresholds['hero_avif'],f'saeed-ghezelbash-portrait-{width}',sources['hero_a960'],sources['hero_a960'])
        selected[(f'saeed-ghezelbash-portrait-{width}','webp')]=choose(hero_master,width,'webp',thresholds['hero_webp'],f'saeed-ghezelbash-portrait-{width}',sources['hero_w960'],sources['hero_w960'])
        selected[(f'saeed-ghezelbash-clinical-examination-{width}','avif')]=choose(clinical_master,width,'avif',thresholds['clinical_avif'],f'saeed-ghezelbash-clinical-examination-{width}',sources['clinical_a960'],sources['clinical_a960'])
        selected[(f'saeed-ghezelbash-clinical-examination-{width}','webp')]=choose(clinical_master,width,'webp',thresholds['clinical_webp'],f'saeed-ghezelbash-clinical-examination-{width}',sources['clinical_w960'],sources['clinical_w960'])
    if len(selected)!=8: raise RuntimeError(f'Expected 8 outputs, got {len(selected)}')
    def url(stem,ext): return '/media/images/physician/'+selected[(stem,ext)][0].name
    intro=Path('src/content-source/001-intro.html')
    avif_hero_old='/media/images/physician/saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif 640w, /media/images/physician/saeed-ghezelbash-portrait-960.497fc78613ac.avif 960w'
    avif_hero_new=f'{sources["hero_a640"].as_posix().replace("public","")} 640w, {url("saeed-ghezelbash-portrait-720","avif")} 720w, {url("saeed-ghezelbash-portrait-800","avif")} 800w, {sources["hero_a960"].as_posix().replace("public","")} 960w'
    webp_hero_old='/media/images/physician/saeed-ghezelbash-portrait-delivery-640.b267bddf872d.webp 640w, /media/images/physician/saeed-ghezelbash-portrait-960.d67587e1de85.webp 960w'
    webp_hero_new=f'{sources["hero_w640"].as_posix().replace("public","")} 640w, {url("saeed-ghezelbash-portrait-720","webp")} 720w, {url("saeed-ghezelbash-portrait-800","webp")} 800w, {sources["hero_w960"].as_posix().replace("public","")} 960w'
    avif_clin_old='/media/images/physician/saeed-ghezelbash-in-clinical-office-delivery-640.92cc73c7a8c8.avif 640w, /media/images/physician/saeed-ghezelbash-clinical-examination-960.c7b107d19e68.avif 960w'
    avif_clin_new=f'{sources["clinical_a640"].as_posix().replace("public","")} 640w, {url("saeed-ghezelbash-clinical-examination-720","avif")} 720w, {url("saeed-ghezelbash-clinical-examination-800","avif")} 800w, {sources["clinical_a960"].as_posix().replace("public","")} 960w'
    webp_clin_old='/media/images/physician/saeed-ghezelbash-in-clinical-office-delivery-640.87655757c9a5.webp 640w, /media/images/physician/saeed-ghezelbash-clinical-examination-960.db655b6d5de3.webp 960w'
    webp_clin_new=f'{sources["clinical_w640"].as_posix().replace("public","")} 640w, {url("saeed-ghezelbash-clinical-examination-720","webp")} 720w, {url("saeed-ghezelbash-clinical-examination-800","webp")} 800w, {sources["clinical_w960"].as_posix().replace("public","")} 960w'
    for old,new in [(avif_hero_old,avif_hero_new),(webp_hero_old,webp_hero_new),(avif_clin_old,avif_clin_new),(webp_clin_old,webp_clin_new)]: replace_once(intro,old,new)
    replace_once('src/data/templates/main-head.html',avif_hero_old,avif_hero_new)
    dims=Path('src/data/media-dimensions.tsv');text=dims.read_text().rstrip('\n')+'\n'
    for (stem,ext),(p,wh) in sorted(selected.items()):
        logical=f'public/media/images/physician/{stem}.{ext}'
        if logical+'|' in text: raise RuntimeError(f'Duplicate dimensions row {logical}')
        text+=f'{logical}|{wh}\n'
    dims.write_text(text)
    replace_once('scripts/sync-media-references.mjs','if(rasters.length!==49)throw new Error(`Expected 49 canonical raster assets, found ${rasters.length}`);','if(rasters.length!==57)throw new Error(`Expected 57 canonical raster assets, found ${rasters.length}`);')
    replacements=[
      ('if(expectedDimensions.size!==49)fail(`Expected dimension inventory drift: ${expectedDimensions.size}`);','if(expectedDimensions.size!==57)fail(`Expected dimension inventory drift: ${expectedDimensions.size}`);'),
      ('if(rasters.length!==49)fail(`Expected exactly 49 raster images, found ${rasters.length}`);','if(rasters.length!==57)fail(`Expected exactly 57 raster images, found ${rasters.length}`);'),
      ('if(logicalAssets.size!==49)fail(`Logical raster inventory drift: ${logicalAssets.size}`);','if(logicalAssets.size!==57)fail(`Logical raster inventory drift: ${logicalAssets.size}`);'),
      ('if(rows.length!==49)fail(`Embedded metadata row count drift: ${rows.length}`);','if(rows.length!==57)fail(`Embedded metadata row count drift: ${rows.length}`);'),
      ('if(currentHits<49)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);','if(currentHits<57)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);'),
      ("embeddedMetadataCoverage:'49/49',googleKnowledgeGraphRawIdCoverage:'49/49'","embeddedMetadataCoverage:'57/57',googleKnowledgeGraphRawIdCoverage:'57/57'")]
    for old,new in replacements: replace_once('scripts/validate-media.mjs',old,new)
    print(json.dumps({'responsiveMediaCompiler':'PASS','outputs':[str(v[0]) for v in selected.values()],'thresholds':thresholds},indent=2))

if __name__=='__main__': main()
