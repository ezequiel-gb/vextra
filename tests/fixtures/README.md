# Fixture provenance

`document.ts` and the inline JSON3/XML/SRV3 fixtures in unit tests are synthetic test data authored for this project. They deliberately include repeated phrases, overlapping cues, Unicode, untrusted markup and missing/corrupt fields. They are not represented as captured YouTube transcripts.

Production modules never import tests or these fixtures. Browser fixture tests seed an isolated test profile's IndexedDB to exercise recovery, selection, formatting, preview and completed downloads. These tests are explicitly labelled separately from live extraction probes. Real caption captures were unavailable because the tested requests returned empty bodies; the extraction validation gate remains failed.
