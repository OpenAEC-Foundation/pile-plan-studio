import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IlpOptimizationSettings } from "../../../../core/ilpOptimizationTypes.ts";
import { MAX_PILE_CAP_COUNT } from "../../../../core/pileCapProposalTypes.ts";
import { Button, Checkbox, Dialog, IconButton } from "../../../../openaec/react/src/index";
import IlpNumberField from "./IlpNumberField.tsx";
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
    <Button disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={show}>
      {t("ilp.choosePileCounts")}
    </Button>
    <span className="ilp-help oa-secondary">{t("ilp.pileCountsSummary", { counts: savedAllowed.join(", "), maximum: savedMaximum })}</span>
    <div className="oa-app ilp-pile-count-blueprint" onKeyDown={event => event.stopPropagation()}>
      <Dialog open={open} onClose={close} title={t("ilp.allowedPileCounts")} actions={<>
        <Button onClick={close}>{common("cancel")}</Button>
        <Button kind="primary" disabled={!validMaximum || selected.length === 0}
          onClick={() => { onChange({ max_piles_per_cap: maximum, allowed_pile_counts: [...allowed].sort((a, b) => a - b) }); close(); }}>
          {common("apply")}
        </Button>
      </>}>
        <IconButton icon="ui.close" label={common("close")} className="ilp-pile-count-close" onClick={close} />
        <div className="ilp-pile-count-content">
          <IlpNumberField id={inputId} label={t("ilp.maxPilesPerCap")} min={1} max={MAX_PILE_CAP_COUNT} step={1}
            value={maximumText} onValueChange={setMaximumText} aria-invalid={!validMaximum} />
          <p className="ilp-help oa-secondary">{t("ilp.pileCountsHelp")}</p>
          <div className="ilp-pile-count-actions">
            <Button compact disabled={!validMaximum} onClick={() => setAllowed([...new Set([...allowed, ...counts.filter(n => n <= maximum)])])}>{t("ilp.selectAllPileCounts")}</Button>
            <Button compact disabled={!validMaximum} onClick={() => setAllowed(allowed.filter(n => n > maximum))}>{t("ilp.clearPileCounts")}</Button>
          </div>
          <div className="ilp-pile-count-grid">
            {counts.map(count => <Checkbox key={count} label={t("ilp.pileCountLabel", { count })}
              disabled={!validMaximum || count > maximum} checked={validMaximum && count <= maximum && allowed.includes(count)}
              onChange={event => setAllowed(event.target.checked ? [...allowed, count] : allowed.filter(n => n !== count))} />)}
          </div>
          {!validMaximum ? <p className="oa-field-message" role="alert">{t("ilp.invalidPileCountMaximum")}</p>
            : selected.length === 0 && <p className="oa-field-message" role="alert">{t("ilp.chooseAtLeastOnePileCount")}</p>}
          <p className="ilp-help oa-secondary">{t("ilp.existingPileCountsHelp")}</p>
        </div>
      </Dialog>
    </div>
  </div>;
}
