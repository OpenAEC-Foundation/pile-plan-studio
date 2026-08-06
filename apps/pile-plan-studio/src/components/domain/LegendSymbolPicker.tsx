import { useState, type KeyboardEvent } from "react";
import type { PileBaseShape, PileFillPattern, PileSymbol } from "../../core/projectTypes.ts";
import { PILE_BASE_SHAPES, PILE_FILL_PATTERNS } from "../../viewer/legendSymbols.ts";
import { renderPileSymbol } from "../../viewer/pileSymbols.ts";

type Props = {
  value: PileSymbol;
  color: string;
  label: string;
  fillLabel: string;
  getShapeLabel: (shape: PileBaseShape) => string;
  getFillLabel: (fill: PileFillPattern) => string;
  onChange: (symbol: PileSymbol) => void;
};

export default function LegendSymbolPicker({
  value,
  color,
  label,
  fillLabel,
  getShapeLabel,
  getFillLabel,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="legend-appearance-picker" onKeyDown={handleKeyDown}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="legend-appearance-trigger"
        title={label}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span dangerouslySetInnerHTML={{ __html: renderPileSymbol(value, color) }} />
        <span aria-hidden="true" className="legend-picker-chevron" />
      </button>
      {open ? (
        <div aria-label={label} className="legend-picker-popover legend-symbol-picker" role="dialog">
          <div className="legend-symbol-large-preview" dangerouslySetInnerHTML={{ __html: renderPileSymbol(value, color) }} />
          <div className="legend-base-shape-grid">
            {PILE_BASE_SHAPES.map((baseShape) => (
              <button
                aria-pressed={value.baseShape === baseShape}
                aria-label={getShapeLabel(baseShape)}
                className="legend-symbol-choice"
                key={baseShape}
                title={getShapeLabel(baseShape)}
                type="button"
                onClick={() => onChange({ ...value, baseShape })}
              >
                <span dangerouslySetInnerHTML={{ __html: renderPileSymbol({ ...value, baseShape }, color) }} />
              </button>
            ))}
          </div>
          <div aria-label={fillLabel} className="legend-fill-patterns" role="radiogroup">
            {PILE_FILL_PATTERNS.map((fillPattern) => (
              <button
                aria-checked={value.fillPattern === fillPattern}
                aria-label={getFillLabel(fillPattern)}
                className="legend-fill-choice"
                key={fillPattern}
                role="radio"
                title={getFillLabel(fillPattern)}
                type="button"
                onClick={() => onChange({ ...value, fillPattern })}
              >
                <span dangerouslySetInnerHTML={{ __html: renderPileSymbol({ ...value, fillPattern }, color) }} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }
}
