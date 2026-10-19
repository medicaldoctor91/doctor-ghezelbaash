"""Frozen cross-platform release for the already reserved Zenodo record. No mint API."""
import argparse, concurrent.futures, hashlib, json, os, shutil, subprocess, sys, time, zipfile
from pathlib import Path
import requests
ROOT=Path(__file__).resolve().parents[2]
P=json.loads((ROOT/'src/canonical/doi-policy.json').read_text())
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
SITE='https://www.ghezelbaash.ir/'
def dump(path,value):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def get(url):
 r=requests.get(url,timeout=180,headers={'Cache-Control':'no-cache'});r.raise_for_status();return r

def inspect(work):
 assert P['currentArchive']['recordId']==23474664 and P['currentArchive']['doi']=='10.5281/zenodo.23474664'
 r=requests.get('https://zenodo.org/api/deposit/depositions/23474664',headers={'Authorization':'Bearer '+os.environ['ZENODO_TOKEN']},timeout=60);r.raise_for_status();d=r.json()
 doi=d.get('doi') or d.get('metadata',{}).get('prereserve_doi',{}).get('doi')
 assert doi==P['currentArchive']['doi'] and str(d['conceptrecid'])=='18765168'
 result={'record':d['id'],'reservedDoi':doi,'submitted':d.get('submitted'),'state':d.get('state'),'files':len(d.get('files',[])),
 'siteSource':get(SITE+'release-provenance.json').json()['sourceCommit'],
 'hfRevision':get('https://huggingface.co/api/datasets/'+HF).json()['sha'],
 'kaggleVersion':get('https://api.kaggle.com/v1/datasets/view/'+KG).json()['currentVersionNumber']}
 dump(work/'inspection.json',result);print(json.dumps(result),flush=True);return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('operation',choices=['inspect']);ap.add_argument('--root',type=Path,default=Path('/tmp/coordinated-release'));a=ap.parse_args();a.root.mkdir(parents=True,exist_ok=True);inspect(a.root)
if __name__=='__main__':main()
