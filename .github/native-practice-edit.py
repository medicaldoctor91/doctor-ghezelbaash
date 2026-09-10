#!/usr/bin/env python3
"""One-shot source edit transport; never included in the candidate branch."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
paths = [
    'src/data/semantic/knowledge-graph.jsonld',
    'scripts/validate-physician-projection.mjs',
    'src/lib/semantic-projection.mjs',
    'scripts/test-contracts.mjs',
    'src/content-source/page.md',
]
expected = {
    paths[0]: ('9d802ef3629631c7546d7b144d3fa31ac97693c3ce523aa176639c08aa4982a3', '64a026beced13fb384b2b50552e0c49c003250ce51a0fc82182aa73078b77cd6'),
    paths[1]: ('fa5e045a1b52e31075abe4653715e789f8f42488860cc1cae100712e10f8a71d', 'ac8ef771a950e3fab2e29b57d3a4b24cf2685a4e0577b3b4948ceadd30af1cd7'),
    paths[2]: ('1f7718eb525279c78f016e97a138c9718253adc41e8b7beb499c4385923bc376', 'dcfee8b1198b4f12a9253b22336970c6062e84981a9c441efcffdf801843da72'),
    paths[3]: ('bd4d90352de733afea0664df8bbc7d1f7b1f564edefd0cc4b8698de86eebd8f8', 'caa8fb9185182fb68b301fe24d171bc7349e9060f28855b208d52d9adb51e8c0'),
    paths[4]: ('daa977087c07891f62aa3292c5d9e2d9f3e51ff3b8c1f4725e3b42d3f5088820', '5d6374cb865d2c101c6478ffbc755a43b82ed4224b02941bcbd40859f8ff83f1'),
}
before = {p: (root / p).read_text(encoding='utf-8') for p in paths}
for p in paths:
    assert hashlib.sha256(before[p].encode()).hexdigest() == expected[p][0], f'Baseline drift: {p}'
changed = dict(before)
def replace_once(path, old, new):
    assert changed[path].count(old) == 1, f'Expected exactly one source match in {path}'
    changed[path] = changed[path].replace(old, new, 1)

P = 'https://www.ghezelbaash.ir/#saeed-ghezelbash'
C = 'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'
p = paths[0]
graph = json.loads(before[p])
assert json.dumps(graph, ensure_ascii=False, indent=2) + '\n' == before[p], 'Graph formatting drift'
nodes = {n['@id']: n for n in graph['@graph']}
assert len(nodes) == len(graph['@graph']) == 809
person, clinic = nodes[P], nodes[C]
assert len(person['jobTitle']) == 4
assert person['jobTitle'][2:] == [
    {'@value':'مدیر پزشکی کلینیک زیبایی دکتر سعید قزلباش','@language':'fa'},
    {'@value':'Medical director of Dr. Saeed Ghezelbash Aesthetic Clinic','@language':'en'},
]
assert person['hasOccupation'][-1] == {'@id':'https://www.wikidata.org/entity/Q256688'}
person['jobTitle'] = person['jobTitle'][:2]
person['hasOccupation'] = person['hasOccupation'][:-1]
assert [x['@id'] for x in person['hasOccupation']] == [
    'https://www.ghezelbaash.ir/#occupation-physician',
    'https://www.ghezelbaash.ir/#occupation-medical-researcher',
]
addenda = {
 P: {
  'fa':' این کلینیک مطب شخصی ایشان است. دکتر قزلباش تنها پزشک ارائه‌دهندهٔ خدمات آن است؛ مسئولیت پزشکی و حرفه‌ای مطب بر عهدهٔ ایشان است و تمام خدمات پزشکی و زیبایی ارائه‌شده در این مطب شخصاً توسط خود ایشان انجام می‌شود و به پزشک دیگر یا اپراتور واگذار نمی‌شود.',
  'en':' The clinic is his private medical practice, where he is the sole treating physician and bears direct medical and professional responsibility. All medical and aesthetic services provided at this practice are performed personally by him and are not delegated to another physician or an operator.',
 },
 C: {
  'fa':' این مجموعه مطب شخصی دکتر سعید قزلباش است. ایشان صاحب مطب و تنها پزشک ارائه‌دهندهٔ خدمات آن است. مسئولیت پزشکی و حرفه‌ای مطب بر عهدهٔ ایشان است و تمام خدمات پزشکی و زیبایی ارائه‌شده در این مطب شخصاً توسط خود ایشان انجام می‌شود و به پزشک دیگر یا اپراتور واگذار نمی‌شود.',
  'en':' This is Dr. Saeed Ghezelbash’s private medical practice. He owns the practice and is its sole treating physician, with direct medical and professional responsibility. All medical and aesthetic services provided at this practice are performed personally by him and are not delegated to another physician or an operator.',
 },
}
for ident, additions in addenda.items():
    assert {x['@language'] for x in nodes[ident]['description']} == {'fa','en'}
    for value in nodes[ident]['description']:
        value['@value'] = value['@value'].rstrip() + additions[value['@language']]
changed[p] = json.dumps(graph, ensure_ascii=False, indent=2) + '\n'

p = paths[1]
replace_once(p, '''assert.ok(
  refs(physician.hasOccupation).includes(
    "https://www.wikidata.org/entity/Q256688",
  ),
  "Wikidata medical-director position missing from Person",
);''', '''assert.deepEqual(
  refs(physician.hasOccupation),
  [
    "https://www.ghezelbaash.ir/#occupation-physician",
    "https://www.ghezelbaash.ir/#occupation-medical-researcher",
  ],
  "Physician occupations must match the supported professional roles",
);
assert.deepEqual(
  physician.jobTitle,
  [
    { "@value": "پزشک زیبایی", "@language": "fa" },
    { "@value": "Aesthetic physician", "@language": "en" },
  ],
  "Physician job titles must match the supported professional roles",
);''')
replace_once(p, '''  const projectedClinic = requireNode(projectedById, CLINIC, "Final clinic");''', '''  const projectedClinic = requireNode(projectedById, CLINIC, "Final clinic");
  for (const property of ["jobTitle", "hasOccupation", "description"])
    assert.deepEqual(
      projectedPhysician[property],
      physician[property],
      `Final physician ${property} differs from its canonical source`,
    );
  assert.deepEqual(
    projectedClinic.description,
    clinic.description,
    "Final clinic description differs from its canonical source",
  );''')
replace_once(p, '''    assert.ok(
      refs(service.provider).includes(PHYSICIAN),
      `Final service lost physician provider: ${service["@id"]}`,
    );''', '''    assert.deepEqual(
      asArray(service.provider),
      [{ "@id": PHYSICIAN }],
      `Final service must have exactly one canonical physician provider: ${service["@id"]}`,
    );''')
replace_once(p, '''  [
    "service category",
    (nodes) => {
      delete nodes.get(CORE_HEAD_SERVICES[0]).category;
    },
  ],
];''', '''  [
    "service category",
    (nodes) => {
      delete nodes.get(CORE_HEAD_SERVICES[0]).category;
    },
  ],
  [
    "additional service provider",
    (nodes) => {
      nodes.get(CORE_HEAD_SERVICES[0]).provider = [
        { "@id": PHYSICIAN },
        { "@id": CLINIC },
      ];
    },
  ],
  [
    "duplicate service provider",
    (nodes) => {
      nodes.get(CORE_HEAD_SERVICES[0]).provider = [
        { "@id": PHYSICIAN },
        { "@id": PHYSICIAN },
      ];
    },
  ],
  [
    "additional physician occupation",
    (nodes) => {
      nodes.get(PHYSICIAN).hasOccupation.push({
        "@id": `${PHYSICIAN}-unsupported-occupation`,
      });
    },
  ],
  [
    "additional physician job title",
    (nodes) => {
      nodes.get(PHYSICIAN).jobTitle.push({
        "@value": "Unsupported executive role",
        "@language": "en",
      });
    },
  ],
  [
    "physician practice description",
    (nodes) => {
      delete nodes.get(PHYSICIAN).description;
    },
  ],
  [
    "clinic practice description",
    (nodes) => {
      delete nodes.get(CLINIC).description;
    },
  ],
];''')

p = paths[2]
replace_once(p, '''      if (!providers.includes(personId))
        throw new Error(
          `Offered service lacks the canonical physician provider: ${serviceId}`,
        );''', '''      if (providers.length !== 1 || providers[0] !== personId)
        throw new Error(
          `Offered service must have exactly one canonical physician provider: ${serviceId}`,
        );''')

p = paths[3]
replace_once(p, '''  const aliasDrift = structuredClone(graph),''', '''  for (const [label, providers] of [
    ["additional", [release.primaryEntity.id, release.clinic.id]],
    ["duplicate", [release.primaryEntity.id, release.primaryEntity.id]],
    ["missing", []],
  ]) {
    const changedProviders = structuredClone(graph);
    const changedService = changedProviders["@graph"].find((node) =>
      [node["@type"]].flat().includes("Service"),
    );
    changedService.provider = providers.map((id) => ({ "@id": id }));
    assert.throws(
      () => deriveCanonicalSemanticSets(changedProviders, release),
      /exactly one canonical physician provider/,
      `Canonical services must reject ${label} providers`,
    );
  }

  const aliasDrift = structuredClone(graph),''')
replace_once(p, '''        providerDriftRejection: "PASS",''', '''        providerDriftRejection: "PASS",
        additionalProviderRejection: "PASS",
        duplicateProviderRejection: "PASS",
        missingProviderRejection: "PASS",''')

p = paths[4]
replace_once(p, '''<p>کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه هویت رسمی و قابل‌پیگیری دارد. این کلینیک با مالکیت و مدیریت مستقیم دکتر سعید قزلباش فعالیت می‌کند و بستر معاینه، ثبت پرونده، اجرای درمان و پیگیری است. برای بیمار، این یعنی نام پزشک فقط روی صفحه نیست؛ از اولین ارزیابی تا پیگیری نتیجه، تصمیم پزشکی و مسئولیت درمان به دکتر سعید قزلباش برمی‌گردد.</p>''', '''<p>کلینیک زیبایی دکتر سعید قزلباش، مطب شخصی دکتر سعید قزلباش در کرمانشاه است. دکتر قزلباش صاحب مطب و تنها پزشک ارائه‌دهندهٔ خدمات پزشکی و زیبایی آن است. مسئولیت پزشکی و حرفه‌ای مطب بر عهدهٔ ایشان است و تمام خدمات پزشکی و زیبایی ارائه‌شده در این مطب، شخصاً توسط خود ایشان انجام می‌شود و به پزشک دیگر یا اپراتور واگذار نمی‌شود.</p>''')

for p in paths:
    assert hashlib.sha256(changed[p].encode()).hexdigest() == expected[p][1], f'Candidate byte mismatch: {p}'
for p in paths:
    (root / p).write_text(changed[p], encoding='utf-8')
print(json.dumps({'files': {p: {'beforeSha256':expected[p][0], 'afterSha256':expected[p][1]} for p in paths}, 'newProductionFiles': []}, ensure_ascii=False, indent=2))
