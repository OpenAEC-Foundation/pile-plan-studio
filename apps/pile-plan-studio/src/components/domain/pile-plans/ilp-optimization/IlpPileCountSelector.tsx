import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IlpOptimizationSettings } from "../../../../core/ilpOptimizationTypes.ts";
import { MAX_PILE_CAP_COUNT } from "../../../../core/pileCapProposalTypes.ts";
import Modal from "../../../template/Modal.tsx";
import ThemedNumberInput from "../../../template/ThemedNumberInput.tsx";
import "./ilpPileCountSelector.css";

const counts = Array.from({ length: MAX_PILE_CAP_COUNT }, (_, index) => index + 1);
type Selection = { max_piles_per_cap: number; allowed_pile_counts: number[] };

export default function IlpPileCountSelector({ settings, disabled, onChange }: {
  settings: IlpOptimizationSettings;
  disabled: boolean;
  onChange: (selection: Selection) => void;
}) {
  const { t } = useTranslation("ribbon");
  const { t: common } = useTranslation("common");
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [maximumText, setMaximumText] = useState("6");
  const [allowed, setAllowed] = useState<number[]>(counts);
  const maximum = Number(maximumText);
  const validMaximum = maximumText.trim() !== "" && Number.isInteger(maximum) && maximum >= 1 && maximum <= MAX_PILE_CAP_COUNT;
  const selected = allowed.filter(count => count <= maximum);
  const savedMaximum = settings.max_piles_per_cap ?? 6;
  const savedAllowed = (settings.allowed_pile_counts ?? counts).filter(count => count <= savedMaximum);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const close = () => setOpen(false);
  const show = () => {
    setMaximumText(String(savedMaximum));
    setAllowed([...(settings.allowed_pile_counts ?? counts)]);
    setOpen(true);
  };
  return <div className="ilp-pile-count-selector">
    <button type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      {t("ilp.choosePileCounts")}
    </button>
    <span className="supporting-text">{t("ilp.pileCountsSummary", { counts: savedAllowed.join(", "), maximum: savedMaximum })}</span>
    <Modal open={open} onClose={close} title={t("ilp.allowedPileCounts")} width={430}
      className="ilp-pile-count-dialog" closeLabel={common("close")}
      footer={<>
        <button type="button" onClick={close}>{common("cancel")}</button>
        <button type="button" className="primary-action" disabled={!validMaximum || selected.length === 0}
          onClick={() => { onChange({ max_piles_per_cap: maximum, allowed_pile_counts: [...allowed].sort((a, b) => a - b) }); close(); }}>
          {common("apply")}
        </button>
      </>}>
      <div className="ilp-pile-count-maximum">
        <label htmlFor={inputId}>{t("ilp.maxPilesPerCap")}</label>
        <ThemedNumberInput id={inputId} min={1} max={MAX_PILE_CAP_COUNT} step={1}
          value={maximumText} onValueChange={setMaximumText} aria-invalid={!validMaximum}/>
      </div>
      <p className="supporting-text">{t("ilp.pileCountsHelp")}</p>
      <div className="ilp-pile-count-actions">
        <button type="button" disabled={!validMaximum} onClick={() => setAllowed([...new Set([...allowed, ...counts.filter(n => n <= maximum)])])}>{t("ilp.selectAllPileCounts")}</button>
        <button type="button" disabled={!validMaximum} onClick={() => setAllowed(allowed.filter(n => n > maximum))}>{t("ilp.clearPileCounts")}</button>
      </div>
      <div className="ilp-pile-count-grid">
        {counts.map(count => <label key={count} className={count > maximum || !validMaximum ? "is-disabled" : undefined}>
          <input type="checkbox" disabled={!validMaximum || count > maximum}
            checked={validMaximum && count <= maximum && allowed.includes(count)}
            onChange={event => setAllowed(event.target.checked ? [...allowed, count] : allowed.filter(n => n !== count))}/>
          <span>{t("ilp.pileCountLabel", { count })}</span>
        </label>)}
      </div>
      {!validMaximum ? <p className="supporting-text" role="alert">{t("ilp.invalidPileCountMaximum")}</p>
        : selected.length === 0 && <p className="supporting-text" role="alert">{t("ilp.chooseAtLeastOnePileCount")}</p>}
      <p className="supporting-text">{t("ilp.existingPileCountsHelp")}</p>
    </Modal>
  </div>;
}
