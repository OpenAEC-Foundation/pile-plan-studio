import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CadPileType, CadQuadrantSymbol } from "../../../core/cadExportCoreClient.ts";
import { CAD_QUADRANT_PATTERNS, defaultCadQuadrants } from "../../../domain/exports/cadQuadrants.ts";
import { Button, Dialog } from "../../../openaec/react/src/index";
import "./CadQuadrantDialog.css";

type Props = {
  types: readonly CadPileType[];
  symbols: readonly CadQuadrantSymbol[];
  onClose: () => void;
  onApply: (symbols: CadQuadrantSymbol[]) => void;
};

const QUADRANT_NAMES = ["topRight", "topLeft", "bottomLeft", "bottomRight"] as const;

export default function CadQuadrantDialog({ types, symbols, onClose, onApply }: Props) {
  const { t } = useTranslation("backstage", { keyPrefix: "exportPanel.cad.quadrants" });
  const { t: common } = useTranslation("common");
  const [draft, setDraft] = useState(() => defaultCadQuadrants(types).map(type =>
    symbols.find(symbol => symbol.shape === type.shape && symbol.size_mm === type.size_mm) ?? type,
  ));
  const [selected, setSelected] = useState(0);
  const active = draft[selected];
  const formatSize = (type: CadPileType) => type.shape === "round"
    ? `Ø ${type.size_mm} mm`
    : `${type.size_mm} × ${type.size_mm} mm`;

  function choosePattern(quadrants: number) {
    if (quadrants === active.quadrants) return;
    const swap = draft.findIndex(symbol => symbol.shape === active.shape && symbol.quadrants === quadrants);
    setDraft(draft.map((symbol, index) => {
      if (index === selected) return { ...symbol, quadrants };
      if (index === swap) return { ...symbol, quadrants: active.quadrants };
      return symbol;
    }));
  }

  function patternLabel(pattern: number) {
    const quadrants = QUADRANT_NAMES.filter((_, index) => pattern & (1 << index)).map(name => t(name));
    return quadrants.length ? t("filled", { quadrants: quadrants.join(", ") }) : t("empty");
  }

  return <div className="cad-quadrant-dialog" onKeyDown={event => event.stopPropagation()}>
    <Dialog open title={t("title")} onClose={onClose} actions={<>
      <Button className="cad-quadrant-reset" onClick={() => setDraft(defaultCadQuadrants(types))}>{t("reset")}</Button>
      <Button onClick={onClose}>{common("cancel")}</Button>
      <Button kind="primary" onClick={() => onApply(draft)}>{t("apply")}</Button>
    </>}>
      <p className="cad-quadrant-help">{t("help")}</p>
      <div className="cad-quadrant-columns">
        <section aria-label={t("sizes")}>
          <h4>{t("sizes")}</h4>
          <div className="cad-quadrant-sizes">
            {draft.map((symbol, index) => <Button key={`${symbol.shape}-${symbol.size_mm}`}
              aria-pressed={index === selected} onClick={() => setSelected(index)}>
              <QuadrantPreview {...symbol} />
              <span>{formatSize(symbol)}</span>
            </Button>)}
          </div>
        </section>
        <section aria-label={t("patterns")}>
          <h4>{t("patterns")}</h4>
          <div className="cad-quadrant-palette">
            {CAD_QUADRANT_PATTERNS.map(pattern => <Button key={pattern} aria-pressed={pattern === active.quadrants}
              aria-label={patternLabel(pattern)} title={patternLabel(pattern)} onClick={() => choosePattern(pattern)}>
              <QuadrantPreview shape={active.shape} quadrants={pattern} />
            </Button>)}
          </div>
          <p className="cad-quadrant-swap">{t("swap")}</p>
        </section>
      </div>
    </Dialog>
  </div>;
}

function QuadrantPreview({ shape, quadrants }: Omit<CadQuadrantSymbol, "size_mm">) {
  const round = shape === "round";
  return <svg aria-hidden="true" viewBox="3 3 34 34" className="cad-quadrant-preview">
    {QUADRANT_NAMES.map((key, index) => Boolean(quadrants & (1 << index)) && <path key={key}
      d={round ? "M20 20V10A10 10 0 0 1 30 20Z" : "M20 20V10H30V20Z"}
      transform={`rotate(${-90 * index} 20 20)`} fill="currentColor" />)}
    {round
      ? <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" />
      : <rect x="10" y="10" width="20" height="20" fill="none" stroke="currentColor" />}
    <path d="M5.5 20H34.5M20 5.5V34.5" fill="none" stroke="currentColor" />
  </svg>;
}
