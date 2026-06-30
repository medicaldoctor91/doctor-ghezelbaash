# Phase 4 Spine Audit

Source: graph-ghezelbaash-final.jsonld

## Summary

- Nodes: 269
- Unique ids: 269
- Services: 5
- MedicalWebPages: 5
- Aesthetic scope terms: 114

## Spine checks

- Services not linked from clinic: 0
- Services not linked from physician: 0
- Services without subject page: 0
- Page to service mainEntity gaps: 0
- Scope terms outside term set: 0
- Doctor missing scope knowledge terms: 9
- MedicalWebPages without author: 5
- MedicalWebPages without reviewedBy: 5
- MedicalWebPages without publisher: 0
- MedicalWebPages without topic: 0

## Interpretation

The service spine is structurally strong. The main remaining gaps are not broken service links. They are authorship/review links for medical pages and nine group-level knowledge terms that are in the scope set but not directly in the doctor knowsAbout list.

## Next action

Phase 5 should strengthen the Doctor entity by adding page authorship/review policy to generated pages and by deciding whether group-level knowledge terms should be direct knowsAbout topics or taxonomy containers only.
