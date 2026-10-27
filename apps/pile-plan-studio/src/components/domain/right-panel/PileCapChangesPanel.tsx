import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { PileCapPreview } from "../../../core/pileCapProposalTypes.ts";
import { pileCapGroupKey } from "../../../domain/pile-plans/pileCapProposals.ts";
import "./pileCapChangesPanel.css";

type Props = {
  state: ProjectState;
  previews: PileCapPreview[];
  selectionPending: boolean;
  selectionControls?: ReactNode;
  resetDisabled: boolean;
  onResetAll: () => void;
  onSelect: (ids: number[]) => void;
  onClose: () => void;
};

export default function PileCapChangesPanel({ state, previews, selectionPending, selectionControls, resetDisabled, onResetAll, onSelect, onClose }: Props) {
  const { t } = useTranslation("rightPanel");
  const plan = state.pilePlans.find(plan => plan.id === state.activePilePlanId);
  const proposals = useMemo(() => [...(plan?.pileCapProposals ?? [])].sort((a, b) =>
    Math.min(...a.load_point_ids) - Math.min(...b.load_point_ids)
    || pileCapGroupKey(a.load_point_ids).localeCompare(pileCapGroupKey(b.load_point_ids), undefined, { numeric: true }),
  ), [plan?.pileCapProposals]);
  const points = useMemo(() => new Map(state.loadPoints.map(point => [point.id, point])), [state.loadPoints]);
  const previewByKey = useMemo(() => new Map(previews.map(preview => [pileCapGroupKey(preview.proposal.load_point_ids), preview])), [previews]);
  const selectedKey = pileCapGroupKey(state.selectedLoadPointIds);

  return (
    <section className="pile-cap-changes-panel" aria-label={t("pileCapOverview.title")}>
      <header className="right-panel-header">
        <div>
          <h2>{t("pileCapOverview.title")}</h2>
          <span className="pile-cap-changes-plan">{plan?.name}</span>
        </div>
        <button className="right-panel-task-close" type="button" aria-label={t("pileCapOverview.close")} onClick={onClose}>&times;</button>
      </header>
      {selectionControls}
      <div className="pile-cap-changes-intro">
        <div className="pile-cap-changes-summary">
          <strong>{t("pileCapOverview.count", { count: proposals.length })}</strong>
          <button type="button" disabled={resetDisabled || proposals.length === 0}
            aria-label={t("pileCapOverview.resetAllHelp")} title={t("pileCapOverview.resetAllHelp")}
            onClick={onResetAll}>{t("pileCapOverview.resetAll")}</button>
        </div>
        {proposals.length > 0 && <p>{t("pileCapOverview.help")}</p>}
      </div>
      {proposals.length === 0 ? (
        <div className="right-panel-empty"><span>{t("pileCapOverview.empty")}</span></div>
      ) : (
        <div className="pile-cap-changes-content">
          <div className="pile-cap-changes-scroll">
            <div className="pile-cap-changes-columns" aria-hidden="true">
              <span>{t("pileCapOverview.locations")}</span>
              <span>{t("pileCapOverview.original")}</span>
              <span>{t("pileCapOverview.proposed")}</span>
            </div>
            <ul className="pile-cap-changes-list" aria-label={t("pileCapOverview.title")}>
              {proposals.map(proposal => {
                const key = pileCapGroupKey(proposal.load_point_ids);
                const ids = [...proposal.load_point_ids].sort((a, b) => a - b);
                const availableIds = ids.filter(id => points.has(id));
                const preview = previewByKey.get(key);
                const status = preview?.status;
                const statusText = status === "group_changed" ? t("pileCap.groupChanged")
                  : status === "invalid_source_data" ? t("pileCap.invalidSource")
                  : status === "missing_cpt_selection" ? t("pileCap.missingSelection")
                  : availableIds.length === 0 ? t("pileCapOverview.sourceMissing") : null;
                const label = t("pileCapOverview.select", { locations: ids.join(", "), original: ids.length, proposed: proposal.pile_count });
                return (
                  <li key={key}>
                    <button type="button" className="pile-cap-changes-row"
                      aria-label={statusText ? `${label}. ${statusText}` : label}
                      aria-pressed={availableIds.length > 0 && selectedKey === pileCapGroupKey(availableIds)}
                      title={ids.map(id => points.get(id)?.name || String(id)).join(", ")}
                      disabled={selectionPending || availableIds.length === 0}
                      onClick={() => onSelect(availableIds)}>
                      <span className="pile-cap-changes-locations">{ids.join(", ")}</span>
                      <span className="pile-cap-changes-number">{ids.length}</span>
                      <strong className="pile-cap-changes-number">{proposal.pile_count}</strong>
                      {statusText && <span className="pile-cap-changes-status">{statusText}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
