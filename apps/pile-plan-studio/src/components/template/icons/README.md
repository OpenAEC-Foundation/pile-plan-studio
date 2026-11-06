# Local icon candidates

`simple-controls.svg` contains the local outline-only pencil, funnel and plus
requested on 2026-11-05. The same pencil is used for legend editing and plan
renaming. `SimpleIconControls.tsx` keeps the shared Blueprint Button/IconButton
behavior and supplies only a local sprite. Its content fingerprint invalidates
warm browser SVG references after artwork changes. These symbols do not modify
the pinned Blueprint icons; edit/filter proposals are tracked in issues 82/84.

`pile-plan-proposals.svg` contains the 16 and 24 px drawings reviewed in chat on 2026-11-02, for evaluation inside Pile Plan Studio. It is deliberately separate from the generated, pinned assets in `src/openaec/icons`.

Candidates cover pile options, CPTs, pile-cap changes, compression/tension, rectangular selection, domain settings, confirmation, tip-level regions and load-point groups. `helper.group` and `helper.settings` are reusable drawing parts. Their IDs are local candidates; final shared IDs and the Blueprint source/generation pipeline will be handled in the later PR after application review.

The generic application settings gear lives separately in `ApplicationSettingsIcon.tsx`. It is a local application preference tracked by Blueprint issue 73 and is excluded from the domain-icon PR. No upstream `ui.settings` artwork is overridden here.

Render these assets through `PilePlanIcon`, which applies the same theme accent and active/disabled colour roles as `BlueprintIcon`. Keep a separate drawing for each supported size; do not add inherited strokes to the filled gear shapes.
