import { useTranslation } from "react-i18next";
import type { ProjectState } from "../../../domain/project/projectState.ts";
import { DraftNumberField, SettingsGroup } from "./PanelControls.tsx";
import type { LoadPointGroupEditAction } from "../../../core/loadPointGroupContract.ts";
import type { LoadPointGroup, LoadPointGroupEditPreview } from "../../../core/loadPointGroupContract.ts";
import LoadPointGroupEditButton from "./LoadPointGroupEditButton.tsx";
import { Button, Checkbox, IconButton, OpenAECProvider, Panel } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./groupingSettings.css";

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
    <OpenAECProvider sprite={spriteUrl}>
      <div className="grouping-settings-shell" onKeyDown={event => {
        // Keep native control activation separate from the viewer's shortcuts.
        if ((event.key === " " || event.key === "Enter") && event.target instanceof Element
          && event.target.closest("button, input[type='checkbox']")) event.stopPropagation();
      }}>
        <Panel className="oa-app grouping-settings-panel grouping-settings-blueprint" title={t("groupingSettings.title")}
          actions={<IconButton small icon="ui.close" label={t("actions.close")} onClick={onClose} />}>
          <div className="grouping-settings-scroll">
            <p className="grouping-settings-subtitle oa-secondary">{t("groupingSettings.subtitle")}</p>
            <SettingsGroup title={t("groupingSettings.automaticGroup")} variant="blueprint">
              <Checkbox label={t("groupingSettings.automatic")} checked={settings.automatic}
                onChange={event => onStateChange({
                  ...state,
                  loadPointGroupingSettings: { ...settings, automatic: event.currentTarget.checked },
                })} />
              <p className="grouping-settings-help oa-secondary">{t("groupingSettings.automaticHelp")}</p>
            </SettingsGroup>

            <SettingsGroup title={t("groupingSettings.distanceGroup")} muted={!settings.automatic} variant="blueprint">
              <DraftNumberField variant="blueprint"
                ariaLabel={t("groupingSettings.maxDistance")}
                disabled={!settings.automatic}
                emptyValue={0}
                helpText={t("groupingSettings.maxDistanceHelp")}
                label={t("groupingSettings.maxDistance")}
                min={0}
                step={0.1}
                suffix="m"
                value={settings.maxEdgeDistanceM}
                onCommit={value => onStateChange({
                  ...state,
                  loadPointGroupingSettings: { ...settings, maxEdgeDistanceM: value },
                })} />
            </SettingsGroup>

            <SettingsGroup title={t("groupingSettings.manualChangesGroup")} variant="blueprint">
              <p className="grouping-settings-help oa-secondary">
                {t("groupingSettings.manualChangesSummary", {
                  manual: settings.manualGroups.length,
                  ungrouped: settings.ungroupedGroups.length,
                })}
              </p>
              <div className="grouping-settings-actions">
                <LoadPointGroupEditButton variant="blueprint"
                  editPending={groupEditPending}
                  groups={loadPointGroups}
                  selectedLoadPointIds={state.selectedLoadPointIds}
                  onApply={onApplyLoadPointGroupEdit}
                  onPreview={onPreviewLoadPointGroupEdit} />
                <Button
                  disabled={groupEditPending || (settings.manualGroups.length === 0 && settings.ungroupedGroups.length === 0)}
                  onClick={() => void onApplyLoadPointGroupEdit("reset_overrides")}>
                  {t("groupingSettings.reset")}
                </Button>
              </div>
            </SettingsGroup>

            <SettingsGroup title={t("groupingSettings.visibilityGroup")} variant="blueprint">
              <Checkbox label={t("groupingSettings.showGroups")} checked={state.showLoadPointGroups}
                onChange={event => onStateChange({ ...state, showLoadPointGroups: event.currentTarget.checked })} />
              <p className="grouping-settings-help oa-secondary">{t("groupingSettings.viewHelp")}</p>
            </SettingsGroup>
          </div>
        </Panel>
      </div>
    </OpenAECProvider>
  );
}
