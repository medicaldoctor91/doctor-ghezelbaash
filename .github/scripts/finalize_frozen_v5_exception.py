"""Owner-authorized external-service exception; frozen M5 data remain unchanged."""
import argparse, contextlib, hashlib, io, json, os, sys, zipfile
from pathlib import Path
import requests

REPO='medicaldoctor91/doctor-ghezelbaash'
SOURCE='9ed3cc7a83f21482cce51cc4445755d2e3089680'
REF='refs/tags/release-reviewed-2026-11-05-v5'
PLAN_SHA='0a15914ebecd6caf24fb3d9c1aa2301fc0bde6c54d0284ba97c1de8554c66647'
FROZEN_SHA='164bd90cc8e2c9da824f28cec005024399fe540861cef83521e3e1f97972588d'
GRAPH_SHA='d87d67c104235011a60c3703c7a0d8e37872aef0e8e98d3d0157f37b009a8884'
HF_REV='43b55ee2e50678cf3bcdca7b5d3fe0e4ee5c21c8'
DOI='10.5281/zenodo.23965042'
RECORD=23965042
CANDIDATE=42063635541
PROOF_RUN=42105467623
PROOF_ARTIFACT=13450809685
PROOF_DIGEST='b360c8c2722c4686785bc4fc7cfbc939ca50db1552be155f135df926dca2b92f'
WORK=Path('/tmp/coordinated-release')
AUDIT=Path('/tmp/outage-finalize-v5')
API='https://api.github.com/repos/'+REPO
OPS_SHA=os.environ.get('CONTROL_TOOL_COMMIT','')
CONTROL=Path(os.environ.get('CONTROL_ROOT','.')).resolve()
FROZEN_ROOT=Path(os.environ.get('FROZEN_SOURCE_ROOT','.')).resolve()

def sha(body):return hashlib.sha256(body).hexdigest()
def read(path):return json.loads(Path(path).read_text())
def save(name,value,exclusive=False):
    AUDIT.mkdir(exist_ok=True)
    path=AUDIT/name
    with path.open('x' if exclusive else 'w') as f:json.dump(value,f,ensure_ascii=False,indent=2);f.write('\n')

@contextlib.contextmanager
def source_frame():
    """Select actual detached M5 checkout for original APIs; record the real caller separately."""
    old=os.environ.get('GITHUB_SHA')
    os.environ['GITHUB_SHA']=SOURCE
    try:yield
    finally:
        if old is None:os.environ.pop('GITHUB_SHA',None)
        else:os.environ['GITHUB_SHA']=old

