"""Publish the packaged pinned notebook, then align mutable current archive metadata."""
import argparse, hashlib, io, json, os, time, zipfile
from pathlib import Path
import requests
from platform_bundle import dump
from sync_platform_machine_resources import kaggle_client
from platform_publish import correct_zenodo_metadata

ROOT=Path(__file__).resolve().parents[2]
P=json.loads((ROOT/'src/canonical/doi-policy.json').read_text())
KG='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-and-nlp-data'
NB='saeedghezelbash/dr-saeed-ghezelbash-knowledge-graph-starter'
HF='doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
def get(url):
    r=requests.get(url,timeout=150,headers={'Cache-Control':'no-cache'});r.raise_for_status();return r

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--hf-revision',required=True);ap.add_argument('--kaggle-version',type=int,required=True);ap.add_argument('--source-commit',required=True);ap.add_argument('--output',type=Path,default=Path('/tmp/doi-finish'));args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    live=get('https://zenodo.org/api/records/'+str(P['currentArchive']['recordId'])).json()
    assert live['doi']==P['currentArchive']['doi'] and live['metadata']['version']==P['currentArchive']['packagingVersion']
    body=get('https://www.kaggle.com/api/v1/datasets/download/'+KG+'?datasetVersionNumber='+str(args.kaggle_version)).content
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        assert z.testzip() is None
        for line in z.read('checksums.sha256').decode().splitlines():
            digest,name=line.split('  ',1);assert hashlib.sha256(z.read(name)).hexdigest()==digest,name
        manifest=json.loads(z.read('kaggle-manifest.json'));notebook=z.read('starter.ipynb')
    assert manifest['desired_kaggle_version']==args.kaggle_version and manifest['upstream_revision']==args.hf_revision and manifest['website_source_commit']==args.source_commit
    assert manifest['zenodo_version_doi']==P['currentArchive']['doi']
    stage=args.output/'notebook';stage.mkdir(exist_ok=True)
    client=kaggle_client();client.kernels_pull(NB,str(stage),metadata=True,quiet=True)
    meta=json.loads((stage/'kernel-metadata.json').read_text());meta.update(id=NB,code_file='starter.ipynb',dataset_sources=[KG],enable_internet=True)
    dump(stage/'kernel-metadata.json',meta)
    current=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json()
    blob=current['blob'];current_source=blob.get('source') or blob.get('sourceNullable')
    if json.loads(current_source)['cells']!=json.loads(notebook)['cells']:
        (stage/'starter.ipynb').write_bytes(notebook)
        # One submission only: ambiguous outcomes must be resolved by a live pull.
        client.kernels_push(str(stage))
    for attempt in range(90):
        status=client.kernels_status(NB);value=str(getattr(status,'status',status)).lower()
        dump(args.output/'status.json',{'attempt':attempt,'status':value})
        if 'complete' in value:break
        assert not any(word in value for word in ['error','cancel','fail']),value
        time.sleep(10)
    else:raise RuntimeError('Notebook execution has not completed; do not resubmit blindly')
    final=get('https://www.kaggle.com/api/v1/kernels/pull/'+NB).json();blob=final['blob']
    assert json.loads(blob.get('source') or blob.get('sourceNullable'))['cells']==json.loads(notebook)['cells']
    source=''.join(''.join(c['source']) for c in json.loads(notebook)['cells'])
    assert args.hf_revision in source and args.source_commit in source and "manifest['desired_kaggle_version'] == "+str(args.kaggle_version) in source
    meta=live['metadata'];description=meta['description']
    marker='<p>Verified current distribution pins:'
    description=description.split(marker)[0]+marker+' Hugging Face <a href="https://huggingface.co/datasets/'+HF+'/tree/'+args.hf_revision+'">'+args.hf_revision+'</a>; Kaggle dataset version '+str(args.kaggle_version)+'; notebook version '+str(final['metadata']['currentVersionNumber'])+' COMPLETE; website source '+args.source_commit+'.</p>'
    related=[x for x in meta.get('related_identifiers',[]) if not (x.get('identifier','').startswith('https://huggingface.co/datasets/'+HF+'/tree/') or '/versions/' in x.get('identifier',''))]
    related += [{'identifier':'https://huggingface.co/datasets/'+HF+'/tree/'+args.hf_revision,'scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}, {'identifier':'https://www.kaggle.com/datasets/'+KG+'/versions/'+str(args.kaggle_version),'scheme':'url','relation':'isSupplementedBy','resource_type':'dataset'}]
    spec={'record':str(P['currentArchive']['recordId']),'doi':P['currentArchive']['doi'],'expected_revision':live['revision'],'version':P['currentArchive']['packagingVersion'],'description':description,'related_identifiers':related}
    result=correct_zenodo_metadata(spec,os.environ['ZENODO_TOKEN'])
    report={'status':'PASS','hfRevision':args.hf_revision,'kaggleVersion':args.kaggle_version,'sourceCommit':args.source_commit,'notebookVersion':final['metadata']['currentVersionNumber'],'notebookStatus':value,'notebookSourceVerified':True,'runtimeManifestPinsVerified':True,'zenodoMetadata':result}
    dump(args.output/'report.json',report);print(json.dumps(report),flush=True)
if __name__=='__main__':main()
