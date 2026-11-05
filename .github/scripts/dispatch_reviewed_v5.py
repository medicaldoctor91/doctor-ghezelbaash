"""Dispatch one exact reviewed release operation; never build or publish here."""
import argparse, hashlib, io, json, os, re, urllib.error, urllib.request, zipfile
from pathlib import Path

REPO = 'medicaldoctor91/doctor-ghezelbaash'
BRANCH = 'codex/coordinated-v5-launch-20261105'
WORKFLOW = 389432488
SOURCE = '9ed3cc7a83f21482cce51cc4445755d2e3089680'
REF = 'release-reviewed-2026-11-05-v5'
PLAN_SHA = '0a15914ebecd6caf24fb3d9c1aa2301fc0bde6c54d0284ba97c1de8554c66647'
CANDIDATE = 42063635541
FROZEN_SHA = '164bd90cc8e2c9da824f28cec005024399fe540861cef83521e3e1f97972588d'
BASE = 'https://api.github.com/repos/' + REPO
DIR = Path('/tmp/coordinated-v5-dispatch')
PREVIOUS = {'stage-draft': 'preflight', 'publish-frozen': 'stage-draft', 'verify-publication': 'publish-frozen'}

def sha(b): return hashlib.sha256(b).hexdigest()
def save(name, value):
    DIR.mkdir(exist_ok=True)
    with (DIR/name).open('x') as f: json.dump(value, f, indent=2); f.write('\n')
def auth_request(path):
    assert path.startswith('/') and not path.startswith('//')
    return urllib.request.Request(BASE+path, headers={'Authorization':'Bearer '+os.environ['GITHUB_TOKEN'], 'Accept':'application/vnd.github+json'})
def get(path):
    with urllib.request.urlopen(auth_request(path), timeout=45) as r: return json.load(r)
def check_run(value, expected):
    assert value['id']==expected and value['status']=='completed' and value['conclusion']=='success'
    assert value['head_sha']==SOURCE and value['workflow_id']==WORKFLOW
    assert value['event']=='workflow_dispatch' and value['path'].split('@')[0]=='.github/workflows/coordinated-doi-release.yml'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def previous_context(run):
    artifacts=get('/actions/runs/'+str(run['id'])+'/artifacts?per_page=100')
    assert artifacts['total_count']<=100
    selected=[a for a in artifacts['artifacts'] if a['name']=='coordinated-release-evidence' and not a['expired']]
    assert len(selected)==1 and selected[0]['size_in_bytes']<=64*1024**2
    # Follow the artifact redirect without forwarding GitHub authorization.
    try:
        urllib.request.build_opener(NoRedirect).open(auth_request('/actions/artifacts/'+str(selected[0]['id'])+'/zip'),timeout=45)
        raise AssertionError('Expected artifact download redirect')
    except urllib.error.HTTPError as e:
        assert e.code in (301,302,303,307,308)
        location=e.headers['Location']; assert location.startswith('https://')
    with urllib.request.urlopen(location,timeout=90) as r: data=r.read(64*1024**2+1)
    assert len(data)<=64*1024**2
    if selected[0].get('digest'): assert selected[0]['digest']=='sha256:'+sha(data)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        members=[i for i in z.infolist() if Path(i.filename).name=='release-workflow-context.json']
        assert len(z.infolist())<=2000 and len(members)==1 and members[0].file_size<=1024**2
        context=json.loads(z.read(members[0]))
    assert context['schemaVersion']==1 and context['runId']==run['id'] and context['runAttempt']==run['run_attempt']
    assert context['sourceCommit']==SOURCE
    return context

def local_inputs(root, env):
    assert env['GITHUB_REPOSITORY']==REPO and env['GITHUB_REF']=='refs/heads/'+BRANCH
    assert env['GITHUB_EVENT_NAME']=='push' and env.get('GITHUB_RUN_ATTEMPT')=='1', 'Do not rerun a launcher attempt'
    assert re.fullmatch('[a-f0-9]{40}',env['GITHUB_SHA']) and int(env['GITHUB_RUN_ID'])>CANDIDATE
    raw=(root/'.github/release-inputs/coordinated-v5-plan.json').read_bytes()
    assert sha(raw)==PLAN_SHA
    plan=json.loads(raw); assert plan['refs']['buildSource']==SOURCE and plan['refs']['reviewedRef']=='refs/tags/'+REF
    request=json.loads((root/'.github/release-inputs/coordinated-v5-request.json').read_text())
    assert set(request)=={'schemaVersion','operation','previousRun','requestNonce'} and request['schemaVersion']==1
    assert request['operation'] in PREVIOUS and type(request['previousRun']) is int
    assert isinstance(request['requestNonce'],str) and re.fullmatch('[a-z0-9-]{1,80}',request['requestNonce'])
    if request['operation']=='stage-draft': assert request['previousRun']==CANDIDATE
    else: assert request['previousRun']>CANDIDATE
    return raw.decode(), plan, request

