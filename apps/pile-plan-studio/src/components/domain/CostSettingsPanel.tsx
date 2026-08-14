import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BearingCapacity, PileCostSettings, PileCostSettingsItem } from "../../core/projectTypes.ts";
import {
  addPileCostItem,
  partitionPileCostItems,
  removePileCostItem,
  updatePileCostItem,
} from "../../domain/pileCostCatalog.ts";
import { formatNumber } from "../../domain/formatting.ts";
import { commitCostInput } from "./costSettingsModel.ts";
import ThemedNumberInput from "../template/ThemedNumberInput.tsx";
import ThemedSelect from "../template/ThemedSelect.tsx";
import "../template/ThemedSelect.css";
import { removeIcon } from "../template/ribbon/icons.ts";
import "./costSettings.css";

type Props = {
  settings: PileCostSettings;
  bearingCapacities: BearingCapacity[];
  currencyCode: string;
  hasPersonalDefault: boolean;
  onSettingsChange: (settings: PileCostSettings) => void;
  onSavePersonalDefault: (settings: PileCostSettings) => void;
  onLoadPersonalDefault: () => void;
  onRemovePersonalDefault: () => void;
  onLoadBuiltInDefault: () => void;
  onClose: () => void;
};

export default function CostSettingsPanel({
  settings,
  bearingCapacities,
  currencyCode,
  hasPersonalDefault,
  onSettingsChange,
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
  const usedPileSizes = useMemo(
    () => new Set(bearingCapacities.map((capacity) => capacity.pile_size_mm)),
    [bearingCapacities],
  );
  const { used, missingSizes, other } = partitionPileCostItems(settings, usedPileSizes);

  function addSize() {
    const pileSizeMm = Number(newSizeDraft);
    const costPerM3 = commitCostInput(newCostDraft);
    if (!Number.isFinite(pileSizeMm) || pileSizeMm <= 0 || costPerM3 === null) {
      setError(t("cost.invalidRow"));
      return;
    }
    try {
      onSettingsChange(addPileCostItem(settings, {
        pile_size_mm: pileSizeMm,
        shape: newShape,
        cost_per_m3: costPerM3,
      }));
      setNewSizeDraft("");
      setNewCostDraft("");
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <div className="cost-settings-panel">
      <header className="right-panel-header">
        <div><h2>{t("cost.title")}</h2><span>{t("cost.subtitle")}</span></div>
        <button className="right-panel-task-close" type="button" aria-label={t("actions.close")} onClick={onClose}>&times;</button>
      </header>
      <div className="settings-scroll cost-catalog-scroll">
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
            settings={settings}
            usedPileSizes={usedPileSizes}
            onSettingsChange={onSettingsChange}
          />
        </section>

        <details className="settings-group cost-other-sizes">
          <summary>{t("cost.otherSizes", { count: other.length })}</summary>
          <CostTable
            currencyCode={currencyCode}
            items={other}
            settings={settings}
            usedPileSizes={usedPileSizes}
            onSettingsChange={onSettingsChange}
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
        </section>
      </div>
    </div>
  );
}

function CostTable({ currencyCode, items, settings, usedPileSizes, onSettingsChange }: {
  currencyCode: string;
  items: PileCostSettingsItem[];
  settings: PileCostSettings;
  usedPileSizes: ReadonlySet<number>;
  onSettingsChange: (settings: PileCostSettings) => void;
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
            settings={settings}
            used={usedPileSizes.has(item.pile_size_mm)}
            onSettingsChange={onSettingsChange}
            onRemove={() => onSettingsChange(removePileCostItem(settings, item.pile_size_mm, usedPileSizes))}
          />
        ))}</tbody>
      </table>
    </div>
  );
}

function CostSettingsRow({ currencyCode, item, settings, used, onSettingsChange, onRemove }: {
  currencyCode: string;
  item: PileCostSettingsItem;
  settings: PileCostSettings;
  used: boolean;
  onSettingsChange: (settings: PileCostSettings) => void;
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
        onChange={(value) => onSettingsChange(updatePileCostItem(settings, item.pile_size_mm, { shape: value === "round" ? "round" : "square" }))}
      /></td>
      <td><label className="table-number-field"><span>{currencyCode}</span><ThemedNumberInput
        min="0"
        step="1"
        value={costDraft}
        onValueChange={setCostDraft}
        onBlur={() => {
          const cost = commitCostInput(costDraft);
          if (cost === null) return setCostDraft(String(item.cost_per_m3));
          setCostDraft(String(cost));
          onSettingsChange(updatePileCostItem(settings, item.pile_size_mm, { cost_per_m3: cost }));
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
