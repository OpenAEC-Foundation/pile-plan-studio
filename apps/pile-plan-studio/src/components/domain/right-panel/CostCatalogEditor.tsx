import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BearingCapacity, PileCostSettings, PileCostSettingsItem } from "../../../core/projectTypes.ts";
import { partitionPileCostItems } from "../../../domain/pile-plans/pileCostCatalog.ts";
import type { CostCatalogAction } from "../../../core/settingsEditCoreClient.ts";
import { formatNumber } from "../../../domain/formatting.ts";
import { commitCostInput, costEditErrorKey } from "./costSettingsModel.ts";
import { Button, Heading, IconButton, OpenAECProvider, Panel, Select, Status, Table } from "../../../openaec/react/src/index";
import { NumberField } from "../../template/NumberInput.tsx";
import spriteUrl from "../../../openaec/studioSprite.ts";
import { SettingsGroup } from "./PanelControls.tsx";
import NamedDefaults, { type NamedDefaultsBinding } from "../shared/NamedDefaults.tsx";
import "../../../openaec/openaec-components.css";
import "./costSettings.css";

export type CostUserDefaults = NamedDefaultsBinding<PileCostSettings> & {
  importDefaultName: string | null;
  onImportDefaultChange: (name: string | null) => void;
  onLoad: (settings: PileCostSettings) => Promise<boolean>;
};

type Props = {
  settings: PileCostSettings;
  bearingCapacities: BearingCapacity[];
  currencyCode: string;
  userDefaults?: CostUserDefaults;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
  onLoadBuiltInDefault: () => void;
  onClose: () => void;
};