def github(path):
    assert path.startswith('/') and not path.startswith('//')
    r=requests.get(API+path,headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'],'Accept':'application/vnd.github+json'},timeout=60)
    r.raise_for_status();return r.json()

def evidence(artifact):
    r=requests.get(API+'/actions/artifacts/'+str(artifact['id'])+'/zip',headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN']},allow_redirects=False,timeout=60)
    assert r.status_code in (301,302,303,307,308)
    location=r.headers['Location'];assert location.startswith('https://')
    r=requests.get(location,timeout=90);r.raise_for_status();body=r.content
    assert len(body)<=64*1024**2
    if artifact.get('digest'):assert artifact['digest']=='sha256:'+sha(body)
    result={}
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        assert len(z.infolist())<=2000
        for item in z.infolist():
            p=Path(item.filename);assert not p.is_absolute() and '..' not in p.parts
            assert (item.external_attr>>16)&0o170000 != 0o120000
            if item.filename.endswith('.json'):
                assert p.name not in result and item.file_size<=16*1024**2
                result[p.name]=json.loads(z.read(item))
    return result

def authorization():
    assert os.environ['GITHUB_REPOSITORY']==REPO
    assert os.environ['GITHUB_RUN_ATTEMPT']=='1','Never rerun a publication attempt'
    assert os.environ['GITHUB_SHA']==OPS_SHA and len(OPS_SHA)==40
    request=read(CONTROL/'.github/release-inputs/outage-finalize-v5-request.json')
    exemption=read(CONTROL/'.github/release-inputs/outage-finalize-v5-exemption.json')
    assert request['operation']=='finalize-frozen-v5' and request['sourceCommit']==SOURCE and request['record']==RECORD
    assert exemption['ownerAuthorizedExternalHfOutageException'] is True
    assert exemption['waivedOnly']=='external HF Dataset Viewer Search/Filter availability during confirmed provider outage'
    assert exemption['sourceCommit']==SOURCE and exemption['record']==RECORD
    assert exemption['actualHfSearchFilterStatus']=='PROVIDER_OUTAGE_NOT_PASS'
    raw=(CONTROL/'.github/release-inputs/coordinated-v5-plan.json').read_bytes()
    assert sha(raw)==PLAN_SHA
    stopped=github('/actions/runs/42109856210')
    assert stopped['status']=='completed','Old readiness publisher may still dispatch'
    self_run=github('/actions/runs/'+os.environ['GITHUB_RUN_ID'])
    assert self_run['head_sha']==OPS_SHA and self_run['event']=='push'
    assert self_run['path'].split('@')[0]=='.github/workflows/finalize-frozen-v5-outage-exception.yml'
    return request,exemption,raw,self_run

def modules():
    sys.path.insert(0,str(FROZEN_ROOT/'.github/scripts'))
    import release_plan,release_recovery,coordinated_doi_release,doi_release
    return release_plan,release_recovery,coordinated_doi_release,doi_release

def historical_proof(plan):
    run=github('/actions/runs/'+str(PROOF_RUN))
    assert run['status']=='completed' and run['head_sha']==SOURCE and run['workflow_id']==389432488
    assert run['event']=='workflow_dispatch' and run['run_attempt']==1
    a=github('/actions/artifacts/'+str(PROOF_ARTIFACT))
    assert a['name']=='coordinated-release-evidence' and not a['expired'] and a['digest']=='sha256:'+PROOF_DIGEST
    assert a['workflow_run']['id']==PROOF_RUN
    files=evidence(a);c=files['release-workflow-context.json']
    assert c['runId']==PROOF_RUN and c['sourceCommit']==SOURCE and c['operation']=='publish-frozen'
    assert c['approvedReleasePlanSHA256']==plan.canonical_sha(plan.load_plan()) and c['frozenManifestSHA256']==FROZEN_SHA
    for name in ['site-live.json','kaggle-live.json','notebook-live.json','media-live.json']:
        assert files[name]['status']=='PASS',name
    assert files['site-live.json']['result']['sourceCommit']==SOURCE
    assert files['kaggle-live.json']['result']['version']==35
    assert files['notebook-live.json']['result']['version']==18
    assert files['hf-bytes-verified.json']=={'revision':HF_REV,'files':204}
    assert 'zenodo-publish-attempt.json' not in files,'Prior immutable publication attempted'
    return files

def prior_exception_guard(self_run,submitted):
    """Any earlier unresolved exception POST blocks another write; published recovery is GET-only."""
    if submitted:return
    for page in range(1,101):
        runs=github('/actions/workflows/'+str(self_run['workflow_id'])+'/runs?per_page=100&page='+str(page))['workflow_runs']
        for run in runs:
            if run['id']>=self_run['id']:continue
            assert run['status']=='completed','Prior exception run still active'
            values=github('/actions/runs/'+str(run['id'])+'/artifacts?per_page=100')
            assert values['total_count']<=100
            selected=[x for x in values['artifacts'] if x['name']=='outage-finalization-evidence' and not x['expired']]
            if not selected:
                jobs=github('/actions/runs/'+str(run['id'])+'/jobs?per_page=100')
                assert jobs['total_count']<=100
                steps=[s for j in jobs['jobs'] for s in j.get('steps',[]) if s['name']=='Publish exactly once or recover published record']
                assert not steps or all(s.get('conclusion')=='skipped' for s in steps),'Prior publication has no durable evidence'
                continue
            assert len(selected)==1
            old=evidence(selected[0]);assert 'post-attempt.json' not in old,'Ambiguous prior POST: owner/public inspection required, never repeat'
        if len(runs)<100:return
    raise AssertionError('Exception history incomplete')

def prepare():
    request,exemption,raw,self_run=authorization()
    os.environ['RELEASE_PLAN_PATH']=str(CONTROL/'.github/release-inputs/coordinated-v5-plan.json')
    os.environ['PREPARE_RESERVED_DOI']=str(RECORD);os.environ['CANDIDATE_RUN']=str(CANDIDATE)
    os.environ.pop('ARCHIVE_SOURCE_COMMIT',None)
    with source_frame():
        plan,recovery,gates,doi=modules()
        checkout=plan.validate_checkout(plan.load_plan())
        restored=recovery.restore_candidate(WORK,'/tmp/frozen-artifact/candidate.tar.gz')
        assert sha((WORK/'frozen-sha256.json').read_bytes())==FROZEN_SHA
        gates.require_reviewable_candidate(WORK);gates.check_frozen(WORK)
        old=historical_proof(plan)
        recovery.recover_attempts(WORK)
        # Only authoritative public distribution reads; no Dataset Viewer requests.
        site=gates.get(gates.SITE+'release-provenance.json').json();assert site['sourceCommit']==SOURCE
        hf=gates.get('https://huggingface.co/api/datasets/'+gates.HF).json();assert hf['sha']==HF_REV
        for url in [gates.SITE+'graph.jsonld','https://huggingface.co/datasets/'+gates.HF+'/resolve/'+HF_REV+'/graph.jsonld']:
            assert sha(gates.get(url).content)==GRAPH_SHA
        kg=gates.verify_kaggle(WORK)
        public=gates.get('https://www.kaggle.com/api/v1/kernels/pull/'+gates.NB).json()
        nb=old['notebook-live.json']['result'];gates.notebook_identity(WORK,public,nb['executionEvidence'])
        staged=doi.verify_staged(WORK)
        prior_exception_guard(self_run,staged['submitted'])
        if not staged['submitted']:assert not (WORK/'zenodo-publish-attempt.json').exists(),'Unresolved original POST'
        context={'schemaVersion':1,'operation':'owner-authorized-outage-finalization','runId':self_run['id'],
            'operationalToolCommit':OPS_SHA,'frozenApplicationSourceCommit':SOURCE,'approvedPlanRawSHA256':PLAN_SHA,
            'approvedPlanCanonicalSHA256':plan.canonical_sha(plan.load_plan()),'frozenManifestSHA256':FROZEN_SHA,
            'exemptionSHA256':sha((CONTROL/'.github/release-inputs/outage-finalize-v5-exemption.json').read_bytes()),
            'record':RECORD,'doi':DOI,'actualHfSearchFilterStatus':'PROVIDER_OUTAGE_NOT_PASS','noPayloadChanges':True}
        save('exception-context.json',context)
        save('exemption-authorization.json',exemption)
        save('readiness-report.json',{'status':'PASS_WITH_EXPLICIT_OWNER_AUTHORIZED_EXTERNAL_SERVICE_EXCEPTION',
            'sourceCheckout':checkout,'candidateRestore':restored,'historicalEvidenceRun':PROOF_RUN,
            'siteSourceCommit':SOURCE,'hfRevision':HF_REV,'hfPreviouslyVerifiedFiles':204,'graphSHA256':GRAPH_SHA,
            'kaggleCurrent':kg,'notebookVersion':18,'notebookPriorActualExecution':nb['executionEvidence'],
            'zenodoStagedFiles':len(read(WORK/'payload.json')['files']),'serverSHA256Verified':staged.get('sha256Verified',staged['submitted']),
            'actualHfSearchFilterStatus':'PROVIDER_OUTAGE_NOT_PASS','alreadyPublished':staged['submitted']})
        snapshot={'metadata':staged['draft']['metadata'],'files':None}
        if not staged['submitted']:
            s=requests.Session();s.headers['Authorization']='Bearer '+os.environ['ZENODO_TOKEN']
            r=s.get('https://zenodo.org/api/deposit/depositions/'+str(RECORD)+'/files',timeout=60);r.raise_for_status()
            snapshot['files']={x.get('filename')or x.get('key'):x['checksum'] for x in r.json()}
        save('draft-snapshot.json',snapshot)
        save('publish-intent.json',{**context,'status':'INTENT_BEFORE_SINGLE_POST','requestNonce':request['requestNonce'],
            'alreadyPublished':staged['submitted'],'readinessReportSHA256':sha((AUDIT/'readiness-report.json').read_bytes())},exclusive=True)
        gates.check_frozen(WORK)
    print('Frozen data and current distributions verified; explicit outage exception recorded, not a Search/Filter PASS.')

def publish():
    authorization();intent=read(AUDIT/'publish-intent.json')
    assert intent['operationalToolCommit']==OPS_SHA and intent['record']==RECORD
    assert intent['readinessReportSHA256']==sha((AUDIT/'readiness-report.json').read_bytes())
    os.environ['RELEASE_PLAN_PATH']=str(CONTROL/'.github/release-inputs/coordinated-v5-plan.json');os.environ['PREPARE_RESERVED_DOI']=str(RECORD)
    with source_frame():
        plan,recovery,gates,doi=modules();plan.validate_candidate_binding(WORK);gates.check_frozen(WORK)
        session=requests.Session();session.headers['Authorization']='Bearer '+os.environ['ZENODO_TOKEN']
        dep='https://zenodo.org/api/deposit/depositions/'+str(RECORD)
        r=session.get(dep,timeout=60);r.raise_for_status();draft=r.json()
        assert draft['id']==RECORD and (draft.get('doi')or draft['metadata'].get('prereserve_doi',{}).get('doi'))==DOI
        if draft.get('submitted'):
            save('post-outcome.json',{'status':'ALREADY_PUBLISHED_GET_ONLY','record':RECORD});return
        assert not intent['alreadyPublished'],'Publication state reverted unexpectedly'
        snapshot=read(AUDIT/'draft-snapshot.json');assert draft['metadata']==snapshot['metadata'],'Draft metadata changed after review'
        r=session.get(dep+'/files',timeout=60);r.raise_for_status()
        assert {x.get('filename')or x.get('key'):x['checksum'] for x in r.json()}==snapshot['files'],'Draft files changed after review'
        prior_exception_guard(github('/actions/runs/'+os.environ['GITHUB_RUN_ID']),False)
        recovery.begin_attempt(WORK/'zenodo-publish-attempt.json',{'record':RECORD,'action':'publish','sourceCommit':SOURCE,'operationalToolCommit':OPS_SHA})
        save('post-attempt.json',{'status':'SINGLE_POST_STARTED','record':RECORD,'sourceCommit':SOURCE,'operationalToolCommit':OPS_SHA},exclusive=True)
        try:
            response=session.post(dep+'/actions/publish',json={},timeout=120);response.raise_for_status()
            save('post-outcome.json',{'status':'POST_ACCEPTED','record':RECORD,'httpStatus':response.status_code})
        except Exception as e:
            save('post-outcome.json',{'status':'AMBIGUOUS_OR_REJECTED_DO_NOT_REPEAT','errorType':type(e).__name__,'httpStatus':getattr(getattr(e,'response',None),'status_code',None)})
            raise SystemExit('Publication response failed or ambiguous; next recovery must inspect owner/public state, not repeat POST.') from None

def verify():
    authorization();os.environ['RELEASE_PLAN_PATH']=str(CONTROL/'.github/release-inputs/coordinated-v5-plan.json');os.environ['PREPARE_RESERVED_DOI']=str(RECORD)
    with source_frame():
        plan,recovery,gates,doi=modules();plan.validate_candidate_binding(WORK);gates.check_frozen(WORK)
        doi.verify_published(23474664,WORK)
        public_graph=(WORK/'live-downloads/graph.jsonld').read_bytes()
        assert sha(public_graph)==GRAPH_SHA and DOI.encode() in public_graph
        graph=json.loads(public_graph);dataset=next(n for n in graph['@graph'] if n.get('@id')=='https://www.ghezelbaash.ir/graph.jsonld/dataset')
        assert dataset['version']=='1.3.5'
        report={'status':'PASS_WITH_EXPLICIT_OWNER_AUTHORIZED_EXTERNAL_SERVICE_EXCEPTION','record':RECORD,'doi':DOI,
            'operationalToolCommit':OPS_SHA,'frozenApplicationSourceCommit':SOURCE,'publicGraphSHA256':sha(public_graph),
            'publicGraphOwnDOIOccurrences':public_graph.count(DOI.encode()),'publicFilesSha256Verified':43,
            'previousArchiveUnchanged':23474664,'datasetVersion':'1.3.5','hfRevision':HF_REV,'kaggleVersion':35,'notebookVersion':18,
            'actualHfSearchFilterStatus':'PROVIDER_OUTAGE_NOT_PASS','noPayloadChanges':True}
        save('final-publication-report.json',report);gates.check_frozen(WORK);print(json.dumps(report),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('operation',choices=['prepare','publish','verify']);args=p.parse_args()
    try:{'prepare':prepare,'publish':publish,'verify':verify}[args.operation]()
    except Exception as e:
        message=str(e)[:500] if isinstance(e,(AssertionError,ValueError,KeyError)) else 'Provider or runtime error; credential-bearing URLs omitted.'
        save('failure-'+args.operation+'.json',{'status':'FAILED','operation':args.operation,'errorType':type(e).__name__,'httpStatus':getattr(getattr(e,'response',None),'status_code',None),'message':message})
        raise SystemExit('Finalization stopped: '+type(e).__name__+'; inspect preserved non-secret evidence and provider state.') from None