def prepare(root):
    raw, plan, request=local_inputs(root,os.environ)
    candidate=get('/actions/runs/'+str(CANDIDATE)); check_run(candidate,CANDIDATE)
    artifacts=get('/actions/runs/'+str(CANDIDATE)+'/artifacts?per_page=100')
    assert artifacts['total_count']<=100
    frozen=[a for a in artifacts['artifacts'] if a['name']=='frozen-coordinated-candidate' and not a['expired']]
    assert len(frozen)==1 and frozen[0]['id']==13435035232 and frozen[0]['digest']=='sha256:5300030dfdab17ac26a3f7dfa114e664b4def4debd8e316ff158df9ecbe50a64'
    prior=get('/actions/runs/'+str(request['previousRun'])); check_run(prior,request['previousRun'])
    context=previous_context(prior)
    assert context['operation']==PREVIOUS[request['operation']]
    canonical=sha(json.dumps(plan,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode())
    assert context['approvedReleasePlanSHA256']==canonical
    if request['operation']!='stage-draft': assert context['frozenManifestSHA256']==FROZEN_SHA
    pr=get('/pulls/463'); assert pr['merged'] and pr['head']['sha']==SOURCE
    body={'ref':REF,'inputs':{'operation':request['operation'],'candidate_run':str(CANDIDATE),'reviewed_commit':SOURCE,'approved_plan_json':raw,'approved_plan_sha256':PLAN_SHA}}
    save('body.json',body)
    save('intent.json',{'status':'INTENT_BEFORE_SINGLE_POST','repository':REPO,'workflowId':WORKFLOW,'source':SOURCE,'planSHA256':PLAN_SHA,'candidateRun':CANDIDATE,'previousRun':request['previousRun'],'operation':request['operation'],'requestNonce':request['requestNonce'],'launcherRun':int(os.environ['GITHUB_RUN_ID']),'launcherCommit':os.environ['GITHUB_SHA'],'requestBodySHA256':sha(json.dumps(body,separators=(',',':')).encode())})
    print('Reviewed dispatch intent prepared; no workflow dispatched yet.')

def dispatch(root):
    raw,plan,request=local_inputs(root,os.environ)
    intent=json.loads((DIR/'intent.json').read_text()); body=json.loads((DIR/'body.json').read_text())
    assert intent['launcherRun']==int(os.environ['GITHUB_RUN_ID']) and intent['launcherCommit']==os.environ['GITHUB_SHA']
    assert intent['operation']==request['operation'] and intent['requestNonce']==request['requestNonce']
    assert body=={'ref':REF,'inputs':{'operation':request['operation'],'candidate_run':str(CANDIDATE),'reviewed_commit':SOURCE,'approved_plan_json':raw,'approved_plan_sha256':PLAN_SHA}}
    save('post-attempt.json',{'status':'SINGLE_POST_STARTED','intentSHA256':sha((DIR/'intent.json').read_bytes())})
    req=auth_request('/actions/workflows/'+str(WORKFLOW)+'/dispatches');req.method='POST';req.add_header('Content-Type','application/json');req.data=json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req,timeout=45) as response:
            assert response.status==204
        save('outcome.json',{'status':'DISPATCH_ACCEPTED','httpStatus':204,'operation':request['operation'],'launcherRun':int(os.environ['GITHUB_RUN_ID'])})
        print('Dispatch accepted (204). Inspect the new controller run; never rerun this launcher.')
    except Exception as e:
        save('outcome.json',{'status':'AMBIGUOUS_OR_REJECTED_DO_NOT_REPEAT','errorType':type(e).__name__,'httpStatus':getattr(e,'code',None)})
        raise SystemExit('Dispatch failed or ambiguous; inspect controller history before a new request.') from None

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['prepare','dispatch']);parser.add_argument('--root',type=Path,default=Path(os.environ.get('GITHUB_WORKSPACE','.')));args=parser.parse_args()
    try: (prepare if args.operation=='prepare' else dispatch)(args.root)
    except (AssertionError,KeyError,ValueError,OSError,urllib.error.URLError) as e:
        raise SystemExit('Launcher refused: '+type(e).__name__+'; inspect non-secret bindings and prior run state.') from None
