import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BearingCapacity, PileCostSettings, PileCostSettingsItem } from "../../../core/projectTypes.ts";
import { partitionPileCostItems } from "../../../domain/pile-plans/pileCostCatalog.ts";
import type { CostCatalogAction } from "../../../core/settingsEditCoreClient.ts";
import { formatNumber } from "../../../domain/formatting.ts";
import { commitCostInput, costEditErrorKey } from "./costSettingsModel.ts";
import ThemedNumberInput from "../../template/ThemedNumberInput.tsx";
import ThemedSelect from "../../template/ThemedSelect.tsx";
import "../../template/ThemedSelect.css";
import { removeIcon } from "../../template/ribbon/icons.ts";
import "./costSettings.css";

type Props = {
  settings: PileCostSettings;
  bearingCapacities: BearingCapacity[];
  currencyCode: string;
  hasPersonalDefault: boolean;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
  onSavePersonalDefault: (settings: PileCostSettings) => void;
  onLoadPersonalDefault: () => void;
  onRemovePersonalDefault: () => void;
  onLoadBuiltInDefault: () => void;
  onClose: () => void;
};

export default function CostCatalogEditor({
  settings,
  bearingCapacities,
  currencyCode,
  hasPersonalDefault,
  onEditCosts,
  onSavePersonalDefault,
  onLoadPersonalDefault,
  onRemovePersonalDefault,
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
    <div className="cost-settings-panel">
      <header className="right-panel-header">
        <div><h2>{t("cost.title")}</h2><span>{t("cost.subtitle")}</span></div>
        <button className="right-panel-task-close" type="button" aria-label={t("actions.close")} onClick={onClose}>&times;</button>
      </header>
      <fieldset className="settings-scroll cost-catalog-scroll" disabled={pending}>
        <section className="settings-group cost-size-settings">
          <h3>{t("cost.projectSizes")}</h3>
          {missingSizes.length > 0 && (
            <div className="cost-missing-sizes" role="status">
              <strong>{t("cost.missingCosts")}</strong>
              <span>{missingSizes.map((size) => `${formatNumber(size)} mm`).join(", ")}</span>
            </div>
          )}
          <CostTable
            currencyCode={currencyCode}
            items={used}
            usedPileSizes={usedPileSizes}
            onEditCosts={editCosts}
          />
        </section>

        <details className="settings-group cost-other-sizes">
          <summary>{t("cost.otherSizes", { count: other.length })}</summary>
          <CostTable
            currencyCode={currencyCode}
            items={other}
            usedPileSizes={usedPileSizes}
            onEditCosts={editCosts}
          />
        </details>

        <section className="settings-group cost-add-size">
          <h3>{t("cost.addSize")}</h3>
          <div className="cost-add-grid">
            <input aria-label={t("cost.size")} inputMode="numeric" placeholder="350" value={newSizeDraft} onChange={(event) => setNewSizeDraft(event.currentTarget.value)} />
            <ThemedSelect
              ariaLabel={t("cost.shape")}
              value={newShape}
              options={shapeOptions(t)}
              onChange={(value) => setNewShape(value === "square" ? "square" : "round")}
            />
            <input aria-label={t("cost.costPerM3")} inputMode="decimal" placeholder="0" value={newCostDraft} onChange={(event) => setNewCostDraft(event.currentTarget.value)} />
            <button type="button" onClick={addSize}>{t("cost.add")}</button>
          </div>
          {error && <p className="cost-settings-error" role="alert">{error}</p>}
        </section>

        <section className="settings-group cost-default-actions">
          <h3>{t("cost.defaults")}</h3>
          <button type="button" onClick={() => {
            if (hasPersonalDefault && !window.confirm(t("cost.replacePersonalDefaultConfirm"))) return;
            onSavePersonalDefault(settings);
          }}>{t("cost.savePersonalDefault")}</button>
          <button type="button" disabled={!hasPersonalDefault} onClick={onLoadPersonalDefault}>{t("cost.loadPersonalDefault")}</button>
          <button type="button" disabled={!hasPersonalDefault} onClick={onRemovePersonalDefault}>{t("cost.removePersonalDefault")}</button>
          <button type="button" onClick={onLoadBuiltInDefault}>{t("cost.loadBuiltInDefault")}</button>
          <div className="cost-built-in-source">
            <strong>{t("cost.builtInSourceTitle")}</strong>
            <p>{t("cost.builtInSourceDescription")}</p>
          </div>
        </section>
      </fieldset>
    </div>
  );
}

function CostTable({ currencyCode, items, usedPileSizes, onEditCosts }: {
  currencyCode: string;
  items: PileCostSettingsItem[];
  usedPileSizes: ReadonlySet<number>;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
}) {
  const { t } = useTranslation("rightPanel");
  if (items.length === 0) return <p className="supporting-text">{t("cost.noRows")}</p>;
  return (
    <div className="cost-settings-table-wrap">
      <table className="cost-settings-table">
        <thead><tr><th>{t("cost.size")}</th><th>{t("cost.shape")}</th><th>{t("cost.costPerM3")}</th><th /></tr></thead>
        <tbody>{items.map((item) => (
          <CostSettingsRow
            currencyCode={currencyCode}
            item={item}
            key={item.pile_size_mm}
            used={usedPileSizes.has(item.pile_size_mm)}
            onEditCosts={onEditCosts}
            onRemove={() => { void onEditCosts([{ action: "remove", pile_size_mm: item.pile_size_mm }]); }}
          />
        ))}</tbody>
      </table>
    </div>
  );
}

function CostSettingsRow({ currencyCode, item, used, onEditCosts, onRemove }: {
  currencyCode: string;
  item: PileCostSettingsItem;
  used: boolean;
  onEditCosts: (actions: CostCatalogAction[]) => Promise<boolean>;
  onRemove: () => void;
}) {
  const { t } = useTranslation("rightPanel");
  const [costDraft, setCostDraft] = useState(String(item.cost_per_m3));
  useEffect(() => setCostDraft(String(item.cost_per_m3)), [item.cost_per_m3]);
  return (
    <tr>
      <td>{formatNumber(item.pile_size_mm)} mm</td>
      <td><ThemedSelect
        ariaLabel={t("cost.shape")}
        value={item.shape}
        options={shapeOptions(t)}
        onChange={(value) => { void onEditCosts([{ action: "update", pile_size_mm: item.pile_size_mm, shape: value === "round" ? "round" : "square" }]); }}
      /></td>
      <td><label className="table-number-field"><span>{currencyCode}</span><ThemedNumberInput
        min="0"
        step="1"
        value={costDraft}
        onValueChange={setCostDraft}
        onBlur={async () => {
          const cost = commitCostInput(costDraft);
          if (cost === null) return setCostDraft(String(item.cost_per_m3));
          const applied = await onEditCosts([{ action: "update", pile_size_mm: item.pile_size_mm, cost_per_m3: cost }]);
          setCostDraft(String(applied ? cost : item.cost_per_m3));
        }}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      /></label></td>
      <td><button className="cost-remove-button" type="button" disabled={used} title={used ? t("cost.inUse") : t("cost.removeSize")} onClick={onRemove} dangerouslySetInnerHTML={{ __html: removeIcon }} /></td>
    </tr>
  );
}

function shapeOptions(t: (key: string) => string) {
  return [
    { value: "round", label: t("cost.round") },
    { value: "square", label: t("cost.square") },
  ];
}
