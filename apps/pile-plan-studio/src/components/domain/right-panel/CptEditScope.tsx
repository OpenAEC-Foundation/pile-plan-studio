import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { getManualCptSelectionUpdates, setManualCptEditLoadPoint } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { localizeLoadPointName } from "./PanelControls.tsx";

export default function CptEditScope({ state, onStateChange, disabled }: {
  state: ProjectState; onStateChange: (state: ProjectState) => void; disabled: boolean;
}) {
  const { t } = useTranslation("rightPanel");
  const draft = state.cptSelectionEditDraft!;
  const points = state.loadPoints.filter(point => draft.loadPointIds.includes(point.id));
  const focus = state.cptSelectionEditLoadPointId ?? null;
  const index = points.findIndex(point => point.id === focus);
  const updates = getManualCptSelectionUpdates(state);
  return <div className="cpt-edit-scope">
    <label className="cpt-location-picker">
      <span>{t("cpts.editFor")}</span>
      <select value={focus ?? ""} disabled={disabled} onChange={event => onStateChange(setManualCptEditLoadPoint(state, event.target.value === "" ? null : Number(event.target.value)))}>
        <option value="">{t("cpts.allLocations", { count: points.length })}</option>
        {points.map(point => {
          const manual = updates.has(point.id) ? updates.get(point.id) !== null : state.manualCptIdsByLoadPoint.has(point.id);
          return <option key={point.id} value={point.id}>{point.id} · {localizeLoadPointName(point.name, t)} · {t(manual ? "cpts.manual" : "cpts.automatic")}</option>;
        })}
      </select>
    </label>
    {focus !== null ? <div className="cpt-location-navigation">
      <button type="button" disabled={disabled || index <= 0} onClick={() => onStateChange(setManualCptEditLoadPoint(state, points[index - 1]!.id))}>{t("cpts.previousLocation")}</button>
      <span>{index + 1} / {points.length}</span>
      <button type="button" disabled={disabled || index >= points.length - 1} onClick={() => onStateChange(setManualCptEditLoadPoint(state, points[index + 1]!.id))}>{t("cpts.nextLocation")}</button>
    </div> : null}
    <details className="cpt-edit-summary">
      <summary>{t("cpts.changedLocations", { changed: updates.size, total: points.length })}</summary>
      <div className="cpt-usage-members">{[...updates.keys()].map(id => <button key={id} type="button" disabled={disabled} onClick={() => onStateChange(setManualCptEditLoadPoint(state, id))}>{id}</button>)}</div>
    </details>
    <p className="supporting-text">{t("cpts.projectWideHelp")}</p>
  </div>;
}
