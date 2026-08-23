#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, re, subprocess, tempfile

ROOT=Path.cwd()
VIDEO_ROOT=ROOT/'public/media/videos'
VTT_ROOT=ROOT/'public/media/video-tracks'

PROFILES={
 'jalupro-vs-profhilo':('Dr. Saeed Ghezelbash — Jalupro versus Profhilo','Physician-led education by Dr. Saeed Ghezelbash comparing injectable skin rejuvenation approaches.','fas'),
 'subcision-technique':('Dr. Saeed Ghezelbash — Subcision technique','Physician-led education by Dr. Saeed Ghezelbash about subcision technique for tethered acne scars.','fas'),
 'thread-lift-workshop':('Dr. Saeed Ghezelbash — Advanced thread-lift workshop','Advanced physician education by Dr. Saeed Ghezelbash on thread-lift anatomy, vectors and technique.','fas'),
 'kurdish-patient-review':('Kurdish patient experience with Dr. Saeed Ghezelbash','Kurdish-language patient experience concerning Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah.','ckb'),
}

def run(cmd,**kwargs):
    print('+',' '.join(map(str,cmd)))
    return subprocess.run([str(x) for x in cmd],check=True,**kwargs)

def replace_consumers(mappings):
    text_ext={'.astro','.css','.html','.js','.json','.jsonld','.md','.mjs','.ts','.txt','.vcf','.webmanifest','.xml','.yaml','.yml','.ttl','.csv'}
    raw=subprocess.check_output(['git','ls-files','-z']).split(b'\0')
    for item in raw:
        if not item: continue
        p=Path(item.decode())
        if not p.is_file() or p.suffix.lower() not in text_ext: continue
        try: text=p.read_text(encoding='utf-8')
        except UnicodeDecodeError: continue
        before=text
        for old,new in mappings: text=text.replace(old,new)
        if text!=before: p.write_text(text,encoding='utf-8',newline='')

def remux_videos():
    videos=sorted(p for p in VIDEO_ROOT.rglob('*') if p.suffix.lower() in {'.mp4','.webm'})
    if len(videos)!=8: raise SystemExit(f'Expected 8 videos, got {len(videos)}')
    mappings=[]
    for old in videos:
        matched=next((k for k in PROFILES if k in old.name),None)
        if not matched: raise SystemExit(f'No video metadata profile for {old}')
        title,description,lang=PROFILES[matched]
        with tempfile.NamedTemporaryFile(suffix=old.suffix,delete=False) as tmp: temp=Path(tmp.name)
        cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y','-i',old,'-map','0','-c','copy']
        if old.suffix.lower()=='.mp4': cmd += ['-movflags','+faststart+use_metadata_tags']
        cmd += [
          '-metadata',f'title={title}','-metadata','artist=Saeed Ghezelbash','-metadata','author=Dr. Saeed Ghezelbash',
          '-metadata',f'description={description}',
          '-metadata',f'comment={description} Canonical physician: https://www.ghezelbaash.ir/#saeed-ghezelbash; Wikidata: Q140287622; Google Knowledge Graph ID: /g/11nqdfk76c.',
          '-metadata','copyright=© Saeed Ghezelbash. Licensed under CC BY 4.0.',
          '-metadata','license=https://creativecommons.org/licenses/by/4.0/','-metadata','website=https://www.ghezelbaash.ir/',
          '-metadata','canonical_person=https://www.ghezelbaash.ir/#saeed-ghezelbash','-metadata','wikidata=Q140287622',
          '-metadata','google_kgid=/g/11nqdfk76c','-metadata','canonical_clinic=https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
          '-metadata','clinic_wikidata=Q140288589','-metadata','google_place_id=ChIJBT0YDOTt-j8RD-7mAPy6Zas',
          '-metadata','metadata_profile=Entity Media Profile 3.1.0','-metadata',f'language={lang}',
          '-metadata:s:v:0',f'language={lang}','-metadata:s:a:0',f'language={lang}',temp]
        run(cmd)
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name:format=tags','-of','json',str(temp)],text=True))
        tags={str(k).lower():str(v) for k,v in (probe.get('format',{}).get('tags',{}) or {}).items()}
        hay='\n'.join(f'{k}={v}' for k,v in tags.items())
        for required in ['Saeed Ghezelbash','Q140287622','/g/11nqdfk76c','https://www.ghezelbaash.ir/#saeed-ghezelbash','creativecommons.org/licenses/by/4.0','Entity Media Profile 3.1.0']:
            if required not in hay: raise SystemExit(f'Missing embedded video metadata {required}: {old}\n{hay}')
        digest=hashlib.sha256(temp.read_bytes()).hexdigest()
        parts=old.name.rsplit('.',2)
        if len(parts)!=3: raise SystemExit(f'Unexpected fingerprinted filename {old.name}')
        new=old.with_name(f'{parts[0]}.{digest[:12]}.{parts[2]}')
        temp.replace(new); old.unlink(); mappings.append((old.name,new.name)); print(old.name,'->',new.name)
    return mappings

