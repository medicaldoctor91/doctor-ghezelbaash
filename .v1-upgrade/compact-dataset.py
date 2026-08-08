#!/usr/bin/env python3
from pathlib import Path
import sys, hashlib
root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
p=root/'scripts/generate-projections.mjs'
s=p.read_text()
assert hashlib.sha256(s.encode()).hexdigest()=='d2058cd76123fe88bd2b27da644352b612b174c4b67ddc1d820018a9a681f8ab'
needle="  if(types(projected).includes('VideoObject')){const m=String(projected.duration??'').match(/^PT(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+(?:\\.\\d+)?)S)?$/);const seconds=m?(Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0)):NaN;if(seconds<30)delete projected.hasPart;}\n"
compact="  if(types(projected).includes('Dataset')){const keep=new Set(['@id','@type','name','alternateName','description','creator','publisher','license','version','datePublished','dateModified','identifier','isAccessibleForFree','sameAs','distribution','keywords']);for(const k of Object.keys(projected))if(!keep.has(k))delete projected[k];if(Array.isArray(projected.distribution))projected.distribution=projected.distribution.filter(x=>x?.['@id']&&supportSelected.has(x['@id']));}\n"
assert s.count(needle)==1
s=s.replace(needle,compact+needle,1)
assert hashlib.sha256(s.encode()).hexdigest()=='6631c63bb402ad2f7533800ca84d86056117d1d63e19c4d09d139d8f7edd4deb'
p.write_text(s)
print('COMPACT_GOOGLE_DATASET_PROFILE=PASS')
