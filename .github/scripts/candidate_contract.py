"""Reject known misleading current-release assertions in final candidate bytes."""
import json
from pathlib import Path

def validate_candidate(work):
    from platform_bundle import DOI_POLICY
    cohort=DOI_POLICY['coordinatedRelease']
    work=Path(work);checked=[]
    import rdflib
    graph=json.loads((work/'website/graph.jsonld').read_text())
    assert len(graph['@graph'])==cohort['expectedGraphNodes']
    assert len(rdflib.Graph().parse(work/'website/graph.jsonld',format='json-ld'))==cohort['expectedGraphTriples']
    from browser_projection import validate_home_projection
    from html.parser import HTMLParser
    class Inline(HTMLParser):
        def __init__(self):super().__init__();self.capture=False;self.text=[];self.blocks=[]
        def handle_starttag(self,tag,attrs):
            if tag=='script' and dict(attrs).get('type')=='application/ld+json':self.capture=True;self.text=[]
        def handle_data(self,text):
            if self.capture:self.text.append(text)
        def handle_endtag(self,tag):
            if tag=='script' and self.capture:self.blocks.append(json.loads(''.join(self.text)));self.capture=False
    for platform in ['website','hf-stage']:
        html=(work/platform/'index.html').read_bytes();inline=Inline();inline.feed(html.decode())
        validate_home_projection(work/platform/'graph.jsonld',inline.blocks,html)
    banned=['در این انتشار به‌روزرسانی نشده‌اند','DOIهای فعلی زنودو ثابت مانده‌اند','without minting a new release or DOI','Verified website publication: .','latest verified archived snapshot','Latest verified immutable snapshot','Professional and scholarly records also use']
    for platform in ['hf-stage','kaggle','archive','website']:
        root=work/platform
        for file in root.rglob('*'):
            if not file.is_file() or 'upstream' in file.relative_to(root).parts:continue
            if file.suffix not in {'.md','.json','.jsonld','.html','.ttl','.txt','.cff','.ipynb'}:continue
            text=file.read_text()
            for phrase in banned:assert phrase not in text, ('Misleading current text',platform,file.relative_to(root).as_posix(),phrase)
            checked.append(platform+'/'+file.relative_to(root).as_posix())
        for name in ['current-release-matrix.json','release-attestation.json']:
            value=json.loads((root/name).read_text()) if (root/name).exists() else None
            if value:
                assert 'publicationRun' not in value
                assert value['archivedSnapshotsUpdated'] is False
                assert set(value['publicationScope'])=={'hf','kaggle','zenodo_dataset'}
                assert value['releaseCohort']==DOI_POLICY['currentArchive']['doi']
    kg=work/'kaggle';control=json.loads((kg/'dataset-metadata.json').read_text());assert control['description']==(kg/'README.md').read_text()
    packaging=json.loads((work/'hf-stage/viewer/packaging.json').read_text())
    for key,label in [('entity_facts','facts'),('clinical_passages','clinical passages'),('query_matrix','queries'),('clinical_answers','source-linked answers')]:
        assert format(packaging['tables'][key]['rows'],',')+' '+label in control['subtitle']
    manifest=json.loads((kg/'kaggle-manifest.json').read_text())
    assert not {'package_publication_run_id','package_publication_run_url'}&set(manifest)
    assert manifest['desired_kaggle_version']==cohort['kaggleTargetVersion']
    notebook_meta=json.loads((work/'notebook/kernel-metadata.json').read_text())
    from coordinated_doi_release import KG
    assert notebook_meta['dataset_sources']==[KG+'/'+str(cohort['kaggleTargetVersion'])]
    return {'status':'PASS','files':len(checked),'checked':checked,'checks':'Known contradictory text; build/receipt roles; cohort scope; Kaggle description and table-derived subtitle'}