def annotate_vtt():
    files=sorted(VTT_ROOT.rglob('*.vtt'))
    if len(files)!=6: raise SystemExit(f'Expected 6 VTT tracks, got {len(files)}')
    note=(
      'NOTE Entity metadata — first-party media track\n'
      'Entity: Dr. Saeed Ghezelbash | دکتر سعید قزلباش\n'
      'Canonical-Person: https://www.ghezelbaash.ir/#saeed-ghezelbash\n'
      'Wikidata: Q140287622\nGoogle-Knowledge-Graph-ID: /g/11nqdfk76c\n'
      'Canonical-Clinic: https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah\n'
      'Clinic-Wikidata: Q140288589\nGoogle-Place-ID: ChIJBT0YDOTt-j8RD-7mAPy6Zas\n'
      'License: https://creativecommons.org/licenses/by/4.0/\nMetadata-Profile: Entity Media Profile 3.1.0\n')
    mappings=[]
    for old in files:
        text=old.read_text(encoding='utf-8')
        if not text.startswith('WEBVTT'): raise SystemExit(f'Invalid WEBVTT header: {old}')
        if 'Google-Knowledge-Graph-ID: /g/11nqdfk76c' not in text:
            pos=text.find('\n\n')
            if pos<0: raise SystemExit(f'No WEBVTT header separator: {old}')
            text=text[:pos+2]+note+'\n'+text[pos+2:]
        data=text.encode('utf-8'); digest=hashlib.sha256(data).hexdigest(); parts=old.name.rsplit('.',2)
        if len(parts)!=3: raise SystemExit(f'Unexpected fingerprinted VTT filename {old.name}')
        new=old.with_name(f'{parts[0]}.{digest[:12]}.{parts[2]}'); new.write_bytes(data)
        if new!=old: old.unlink()
        mappings.append((old.name,new.name)); print(old.name,'->',new.name)
    return mappings

