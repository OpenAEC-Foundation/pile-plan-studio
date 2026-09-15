import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import { getSelectedLoadPoints } from "../rightPanelModel.ts";
import { applyCptSelectionSettingsPatch, clearManualCptSelection, getCptSelectionSettingsAggregate } from "../cptSettingsModel.ts";
import { AlgorithmOption, DraftNumberField, SettingsGroup } from "./PanelControls.tsx";
import { startCptSelectionEdit } from "./CptPanel.tsx";

export type CptSettingsPanelProps = { state: ProjectState; onStateChange: (state: ProjectState) => void; onClose: () => void };

export default function CptSettingsPanel({ state, onStateChange, onClose }: CptSettingsPanelProps) {
  const { t } = useTranslation("rightPanel");
  const [overwriteManualSelections, setOverwriteManualSelections] = useState(false);
  const selectedLoadPoints = getSelectedLoadPoints(state);
  const settingsScope = selectedLoadPoints.length === 0 ? "all" : state.cptSettingsScope;
  const settings = getCptSelectionSettingsAggregate(state);
  const settingsLoadPoints = selectedLoadPoints;
  const manualCptCount = settingsLoadPoints.reduce(
    (count, loadPoint) => count + (state.manualCptIdsByLoadPoint.get(loadPoint.id)?.length ?? 0),
    0,
  );
  const settingsSubtitle = selectedLoadPoints.length === 0
    ? t("cptSettings.allLoadPoints")
    : t("cptSettings.selectedCount", { count: selectedLoadPoints.length });
  const scopeDescription = selectedLoadPoints.length === 0
    ? t("cptSettings.noSelection")
    : settingsScope === "all"
      ? t("cptSettings.global")
      : t("cptSettings.selected");

  return (
    <div className="cpt-settings-panel">
      <header className="right-panel-header">
        <div><h2>{t("cptSettings.title")}</h2><span>{settingsSubtitle}</span></div>
        <button className="right-panel-task-close" type="button" aria-label={t("actions.close")} onClick={onClose}>&times;</button>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title={t("cptSettings.applyTo")}>
          <div className="segmented-control" role="group" aria-label={t("cptSettings.applyTo")}>
            <button
              className={settingsScope === "all" ? "is-selected" : ""}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "all" })}
            >{t("cptSettings.allLoadPoints")}</button>
            <button
              className={settingsScope === "selected" ? "is-selected" : ""}
              disabled={selectedLoadPoints.length === 0}
              type="button"
              onClick={() => onStateChange({ ...state, cptSettingsScope: "selected" })}
            >{t("cptSettings.selectedLoadPoints")}</button>
          </div>
          <label className="settings-checkbox">
            <input
              checked={overwriteManualSelections}
              type="checkbox"
              onChange={(event) => setOverwriteManualSelections(event.currentTarget.checked)}
            />
            <span>{t("cptSettings.overwriteManualSelections")}</span>
          </label>
          <p className="supporting-text">
            {scopeDescription}
          </p>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.distances")}>
          <DraftNumberField
            ariaLabel={t("cptSettings.maxDistance")}
            emptyValue={0}
            helpText={t("cptSettings.maxDistanceHelp")}
            label={t("cptSettings.maxDistance")}
            min={0}
            placeholder={settings.maxDistanceM === null ? t("cptSettings.mixed") : undefined}
            step={1}
            suffix="m"
            value={settings.maxDistanceM}
            onCommit={(value) => onStateChange(applyCptSelectionSettingsPatch(state, { maxDistanceM: value }, overwriteManualSelections))}
          />
          <DraftNumberField
            ariaLabel={t("cptSettings.monopolyDistance")}
            emptyValue={0}
            helpText={t("cptSettings.monopolyDistanceHelp")}
            label={t("cptSettings.monopolyDistance")}
            min={0}
            placeholder={settings.monopolyDistanceM === null ? t("cptSettings.mixed") : undefined}
            step={1}
            suffix="m"
            value={settings.monopolyDistanceM}
            onCommit={(value) => onStateChange(applyCptSelectionSettingsPatch(state, { monopolyDistanceM: value }, overwriteManualSelections))}
          />
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.algorithm")}>
          <div className="algorithm-grid" role="radiogroup" aria-label={t("cptSettings.algorithm")}>
            <AlgorithmOption
              active={settings.algorithm === "quadrants"}
              label={t("cptSettings.quadrants")}
              sketch="quadrants"
              onClick={() => onStateChange(applyCptSelectionSettingsPatch(state, { algorithm: "quadrants" }, overwriteManualSelections))}
            />
            <AlgorithmOption
              active={settings.algorithm === "maximum-angle"}
              label={t("cptSettings.maximumAngle")}
              sketch="maximum-angle"
              onClick={() => onStateChange(applyCptSelectionSettingsPatch(state, { algorithm: "maximum-angle" }, overwriteManualSelections))}
            />
          </div>
          <div>
            <DraftNumberField
              ariaLabel={t("cptSettings.maximumAngle")}
              disabled={settings.algorithm !== null && settings.algorithm !== "maximum-angle"}
              emptyValue={1}
              label={t("cptSettings.maximumAngle")}
              max={360}
              min={1}
              placeholder={settings.maxAngleDegrees === null ? t("cptSettings.mixed") : undefined}
              step={1}
              suffix="deg"
              value={settings.maxAngleDegrees}
              onCommit={(value) => onStateChange(applyCptSelectionSettingsPatch(state, { maxAngleDegrees: value }, overwriteManualSelections))}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.manual")}>
          <p className="supporting-text">
            {manualCptCount > 0
                ? t("cptSettings.manualCount", { count: manualCptCount })
                : t("cptSettings.algorithmic")}
          </p>
          <div className="selection-actions">
            <button
              className="settings-modify-button"
              disabled={selectedLoadPoints.length === 0}
              type="button"
              onClick={() => {
                onStateChange(startCptSelectionEdit(state));
                onClose();
              }}
            >{t("actions.modifySelection")}</button>
            {manualCptCount > 0 && state.selectedLoadPointId !== null ? (
              <button type="button" onClick={() => onStateChange(clearManualCptSelection(state))}>{t("actions.useAlgorithm")}</button>
            ) : null}
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}

