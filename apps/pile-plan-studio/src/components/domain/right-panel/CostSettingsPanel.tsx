import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { CostCatalogAction } from "../../../core/settingsEditCoreClient.ts";
import CostCatalogEditor, { type CostUserDefaults } from "./CostCatalogEditor.tsx";

export type CostSettingsPanelProps = {
  state: ProjectState; onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>; onClose: () => void;
  userDefaults?: CostUserDefaults; onLoadBuiltInCosts?: () => void;
};

export default function CostSettingsPanel({
  state,
  onEditCosts,
  onClose,
  userDefaults,
  onLoadBuiltInCosts = () => undefined,
}: CostSettingsPanelProps) {
  return (
    <CostCatalogEditor
      settings={state.pileCostSettings}
      bearingCapacities={state.bearingCapacities}
      currencyCode={state.currencyCode}
      userDefaults={userDefaults}
      onEditCosts={onEditCosts}
      onLoadBuiltInDefault={onLoadBuiltInCosts}
      onClose={onClose}
    />
  );
}

