import type { ProjectState } from "../../../domain/project/projectState.ts";
import type { PileCostSettings } from "../../../core/projectTypes.ts";
import type { CostCatalogAction } from "../../../core/settingsEditCoreClient.ts";
import CostCatalogEditor from "./CostCatalogEditor.tsx";

export type CostSettingsPanelProps = {
  state: ProjectState; onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>; onClose: () => void;
  hasPersonalCostDefault?: boolean; onSaveCostDefault?: (settings: PileCostSettings) => void;
  onLoadCostDefault?: () => void; onRemoveCostDefault?: () => void; onLoadBuiltInCosts?: () => void;
};

export default function CostSettingsPanel({
  state,
  onEditCosts,
  onClose,
  hasPersonalCostDefault = false,
  onSaveCostDefault = () => undefined,
  onLoadCostDefault = () => undefined,
  onRemoveCostDefault = () => undefined,
  onLoadBuiltInCosts = () => undefined,
}: CostSettingsPanelProps) {
  return (
    <CostCatalogEditor
      settings={state.pileCostSettings}
      bearingCapacities={state.bearingCapacities}
      currencyCode={state.currencyCode}
      hasPersonalDefault={hasPersonalCostDefault}
      onEditCosts={onEditCosts}
      onSavePersonalDefault={onSaveCostDefault}
      onLoadPersonalDefault={onLoadCostDefault}
      onRemovePersonalDefault={onRemoveCostDefault}
      onLoadBuiltInDefault={onLoadBuiltInCosts}
      onClose={onClose}
    />
  );
}

