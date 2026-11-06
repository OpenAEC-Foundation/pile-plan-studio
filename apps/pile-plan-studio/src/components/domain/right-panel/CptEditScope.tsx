import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { getManualCptSelectionUpdates, setManualCptEditLoadPoint } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { Button } from "../../../openaec/react/src/index";

export default function CptEditScope({ state, onStateChange, disabled }: {
  state: ProjectState; onStateChange: (state: ProjectState) => void; disabled: boolean;
}) {
  const { t } = useTranslation("rightPanel");
  const draft = state.cptSelectionEditDraft!;
  const points = state.loadPoints.filter(point => draft.loadPointIds.includes(point.id));
  const updates = getManualCptSelectionUpdates(state);
  return <div className="cpt-edit-scope">
    {updates.size === 0 ? <span className="cpt-edit-summary">{t("cpts.changedLocations", { changed: 0, total: points.length })}</span> : <details className="cpt-edit-summary">
      <summary>{t("cpts.changedLocations", { changed: updates.size, total: points.length })}</summary>
      <div className="cpt-usage-members">{[...updates.keys()].map(id => <Button compact key={id} disabled={disabled} onClick={() => onStateChange(setManualCptEditLoadPoint(state, id))}>{id}</Button>)}</div>
    </details>}
    <p className="cpt-panel-help oa-secondary">{t("cpts.projectWideHelp")}</p>
  </div>;
}
