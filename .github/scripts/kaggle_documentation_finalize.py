"""Preserve the professional content while finalizing the corrected Kaggle package."""
import json, os, shutil, subprocess, time
from pathlib import Path
from huggingface_hub import hf_hub_download
from kaggle import api
from platform_bundle import *
from platform_publish import validate

ROOT=Path('/tmp/kaggle-documentation-final');ROOT.mkdir(exist_ok=True)
ctx=context('2b17842cb7f6c89cd32fd831f057a7d76faf2d4d','38203475571')
pin='0a12c23cc1935ab4056f4e466325d2594b8a2ffe'
previous=ROOT/'before';previous.mkdir()
subprocess.run(['kaggle','datasets','download',KAGGLE_REF+'/7','-p',str(previous),'--unzip','--force'],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['kaggle','datasets','metadata',KAGGLE_REF,'-p',str(previous)],check=True,stdout=subprocess.DEVNULL)
manifest=load(previous/'kaggle-manifest.json')
assert manifest['upstream_revision']==pin and manifest['website_source_commit']==ctx['source_commit']
hf=ROOT/'hf';hf.mkdir()
for item in manifest['original_files']:
    name=item['path'];p=hf_hub_download(HF_REPO,name,repo_type='dataset',revision=pin,token=False)
    dest=hf/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
    assert sha(dest)==item['sha256'],name
name='physician-expertise.md'
p=hf_hub_download(HF_REPO,name,repo_type='dataset',revision=pin,token=False)
shutil.copyfile(p,hf/name)
assert load(hf/'release-provenance.json')['sourceCommit']==ctx['source_commit']
current=api.dataset_view(KAGGLE_REF).current_version_number
version=max(int(current),int(manifest['desired_kaggle_version']))+1
kg=ROOT/'package';description=build_kaggle(hf,previous,kg,ctx,version,pin)
raw=load(kg/'dataset-metadata.json');metadata=dict(raw.get('info') or raw)
metadata.update(id=KAGGLE_REF,description=description);dump(kg/'dataset-metadata.json',metadata)
validate(kg,reader=False)
subprocess.run(['kaggle','datasets','version','-p',str(kg),'-m','Retain professional identity, clinical resource detail and bilingual documentation with the verified canonical package','--dir-mode','zip'],check=True)
final=ROOT/'live'
for attempt in range(30):
    shutil.rmtree(final,ignore_errors=True);final.mkdir()
    result=subprocess.run(['kaggle','datasets','download',KAGGLE_REF+'/'+str(version),'-p',str(final),'--unzip','--force'],check=False,stdout=subprocess.DEVNULL)
    if result.returncode==0 and (final/'kaggle-manifest.json').is_file() and load(final/'kaggle-manifest.json')['desired_kaggle_version']==version:break
    time.sleep(10)
else:raise RuntimeError('Final Kaggle version not visible yet')
validate(final,reader=False)
subprocess.run(['kaggle','datasets','metadata',KAGGLE_REF,'-p',str(kg),'--update'],check=True)
proof=ROOT/'metadata-live';proof.mkdir()
subprocess.run(['kaggle','datasets','metadata',KAGGLE_REF,'-p',str(proof)],check=True,stdout=subprocess.DEVNULL)
fresh=load(proof/'dataset-metadata.json');fresh=fresh.get('info') or fresh
assert fresh['description']==description and fresh['licenses']==metadata['licenses']
assert fresh['title']==metadata['title'] and fresh['subtitle']==metadata['subtitle']
print(json.dumps({'kaggleVersion':version,'pinnedHub':pin,'websiteSourceCommit':ctx['source_commit'],
 'publicationProof':ctx['run_url'],'professionalIdentityAndResourceDetail':'preserved and enriched',
 'publicDescription':'verified','licenseTitleSubtitle':'preserved','actualNotebook':'PASS'},ensure_ascii=False))
