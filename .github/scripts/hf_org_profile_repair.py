"""Use the actual Hub profile form, retaining every existing profile field."""
import http.cookiejar, json, os, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

ORG='doctor-ghezelbaash'
OLD='https://www.ghezelbaash.ir/graph.jsonld#dataset'
NEW='https://www.ghezelbaash.ir/graph.jsonld/dataset'

class ProfileForm(HTMLParser):
    def __init__(self):super().__init__();self.props=None
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if attrs.get('data-target')=='OrgSettingsProfileForm':self.props=json.loads(attrs['data-props'])

def main():
    token=os.environ['HF_TOKEN'];jar=http.cookiejar.CookieJar()
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    headers={'Authorization':'Bearer '+token,'User-Agent':'DoctorGhezelbaashProfileCorrection/1.0'}
    public='https://huggingface.co/api/organizations/'+ORG+'/overview'
    def overview():
        return json.load(opener.open(urllib.request.Request(public,headers=headers),timeout=45))
    before=overview();details=before.get('details','')
    if OLD not in details:
        print('Organization canonical dataset pointer is already correct');return
    url='https://huggingface.co/organizations/'+ORG+'/settings/profile'
    with opener.open(urllib.request.Request(url,headers=headers),timeout=45) as response:
        page=response.read().decode()
        if '/login' in response.url:raise RuntimeError('Hub requires a browser login session for organization profile settings; the existing dataset token cannot access this form')
    parser=ProfileForm();parser.feed(page);props=parser.props
    if not props or not props.get('canWrite') or not props.get('csrfToken'):
        raise RuntimeError('Hub did not grant editable organization profile access to the existing publication token')
    assert props['name']==ORG and props.get('details')==details,'Profile changed concurrently'
    fields={key:props.get(key) or '' for key in ['fullname','homepage','orgType','details','github','twitter','linkedin']}
    assert fields['fullname']
    fields['csrf']=props['csrfToken'];fields['details']=details.replace(OLD,NEW)
    body=urllib.parse.urlencode(fields).encode()
    post_headers={**headers,'Content-Type':'application/x-www-form-urlencoded','Origin':'https://huggingface.co','Referer':url}
    with opener.open(urllib.request.Request(url,data=body,method='POST',headers=post_headers),timeout=45) as response:
        response.read()
    after=overview();assert after['details']==fields['details'],'Organization correction was not visible'
    for key in ['name','fullname']:assert after[key]==before[key],key
    result={'organization':ORG,'details_corrected':True,'oldDatasetPointer':OLD,'canonicalDatasetIri':NEW,'fullname_preserved':True}
    Path('/tmp/hf-org-profile-repair.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':main()
