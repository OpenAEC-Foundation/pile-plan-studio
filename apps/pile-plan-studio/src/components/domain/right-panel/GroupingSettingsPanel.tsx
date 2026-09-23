import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { DraftNumberField, SettingsGroup } from "./PanelControls.tsx";
import type { LoadPointGroupEditAction } from "../../../core/loadPointGroupContract.ts";
import type { LoadPointGroup, LoadPointGroupEditPreview } from "../../../core/loadPointGroupContract.ts";
import LoadPointGroupEditButton from "./LoadPointGroupEditButton.tsx";

export type GroupingSettingsPanelProps = {
  state: ProjectState;
  loadPointGroups: LoadPointGroup[];
  groupEditPending: boolean;
  onPreviewLoadPointGroupEdit: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<LoadPointGroupEditPreview | null>;
  onApplyLoadPointGroupEdit: (
    action: LoadPointGroupEditAction,
    selectedLoadPointIds?: number[],
  ) => Promise<void>;
  onStateChange: (state: ProjectState) => void;
  onClose: () => void;
};

export default function GroupingSettingsPanel({ state, loadPointGroups, groupEditPending, onPreviewLoadPointGroupEdit, onApplyLoadPointGroupEdit, onStateChange, onClose }: GroupingSettingsPanelProps) {
  const { t } = useTranslation("rightPanel");
  const settings = state.loadPointGroupingSettings;

  return (
    <div className="grouping-settings-panel">
      <header className="right-panel-header">
        <div>
          <h2>{t("groupingSettings.title")}</h2>
          <span>{t("groupingSettings.subtitle")}</span>
        </div>
        <button className="right-panel-task-close" type="button" aria-label={t("actions.close")} onClick={onClose}>&times;</button>
      </header>

      <div className="settings-scroll">
        <SettingsGroup title={t("groupingSettings.automaticGroup")}>
          <label className="settings-checkbox">
            <input
              checked={settings.automatic}
              type="checkbox"
              onChange={(event) => onStateChange({
                ...state,
                loadPointGroupingSettings: {
                  ...settings,
                  automatic: event.currentTarget.checked,
                },
              })}
            />
            <span>{t("groupingSettings.automatic")}</span>
          </label>
          <p className="supporting-text">{t("groupingSettings.automaticHelp")}</p>
        </SettingsGroup>

        <SettingsGroup title={t("groupingSettings.distanceGroup")} muted={!settings.automatic}>
          <DraftNumberField
            ariaLabel={t("groupingSettings.maxDistance")}
            disabled={!settings.automatic}
            emptyValue={0}
            helpText={t("groupingSettings.maxDistanceHelp")}
            label={t("groupingSettings.maxDistance")}
            min={0}
            step={0.1}
            suffix="m"
            value={settings.maxEdgeDistanceM}
            onCommit={(value) => onStateChange({
              ...state,
              loadPointGroupingSettings: {
                ...settings,
                maxEdgeDistanceM: value,
              },
            })}
          />
        </SettingsGroup>

        <SettingsGroup title={t("groupingSettings.manualChangesGroup")}>
          <p className="supporting-text">
            {t("groupingSettings.manualChangesSummary", {
              manual: settings.manualGroups.length,
              ungrouped: settings.ungroupedGroups.length,
            })}
          </p>
          <div className="grouping-settings-actions">
            <LoadPointGroupEditButton
              editPending={groupEditPending}
              groups={loadPointGroups}
              selectedLoadPointIds={state.selectedLoadPointIds}
              onApply={onApplyLoadPointGroupEdit}
              onPreview={onPreviewLoadPointGroupEdit}
            />
            <button
              className="settings-secondary-button"
              disabled={groupEditPending || (settings.manualGroups.length === 0 && settings.ungroupedGroups.length === 0)}
              type="button"
              onClick={() => void onApplyLoadPointGroupEdit("reset_overrides")}
            >
              {t("groupingSettings.reset")}
            </button>
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("groupingSettings.visibilityGroup")}>
          <label className="settings-checkbox">
            <input
              checked={state.showLoadPointGroups}
              type="checkbox"
              onChange={(event) => onStateChange({
                ...state,
                showLoadPointGroups: event.currentTarget.checked,
              })}
            />
            <span>{t("groupingSettings.showGroups")}</span>
          </label>
          <p className="supporting-text">{t("groupingSettings.viewHelp")}</p>
        </SettingsGroup>
      </div>
    </div>
  );
}

