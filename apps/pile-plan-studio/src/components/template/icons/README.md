# Local icon candidates

`simple-controls.svg` contains the local plus for a new pile plan.
`SimpleIconControls.tsx` keeps the shared Blueprint Button behavior and supplies
the local sprite. Its content fingerprint invalidates warm browser SVG references
after artwork changes. Rename, duplicate, legend edit and column filter use the
pinned Blueprint sprite following issues 82 and 84.

`pile-plan-proposals.svg` contains 16 and 24 px drawings for evaluation inside
Pile Plan Studio, separate from the generated, pinned assets in `src/openaec/icons`.

Candidates cover pile options, CPTs, pile-cap changes, compression/tension,
rectangular selection, confirmation, tip-level regions, load-point groups
and the three settings buttons in the Plan ribbon. The domain settings icons
pair a CPT triangle, a currency-neutral coin stack or the View group symbol
with a lower-right gear. Their six drawings come from
[Blueprint PR #95](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/pull/95)
at commit `a6823481`. The application settings gear uses the pinned sprite.

Render these assets through `PilePlanIcon`, which applies the same theme accent and active/disabled colour roles as `BlueprintIcon`. Keep a separate drawing for each supported size; do not add inherited strokes to the filled gear shapes.
