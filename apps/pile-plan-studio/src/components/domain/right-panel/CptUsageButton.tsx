import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { setManualCptEditLoadPoint, startManualCptSelectionEdit } from "../../../domain/cpt-selection/cptSettingsModel.ts";

export default function CptUsageButton({ state, ids, children, onStateChange, disabled }: {
  state: ProjectState; ids: number[]; children: ReactNode;
  onStateChange: (state: ProjectState) => void; disabled: boolean;
}) {
  const { t } = useTranslation("rightPanel");
  return <details className="cpt-usage-details">
    <summary role="button" aria-disabled={disabled}>{children}</summary>
    <div className="cpt-usage-members">
      {ids.map(id => <button key={id} type="button" disabled={disabled}
        aria-label={t("cpts.editLocation", { id })}
        onClick={() => onStateChange(setManualCptEditLoadPoint(state.cptSelectionEditDraft ? state : startManualCptSelectionEdit(state), id))}>{id}</button>)}
    </div>
  </details>;
}
