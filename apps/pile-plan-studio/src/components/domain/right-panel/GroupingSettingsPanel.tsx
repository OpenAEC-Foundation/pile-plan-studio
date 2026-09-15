import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/projectState.ts";
import { DraftNumberField, SettingsGroup } from "./PanelControls.tsx";

export type GroupingSettingsPanelProps = { state: ProjectState; onStateChange: (state: ProjectState) => void; onClose: () => void };

export default function GroupingSettingsPanel({ state, onStateChange, onClose }: GroupingSettingsPanelProps) {
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
      </div>
    </div>
  );
}