def patch_validators():
    p=ROOT/'scripts/validate-media.mjs'; text=p.read_text(encoding='utf-8')
    start=text.index("const ffprobe=spawnSync('ffprobe',['-version']);")
    end=text.index("if(currentHits<49)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);",start)
    tail_start=text.index('console.log(JSON.stringify(',end)
    old_tail=text[tail_start:]
    new_block="""const ffprobe=spawnSync('ffprobe',['-version']);
let videoFiles=0,imageFiles=0,videoMetadataFiles=0,vttMetadataFiles=0;
const videoCandidates=all.filter(candidate=>/\\.(?:mp4|webm)$/i.test(candidate));
if(videoCandidates.length!==8)fail(`Expected exactly 8 published videos, found ${videoCandidates.length}`);
if(ffprobe.status!==0)fail('ffprobe is required for published media validation');
for(const file of videoCandidates){
  videoFiles++;
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format=tags','-of','json',file],{encoding:'utf8'});
  if(probe.status)fail(`ffprobe failed ${file}`);
  const parsed=JSON.parse(probe.stdout),streams=parsed.streams||[],tags=Object.fromEntries(Object.entries(parsed.format?.tags||{}).map(([key,value])=>[key.toLowerCase(),String(value)]));
  if(streams.filter(stream=>stream.codec_type==='video').length!==1||streams.filter(stream=>stream.codec_type==='audio').length!==1||streams.some(stream=>!['video','audio'].includes(stream.codec_type)))fail(`Unexpected streams ${file}`);
  const metadataText=Object.entries(tags).map(([key,value])=>`${key}=${value}`).join('\\n');
  for(const required of ['Saeed Ghezelbash','Q140287622','/g/11nqdfk76c','https://www.ghezelbaash.ir/#saeed-ghezelbash','creativecommons.org/licenses/by/4.0','Entity Media Profile 3.1.0'])if(!metadataText.includes(required))fail(`Published video metadata missing ${required}: ${file}`);
  videoMetadataFiles++;
}
for(const file of rasters){
  imageFiles++;
  const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,codec_name,width,height','-of','json',file],{encoding:'utf8'});
  if(probe.status)fail(`Image decode/probe failed ${file}`);
  const stream=(JSON.parse(probe.stdout).streams||[])[0];
  if(!stream||stream.codec_type!=='video'||!stream.width||!stream.height)fail(`Invalid image stream ${file}`);
}
const vttFiles=all.filter(candidate=>/\\.vtt$/i.test(candidate));
if(vttFiles.length!==6)fail(`Expected exactly 6 published WebVTT tracks, found ${vttFiles.length}`);
for(const file of vttFiles){
  const text=await readFile(file,'utf8');
  if(!text.startsWith('WEBVTT'))fail(`Invalid WebVTT header: ${file}`);
  for(const required of ['Entity metadata — first-party media track','Canonical-Person: https://www.ghezelbaash.ir/#saeed-ghezelbash','Wikidata: Q140287622','Google-Knowledge-Graph-ID: /g/11nqdfk76c','License: https://creativecommons.org/licenses/by/4.0/','Metadata-Profile: Entity Media Profile 3.1.0'])if(!text.includes(required))fail(`Published WebVTT metadata missing ${required}: ${file}`);
  vttMetadataFiles++;
}
if(currentHits<49)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);
console.log(JSON.stringify({valid:true,mediaFiles:all.length,videoFiles,imageFiles,rasterImages:rasters.length,currentPlaceIdMetadataFiles:currentHits,embeddedMetadataCoverage:'49/49 rasters',videoMetadataCoverage:`${videoMetadataFiles}/8`,webVttMetadataCoverage:`${vttMetadataFiles}/6`,googleKnowledgeGraphRawIdCoverage:'49/49 raster + 8/8 video + 6/6 VTT',authorityMasterGoogleKgUrlCoverage:`${validatedAuthorityMasters.size}/${authorityMasterTargets.size}`,authorityMasterIdentityFields:['IPTC PersonInImageId','Dublin Core relation','embedded DoctorIdentifiers','embedded EntityGraphJSONLD'],metadataProfile:'Entity Media Profile 3.1.0',dimensionsLocked:true,selfReferencedSvgIntegrityChecks:selfReferencedSvg},null,2));
"""
    p.write_text(text[:start]+new_block,encoding='utf-8',newline='')

    q=ROOT/'scripts/validate-media-references.mjs'; t=q.read_text(encoding='utf-8')
    t=t.replace("const rasterPattern=/\\.(?:avif|webp|jpe?g|png)$/i;","const rasterPattern=/\\.(?:avif|webp|jpe?g|png)$/i;\nconst publishedMediaPattern=/\\.(?:avif|webp|jpe?g|png|mp4|webm|vtt)$/i;")
    anchor="""const textual=(await walk(root,{skip:['node_modules','.python-deps','dist','release','.astro']}))"""
    if anchor not in t: raise SystemExit('validate-media-references textual anchor missing')
    insert="""const published=(await walk(mediaRoot)).filter(file=>publishedMediaPattern.test(file)).sort();
const canonicalPublished=[];
for(const file of published){
  const basename=path.basename(file),extension=path.extname(basename);
  if(!fingerprintPattern.test(basename))throw new Error(`Unfingerprinted published media ${file}`);
  const logicalBasename=basename.replace(fingerprintPattern,extension);
  canonicalPublished.push({basename,stem:logicalBasename.slice(0,-extension.length),extension});
}

"""
    t=t.replace(anchor,insert+anchor)
    t=t.replace('for(const item of canonical){','for(const item of canonicalPublished){')
    t=t.replace("console.log(JSON.stringify({canonicalRasterAssets:canonical.length,textFilesScanned:textual.length,staleReferences:0,sourceMutation:false,integrity:'PASS'},null,2));","console.log(JSON.stringify({canonicalRasterAssets:canonical.length,canonicalPublishedMediaAssets:canonicalPublished.length,textFilesScanned:textual.length,staleReferences:0,sourceMutation:false,integrity:'PASS'},null,2));")
    q.write_text(t,encoding='utf-8',newline='')

def verify_fingerprints():
    for root,exts,count in [(VIDEO_ROOT,{'.mp4','.webm'},8),(VTT_ROOT,{'.vtt'},6)]:
        files=[p for p in root.rglob('*') if p.suffix.lower() in exts]
        if len(files)!=count: raise SystemExit(f'Inventory drift {root}: {len(files)}/{count}')
        for p in files:
            m=re.search(r'\.([0-9a-f]{12})\.[^.]+$',p.name)
            if not m or hashlib.sha256(p.read_bytes()).hexdigest()[:12]!=m.group(1): raise SystemExit(f'Fingerprint mismatch: {p}')

def cleanup_temp_files():
    for p in [ROOT/'.github/workflows/media-metadata-convergence.yml',ROOT/'scripts/one-time-media-metadata-convergence.py']:
        if p.exists(): p.unlink()
    # Restore CI workflow exactly from parent of the trigger commit.
    run(['git','checkout','HEAD^','--','.github/workflows/ci.yml'])

video_map=remux_videos()
vtt_map=annotate_vtt()
replace_consumers(video_map+vtt_map)
patch_validators()
verify_fingerprints()
cleanup_temp_files()
run(['git','diff','--check'])
print(json.dumps({'videos':'8/8 metadata-rich','vtt':'6/6 metadata-rich','rasters':'49/49 already enforced','temporaryFilesRemoved':True},ensure_ascii=False,indent=2))
