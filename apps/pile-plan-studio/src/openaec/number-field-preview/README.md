# Blueprint number-input preview

This directory integrates [Blueprint PR 81](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/pull/81)
for [issue 77](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/issues/77).
Source: `OpenAEC-Foundation/OpenAEC-Blueprint`, commit
`c30233c` on `number-field-stepper`.

`number.tsx` and `numberStep.ts` are copied unchanged from `web/react/src/`.
`number-field.css` is the numeric-stepper block from `web/openaec-components.css`.
`base.ts` and `controls.ts` bridge to OPPS's unchanged pinned package; `index.ts`
loads the candidate stylesheet. This is a proposal preview, not a pinned upstream
release. Keep it separate from manifest-managed assets. After acceptance, update
the pin through the existing sync workflow and remove this preview.

The translated app adapter is `components/template/NumberInput.tsx`; OPPS's
left-alignment policy lives in its stylesheet. Draft parsing and project commit
semantics remain with existing app/domain controllers.
