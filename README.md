# Saeed Ghezelbash — website source and release tooling

This repository contains the authored website, its complete linked-data graph and tools for the coordinated dataset distributions. The public name is **Saeed Ghezelbash / سعید قزلباش**. Existing historical author names and citations retain their original attribution.

Start with [the maintenance and frozen-release checkpoint](docs/maintenance-release.md) for the historical checkpoint and preservation policy. The `b753b84011256f13c4badb21af888e92282565dd` checkpoint is historical; the payload restored on 2026-10-23 is source `94611168bacf7630022499204c493f6e4af64f70`. Its JSON-LD extraction checks passed, but the reported Google/Schema.org detection problem remains unresolved. See the [dated investigation and external verification report](docs/schema-repair-20261023.md) for observed results and outstanding checks. The published immutable Dataset archive is [10.5281/zenodo.23474664](https://doi.org/10.5281/zenodo.23474664), source `ed767f6e6726e1453196e2ec2b312fcad00677e2`; the collection DOI is [10.5281/zenodo.18765168](https://doi.org/10.5281/zenodo.18765168). Later mutable repairs and documentation commits do not rewrite or relabel that archived snapshot.

- [DOI roles and historical release planning](docs/doi-policy.md)
- [Read-only local audit and exact historical recovery](docs/maintenance/audit-recovery.md)
- [Dated reports and their historical scope](reports/README.md)
- [First branch inventory](docs/maintenance/branch-retention-20261020.json) and [deeper cleanup inventory](docs/maintenance/branch-retention-deep-20261020.json)
- [Archived workflow snapshots](.github/archive/workflows/2026-10-20/README.md) and [retired standalone utilities](.github/archive/scripts/2026-10-20/README.md)

Preserve every authored entity, relation and multilingual value in the full homepage inline graph and canonical graph download, the ProfilePage + MedicalWebPage architecture, stable entity identifiers and every positioning word. A search-compatibility repair may publish a bounded, acyclic `application/ld+json` projection while preserving the complete canonical graph in a separate `application/json` script with id `canonical-entity-graph`, deeply equal to `graph.jsonld`. That separation must preserve visible content and scientific data, and local validity or third-party extraction must not be reported as Google acceptance. Housekeeping does not regenerate public data, build/deploy the site or publish to any platform. It does not create manual approval requirements or change protection, permissions or secrets. The retained coordinated publisher and its strict validation are separate, explicitly invoked operations.


### Published archive source pin

Record `23474664` is published and immutable. Its source pin is `ed767f6e6726e1453196e2ec2b312fcad00677e2`. Later builds retain that archive source while recording their own website build commit separately. Build with `ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2 npm run build`. The `PREPARE_RESERVED_DOI=23474664` procedure describes the historical first-publication preflight and must not be reused to replace this published archive. Current mutable distributions are checked through exact public revisions, downloaded byte hashes and actual runtime results. Publication receipts remain outside payload files.
