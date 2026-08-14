#!/usr/bin/env python3
import hashlib,json,re,shutil,subprocess,sys
from pathlib import Path

ROOT=Path.cwd()
MEDIA=ROOT/'public/media/images/physician'
TMP=Path('/tmp/v122-responsive-media-v5')
TMP.mkdir(parents=True,exist_ok=True)
(TMP/'ref').mkdir(exist_ok=True);(TMP/'candidates').mkdir(exist_ok=True)

def run(args,**kw):
    print('+',' '.join(map(str,args)),flush=True)
    return subprocess.run(list(map(str,args)),check=True,**kw)

def out(args): return subprocess.check_output(list(map(str,args)),text=True).strip()
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
    r640=resize_ref(master,640,f'{prefix}-640');r960=resize_ref(master,960,f'{prefix}-960')
    a=ffmpeg_ssim(r640,low);b=ffmpeg_ssim(r960,high);threshold=min(a,b)
    print(json.dumps({'baseline':prefix,'ssim640':a,'ssim960':b,'threshold':threshold}))
    return threshold

def copy_metadata(src,dst):
    run([ROOT/'node_modules/.bin/exiftool','-config','scripts/exiftool-entity.config','-TagsFromFile',src,'-all:all','-overwrite_original',dst],stdout=subprocess.DEVNULL)

def choose_avif(master,width,threshold,logical,metadata_source,upper_source):
    ref=resize_ref(master,width,logical);accepted=[]
    # Higher AV1 quantizer => smaller/lower-quality file. Search through and stop only by quality floor.
    for q in range(60,17,-2):
        candidate=TMP/'candidates'/f'{logical}-q{q}.avif'
        run(['avifenc','--min',q,'--max',q,'--speed','6',ref,candidate],stdout=subprocess.DEVNULL)
        copy_metadata(metadata_source,candidate)
        score=ffmpeg_ssim(ref,candidate);size=candidate.stat().st_size;ok=score>=threshold
        print(json.dumps({'candidate':logical,'format':'avif','quantizer':q,'bytes':size,'ssim':score,'threshold':threshold,'accepted':ok}))
        if ok: accepted.append((size,q,score,candidate))
    if not accepted: raise RuntimeError(f'No quality-safe AVIF candidate for {logical}')
    size,q,score,candidate=min(accepted,key=lambda x:x[0]);upper=Path(upper_source).stat().st_size
    if size>=upper: raise RuntimeError(f'{logical}.avif not smaller than 960 source: {size}>={upper}')
    fp=sha12(candidate);final=MEDIA/f'{logical}.{fp}.avif';shutil.copy2(candidate,final)
    if sha12(final)!=fp: raise RuntimeError(f'Fingerprint mismatch {final}')
    wh=out(['identify','-format','%w|%h',final])
    print(json.dumps({'selected':logical,'format':'avif','quantizer':q,'bytes':size,'upperBytes':upper,'savedBytes':upper-size,'ssim':score,'threshold':threshold,'path':str(final),'dimensions':wh}))
    return final,wh,size,upper

def replace_once(path,old,new):
    p=Path(path);text=p.read_text();count=text.count(old)
    if count!=1: raise RuntimeError(f'{path}: expected one target, got {count}: {old[:100]}')
    p.write_text(text.replace(old,new))

