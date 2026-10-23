import { useTranslation } from "react-i18next";

export default function LoadPointSelectionNavigation({ ids, selectedIds, onSelect, disabled }: {
  ids: number[]; selectedIds: number[]; onSelect: (ids: number[]) => void; disabled: boolean;
}) {
  const { t } = useTranslation("rightPanel");
  const index = selectedIds.length === 1 ? ids.indexOf(selectedIds[0]!) : -1;
  const entireContextSelected = ids.length === selectedIds.length && ids.every(id => selectedIds.includes(id));
  return <>
    <div className="cpt-location-navigation" role="group" aria-label={t("cpts.navigation")}>
      <button type="button" aria-label={t("cpts.previousLocation")} title={t("cpts.previousLocation")}
        disabled={disabled || index <= 0} onClick={() => onSelect([ids[index - 1]!])}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 4-4 4 4 4" /></svg>
      </button>
      <span className="cpt-location-position">{index < 0
        ? t("cpts.contextCount", { count: ids.length })
        : t("cpts.locationPosition", { current: index + 1, total: ids.length })}</span>
      <button type="button" aria-label={t("cpts.nextLocation")} title={t("cpts.nextLocation")}
        disabled={disabled || index >= ids.length - 1} onClick={() => onSelect([ids[index + 1]!])}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
    </div>
    {ids.length > 1 ? <button type="button" className="cpt-select-context" disabled={disabled || entireContextSelected}
      onClick={() => onSelect([...ids])}>{t("cpts.selectEntireContext")}</button> : null}
  </>;
}
