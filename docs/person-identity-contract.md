# Person identity contract

The canonical physician entity is `https://www.ghezelbaash.ir/#person`.

The release validator must preserve the complete verified identity set across the canonical graph and the inline Google projection, including:

- IRIMC `167430`
- Canadian MINC `CAMD-0224-1997`
- ORCID `0009-0001-9346-8475`
- Wikidata `Q140287622`
- Google Knowledge Graph identifiers
- MyNCBI bibliography `saeed.ghezelbash.1`
- GitHub, Hugging Face, Pinterest, About.me, Linktree and X profiles
- historical Persian and Latin name variants used for entity disambiguation

LinkedIn, Facebook and Instagram are classified under the separate clinic entity in `Clinic.sameAs`. The physician remains connected to the clinic through `worksFor`, `workLocation` and `affiliation`; the clinic points back through `employee`. Physician registration, researcher and knowledge-graph identifiers must never be absorbed by the clinic entity.