export default function CostCatalogEditor({
  settings,
  bearingCapacities,
  currencyCode,
  userDefaults,
  onEditCosts,
  onLoadBuiltInDefault,
  onClose,
}: Props) {
  const { t } = useTranslation("rightPanel");
  const [newSizeDraft, setNewSizeDraft] = useState("");
  const [newShape, setNewShape] = useState<"round" | "square">("round");
  const [newCostDraft, setNewCostDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const usedPileSizes = useMemo(
    () => new Set(bearingCapacities.map((capacity) => capacity.pile_size_mm)),
    [bearingCapacities],
  );
  const { used, missingSizes, other } = partitionPileCostItems(settings, usedPileSizes);

  async function editCosts(actions: CostCatalogAction[]): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    try {
      const applied = await onEditCosts(actions);
      setError(applied ? null : t("cost.invalidRow"));
      return applied;
    } catch (error) {
      setError(t(costEditErrorKey(error)));
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function addSize() {
    const pileSizeMm = Number(newSizeDraft);
    const costPerM3 = commitCostInput(newCostDraft);
    if (!Number.isFinite(pileSizeMm) || pileSizeMm <= 0 || costPerM3 === null) {
      setError(t("cost.invalidRow"));
      return;
    }
    if (await editCosts([{ action: "add", item: {
        pile_size_mm: pileSizeMm,
        shape: newShape,
        cost_per_m3: costPerM3,
    } }])) {
      setNewSizeDraft("");
      setNewCostDraft("");
      setError(null);
    }
  }

  return (
    <OpenAECProvider sprite={spriteUrl}>
      <div className="cost-settings-shell" onKeyDown={event => {
        // Native button activation must not trigger the viewer's Space shortcut.
        if ((event.key === " " || event.key === "Enter") && event.target instanceof Element && event.target.closest("button, summary")) {
          event.stopPropagation();
        }
      }}>
        <Panel className="oa-app cost-settings-panel cost-settings-blueprint" title={t("cost.title")}
          actions={<IconButton small icon="ui.close" label={t("actions.close")} onClick={onClose} />}>
          <fieldset className="cost-catalog-scroll" disabled={pending}>
            <p className="cost-settings-subtitle oa-secondary">{t("cost.subtitle")}</p>
            {error && <p className="cost-settings-error" role="alert">{error}</p>}
            <SettingsGroup title={t("cost.projectSizes")} variant="blueprint">
              {missingSizes.length > 0 && (
                <div className="cost-missing-sizes" role="status">
                  <Status tone="warning">{t("cost.missingCosts")}</Status>
                  <span>{missingSizes.map((size) => `${formatNumber(size)} mm`).join(", ")}</span>
                </div>
              )}
              <CostTable label={t("cost.projectSizes")} currencyCode={currencyCode} items={used}
                usedPileSizes={usedPileSizes} onEditCosts={editCosts} />
            </SettingsGroup>

            <details className="blueprint-settings-group cost-other-sizes">
              <summary>{t("cost.otherSizes", { count: other.length })}</summary>
              <CostTable label={t("cost.otherSizes", { count: other.length })} currencyCode={currencyCode} items={other}
                usedPileSizes={usedPileSizes} onEditCosts={editCosts} />
            </details>

            <SettingsGroup title={t("cost.addSize")} variant="blueprint">
              <div className="cost-add-grid">
                <div className="cost-field-with-unit">
                  <NumberField label={t("cost.size")} type="text" inputMode="numeric" min={1} step={1} placeholder="350" value={newSizeDraft}
                    onValueChange={setNewSizeDraft} />
                  <span className="oa-secondary">mm</span>
                </div>
                <Select label={t("cost.shape")} value={newShape} options={shapeOptions(t)}
                  onChange={event => setNewShape(event.currentTarget.value === "square" ? "square" : "round")} />
                <div className="cost-field-with-unit">
                  <NumberField label={t("cost.costPerM3")} type="text" inputMode="decimal" min={0} step={1} placeholder="0" value={newCostDraft}
                    onValueChange={setNewCostDraft} />
                  <span className="oa-secondary">{currencyCode}</span>
                </div>
                <Button onClick={addSize}>{t("cost.add")}</Button>
              </div>
            </SettingsGroup>

            <SettingsGroup title={t("cost.defaults")} variant="blueprint">
              <div className="cost-default-actions">
                <Button onClick={onLoadBuiltInDefault}>{t("cost.loadBuiltInDefault")}</Button>
                {userDefaults && (
                  <NamedDefaults profiles={userDefaults.profiles} onEdit={userDefaults.onEdit} currentValue={settings}
                    updateConfirmation={(name) => t("cost.updateDefaultConfirm", { name })}
                    onLoad={async (catalog) => await userDefaults.onLoad(catalog)
                      ? t("cost.defaultLoaded") : t("userDefaults.loadFailed", { ns: "common" })}>
                    {userDefaults.profiles.length > 0 && (
                      <Select compact label={t("cost.importDefault")} value={userDefaults.importDefaultName ?? ""}
                        options={[
                          { value: "", label: t("cost.builtInImportDefault") },
                          ...userDefaults.profiles.map(({ name }) => ({ value: name, label: name })),
                        ]}
                        onChange={(event) => userDefaults.onImportDefaultChange(event.target.value || null)} />
                    )}
                  </NamedDefaults>
                )}
              </div>
              <div className="cost-built-in-source">
                <Heading>{t("cost.builtInSourceTitle")}</Heading>
                <p className="oa-secondary">{t("cost.builtInSourceDescription")}</p>
              </div>
            </SettingsGroup>
          </fieldset>
        </Panel>
      </div>
    </OpenAECProvider>
  );
}

function CostTable({ label, currencyCode, items, usedPileSizes, onEditCosts }: {
  label: string;
  currencyCode: string;
  items: PileCostSettingsItem[];
  usedPileSizes: ReadonlySet<number>;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
}) {
  const { t } = useTranslation("rightPanel");
  if (items.length === 0) return <p className="oa-secondary cost-no-rows">{t("cost.noRows")}</p>;
  const rows = items.map(item => {
    const size = `${formatNumber(item.pile_size_mm)} mm`;
    const used = usedPileSizes.has(item.pile_size_mm);
    return {
      size,
      shape: <Select label={`${t("cost.shape")}, ${size}`} value={item.shape} options={shapeOptions(t)}
        onChange={event => { void onEditCosts([{ action: "update", pile_size_mm: item.pile_size_mm,
          shape: event.currentTarget.value === "round" ? "round" : "square" }]); }} />,
      cost: <CostValueField item={item} currencyCode={currencyCode} onEditCosts={onEditCosts} />,
      remove: <IconButton small className="cost-remove-button" icon="ui.close"
        label={`${t("cost.removeSize")}, ${size}`} disabled={used}
        title={used ? t("cost.inUse") : t("cost.removeSize")}
        onClick={() => { void onEditCosts([{ action: "remove", pile_size_mm: item.pile_size_mm }]); }} />,
    };
  });
  return (
    <div className="cost-settings-table-wrap">
      <Table label={label} columns={[
        { key: "size", label: t("cost.size") },
        { key: "shape", label: t("cost.shape") },
        { key: "cost", label: t("cost.costPerM3") },
        { key: "remove", label: "" },
      ]} rows={rows} rowKey={row => row.size} />
    </div>
  );
}

function CostValueField({ currencyCode, item, onEditCosts }: {
  currencyCode: string;
  item: PileCostSettingsItem;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
}) {
  const { t } = useTranslation("rightPanel");
  const [costDraft, setCostDraft] = useState(String(item.cost_per_m3));
  useEffect(() => setCostDraft(String(item.cost_per_m3)), [item.cost_per_m3]);
  return (
    <div className="cost-table-value">
      <span className="oa-secondary">{currencyCode}</span>
      <NumberField label={`${t("cost.costPerM3")}, ${formatNumber(item.pile_size_mm)} mm (${currencyCode})`}
        type="number" className="oa-number" min="0" step="1" value={costDraft}
        onValueChange={setCostDraft}
        onBlur={async () => {
          const cost = commitCostInput(costDraft);
          if (cost === null) return setCostDraft(String(item.cost_per_m3));
          const applied = await onEditCosts([{ action: "update", pile_size_mm: item.pile_size_mm, cost_per_m3: cost }]);
          setCostDraft(String(applied ? cost : item.cost_per_m3));
        }}
        onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    </div>
  );
}

function shapeOptions(t: (key: string) => string) {
  return [
    { value: "round", label: t("cost.round") },
    { value: "square", label: t("cost.square") },
  ];
}
