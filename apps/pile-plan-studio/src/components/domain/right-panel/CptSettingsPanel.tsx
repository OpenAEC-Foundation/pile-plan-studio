import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { getSelectedLoadPoints } from "./rightPanelModel.ts";
import { applyCptSelectionSettingsPatch, clearManualCptSelection, getCptSelectionSettingsAggregate } from "../../../domain/cpt-selection/cptSettingsModel.ts";
import { DraftNumberField, SettingsGroup } from "./PanelControls.tsx";
import CptAlgorithmChoice from "./CptAlgorithmChoice.tsx";
import { startCptSelectionEdit } from "./CptPanel.tsx";
import { Button, Checkbox, IconButton, OpenAECProvider, Panel, Radio } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./cptSettings.css";

export type CptSettingsPanelProps = { state: ProjectState; onStateChange: (state: ProjectState) => void; onClose: () => void };

export default function CptSettingsPanel({ state, onStateChange, onClose }: CptSettingsPanelProps) {
  const { t } = useTranslation("rightPanel");
  const scopeName = useId();
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
    <OpenAECProvider sprite={spriteUrl}>
    <Panel className="oa-app cpt-settings-panel cpt-settings-blueprint" title={t("cptSettings.title")}
      actions={<IconButton small icon="ui.close" label={t("actions.close")} onClick={onClose} />}>
      <div className="cpt-settings-scroll">
        <p className="cpt-settings-subtitle oa-secondary">{settingsSubtitle}</p>
        <SettingsGroup title={t("cptSettings.applyTo")} variant="blueprint">
          <div className="cpt-scope-options" role="radiogroup" aria-label={t("cptSettings.applyTo")}>
            <Radio name={scopeName} checked={settingsScope === "all"} label={t("cptSettings.allLoadPoints")}
              onChange={() => onStateChange({ ...state, cptSettingsScope: "all" })} />
            <Radio name={scopeName} checked={settingsScope === "selected"} label={t("cptSettings.selectedLoadPoints")}
              disabled={selectedLoadPoints.length === 0}
              onChange={() => onStateChange({ ...state, cptSettingsScope: "selected" })} />
          </div>
          <Checkbox label={t("cptSettings.overwriteManualSelections")}
              checked={overwriteManualSelections}
              onChange={(event) => setOverwriteManualSelections(event.currentTarget.checked)}
            />
          <p className="oa-secondary cpt-settings-help">
            {scopeDescription}
          </p>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.distances")} variant="blueprint">
          <DraftNumberField variant="blueprint"
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
          <DraftNumberField variant="blueprint"
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

        <SettingsGroup title={t("cptSettings.algorithm")} variant="blueprint">
          <CptAlgorithmChoice value={settings.algorithm}
            onChange={algorithm => onStateChange(applyCptSelectionSettingsPatch(state, { algorithm }, overwriteManualSelections))} />
          <div>
            <DraftNumberField variant="blueprint"
              ariaLabel={t("cptSettings.maximumAngle")}
              disabled={settings.algorithm !== null && settings.algorithm !== "maximum-angle"}
              emptyValue={1}
              label={t("cptSettings.maximumAngle")}
              max={360}
              min={1}
              placeholder={settings.maxAngleDegrees === null ? t("cptSettings.mixed") : undefined}
              step={1}
              suffix="°"
              value={settings.maxAngleDegrees}
              onCommit={(value) => onStateChange(applyCptSelectionSettingsPatch(state, { maxAngleDegrees: value }, overwriteManualSelections))}
            />
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("cptSettings.manual")} variant="blueprint">
          <p className="oa-secondary cpt-settings-help">
            {manualCptCount > 0
                ? t("cptSettings.manualCount", { count: manualCptCount })
                : t("cptSettings.algorithmic")}
          </p>
          <div className="cpt-selection-actions">
            <Button
              className="settings-modify-button"
              disabled={selectedLoadPoints.length === 0}
              onClick={() => {
                onStateChange(startCptSelectionEdit(state));
                onClose();
              }}
            >{t("actions.modifySelection")}</Button>
            {manualCptCount > 0 && state.selectedLoadPointId !== null ? (
              <Button onClick={() => { onStateChange(clearManualCptSelection(startCptSelectionEdit(state))); onClose(); }}>{t("actions.useAlgorithm")}</Button>
            ) : null}
          </div>
        </SettingsGroup>
      </div>
    </Panel>
    </OpenAECProvider>
  );
}