def main():
    hero_master=MEDIA/'master/saeed-ghezelbaash-physician-portrait.55e6a60c60bc.jpg'
    clinical_master=MEDIA/'master/saeed-ghezelbaash-in-clinical-office.da2f60febc2e.jpg'
    hero640=MEDIA/'saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif';hero960=MEDIA/'saeed-ghezelbash-portrait-960.497fc78613ac.avif'
    clinical640=MEDIA/'saeed-ghezelbash-in-clinical-office-delivery-640.92cc73c7a8c8.avif';clinical960=MEDIA/'saeed-ghezelbash-clinical-examination-960.c7b107d19e68.avif'
    for p in [hero_master,clinical_master,hero640,hero960,clinical640,clinical960]:
        if not p.is_file(): raise RuntimeError(f'Missing source {p}')
    for pat in ['saeed-ghezelbash-portrait-720.*.avif','saeed-ghezelbash-portrait-800.*.avif','saeed-ghezelbash-clinical-examination-720.*.avif','saeed-ghezelbash-clinical-examination-800.*.avif']:
        if list(MEDIA.glob(pat)): raise RuntimeError(f'Experiment output already exists: {pat}')
    hero_min=baseline_threshold(hero_master,hero640,hero960,'hero-avif')
    clinical_min=baseline_threshold(clinical_master,clinical640,clinical960,'clinical-avif')
    selected={};savings=0
    for width in (720,800):
        row=choose_avif(hero_master,width,hero_min,f'saeed-ghezelbash-portrait-{width}',hero960,hero960);selected[(f'saeed-ghezelbash-portrait-{width}','avif')]=row[:2];savings+=row[3]-row[2]
        row=choose_avif(clinical_master,width,clinical_min,f'saeed-ghezelbash-clinical-examination-{width}',clinical960,clinical960);selected[(f'saeed-ghezelbash-clinical-examination-{width}','avif')]=row[:2];savings+=row[3]-row[2]
    if len(selected)!=4: raise RuntimeError(f'Expected 4 AVIF outputs, got {len(selected)}')
    def url(stem): return '/media/images/physician/'+selected[(stem,'avif')][0].name
    avif_hero_old='/media/images/physician/saeed-ghezelbash-portrait-delivery-640.7b2b6ac2affa.avif 640w, /media/images/physician/saeed-ghezelbash-portrait-960.497fc78613ac.avif 960w'
    avif_hero_new=f'/media/images/physician/{hero640.name} 640w, {url("saeed-ghezelbash-portrait-720")} 720w, {url("saeed-ghezelbash-portrait-800")} 800w, /media/images/physician/{hero960.name} 960w'
    avif_clin_old='/media/images/physician/saeed-ghezelbash-in-clinical-office-delivery-640.92cc73c7a8c8.avif 640w, /media/images/physician/saeed-ghezelbash-clinical-examination-960.c7b107d19e68.avif 960w'
    avif_clin_new=f'/media/images/physician/{clinical640.name} 640w, {url("saeed-ghezelbash-clinical-examination-720")} 720w, {url("saeed-ghezelbash-clinical-examination-800")} 800w, /media/images/physician/{clinical960.name} 960w'
    replace_once('src/content-source/001-intro.html',avif_hero_old,avif_hero_new);replace_once('src/content-source/001-intro.html',avif_clin_old,avif_clin_new)
    replace_once('src/data/templates/main-head.html',avif_hero_old,avif_hero_new)
    dims=Path('src/data/media-dimensions.tsv');text=dims.read_text().rstrip('\n')+'\n'
    for (stem,_),(p,wh) in sorted(selected.items()):
        logical=f'public/media/images/physician/{stem}.avif'
        if logical+'|' in text: raise RuntimeError(f'Duplicate dimensions row {logical}')
        text+=f'{logical}|{wh}\n'
    dims.write_text(text)
    replace_once('scripts/sync-media-references.mjs','if(rasters.length!==49)throw new Error(`Expected 49 canonical raster assets, found ${rasters.length}`);','if(rasters.length!==53)throw new Error(`Expected 53 canonical raster assets, found ${rasters.length}`);')
    for old,new in [
      ('if(expectedDimensions.size!==49)fail(`Expected dimension inventory drift: ${expectedDimensions.size}`);','if(expectedDimensions.size!==53)fail(`Expected dimension inventory drift: ${expectedDimensions.size}`);'),
      ('if(rasters.length!==49)fail(`Expected exactly 49 raster images, found ${rasters.length}`);','if(rasters.length!==53)fail(`Expected exactly 53 raster images, found ${rasters.length}`);'),
      ('if(logicalAssets.size!==49)fail(`Logical raster inventory drift: ${logicalAssets.size}`);','if(logicalAssets.size!==53)fail(`Logical raster inventory drift: ${logicalAssets.size}`);'),
      ('if(rows.length!==49)fail(`Embedded metadata row count drift: ${rows.length}`);','if(rows.length!==53)fail(`Embedded metadata row count drift: ${rows.length}`);'),
      ('if(currentHits<49)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);','if(currentHits<53)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);'),
      ("embeddedMetadataCoverage:'49/49',googleKnowledgeGraphRawIdCoverage:'49/49'","embeddedMetadataCoverage:'53/53',googleKnowledgeGraphRawIdCoverage:'53/53'")]: replace_once('scripts/validate-media.mjs',old,new)
    print(json.dumps({'responsiveMediaCompiler':'PASS','mode':'AVIF-only responsive expansion; existing WebP fallback unchanged','outputs':[str(v[0]) for v in selected.values()],'qualityFloors':{'hero':hero_min,'clinical':clinical_min},'aggregateUpperBoundSavingsBytes':savings,'mediaInventory':53},indent=2))

if __name__=='__main__': main()
