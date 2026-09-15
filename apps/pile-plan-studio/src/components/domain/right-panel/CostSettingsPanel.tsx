import type { ProjectState } from "../../../domain/projectState.ts";
import type { PileCostSettings } from "../../../core/projectTypes.ts";
import CostCatalogPanel from "../CostSettingsPanel.tsx";

export type CostSettingsPanelProps = {
  state: ProjectState; onStateChange: (state: ProjectState) => void; onClose: () => void;
  hasPersonalCostDefault?: boolean; onSaveCostDefault?: (settings: PileCostSettings) => void;
  onLoadCostDefault?: () => void; onRemoveCostDefault?: () => void; onLoadBuiltInCosts?: () => void;
};

export default function CostSettingsPanel({
  state,
  onStateChange,
  onClose,
  hasPersonalCostDefault = false,
  onSaveCostDefault = () => undefined,
  onLoadCostDefault = () => undefined,
  onRemoveCostDefault = () => undefined,
  onLoadBuiltInCosts = () => undefined,
}: CostSettingsPanelProps) {
  return (
    <CostCatalogPanel
      settings={state.pileCostSettings}
      bearingCapacities={state.bearingCapacities}
      currencyCode={state.currencyCode}
      hasPersonalDefault={hasPersonalCostDefault}
      onSettingsChange={(pileCostSettings) => onStateChange({ ...state, pileCostSettings })}
      onSavePersonalDefault={onSaveCostDefault}
      onLoadPersonalDefault={onLoadCostDefault}
      onRemovePersonalDefault={onRemoveCostDefault}
      onLoadBuiltInDefault={onLoadBuiltInCosts}
      onClose={onClose}
    />
  );
}

