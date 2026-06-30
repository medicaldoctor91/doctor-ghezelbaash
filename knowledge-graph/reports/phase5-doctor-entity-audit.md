# Phase 5 Doctor Entity Audit

## Decision

The nine missing scope terms from Phase 4 are group taxonomy containers, not direct doctor knowledge assertions.

## Action taken

The doctor missing scope knowledge audit now excludes ids that contain `#group-`.

## Remaining high-value gap

The real Doctor entity gap is page authorship and medical review:

- MedicalWebPage without author: 5
- MedicalWebPage without reviewedBy: 5

## Implementation rule

Do not claim author or reviewedBy on unwritten future pages. Add these relations when pages are generated from doctor-approved content.

## Next action

Update page schema generation so generated MedicalWebPage nodes include:

- author -> Doctor
- reviewedBy -> Doctor
- publisher -> Clinic

The static root graph should be updated only after generation and validation are verified.
