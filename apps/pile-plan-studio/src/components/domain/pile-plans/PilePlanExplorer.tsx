import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, MonoLabel, OpenAECProvider, Panel, Status, TextField } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./PilePlanExplorer.css";
import { SimpleIconAction, SimpleIconButton } from "../../template/SimpleIconControls.tsx";

import type { PilePlanData } from "../../../core/projectFile.ts";
import type { ProjectCostSummary } from "../../../domain/pile-plans/projectCostSummary.ts";
import type { InputSource, InputSourceKind } from "../../../domain/project/projectState.ts";

type Props = {
  projectName: string;
  isDirty: boolean;
  pilePlans: PilePlanData[];
  activePilePlanId: string;
  costSummaries: Map<string, ProjectCostSummary>;
  currencyCode: string;
  inputSources: InputSource[];
  activeSourceKind: InputSourceKind | null;
  inputSourcesExpanded: boolean;
  pilePlansExpanded: boolean;
  optimizingPlanId?: string;
  managementDisabled?: boolean;
  creating?: boolean;
  createDisabled?: boolean;
  onActivate: (pilePlanId: string) => void;
  onCreate: () => void;
  onRename: (pilePlanId: string, name: string) => void;
  onDuplicate: (pilePlanId: string) => void;
  onDelete: (pilePlanId: string) => void;
  onSourceActivate: (kind: InputSourceKind) => void;
  onExpansionChange: (group: "inputSources" | "pilePlans", expanded: boolean) => void;
};

export default function PilePlanExplorer({
  projectName,
  isDirty,
  pilePlans,
  activePilePlanId,
  costSummaries,
  currencyCode,
  inputSources,
  activeSourceKind,
  inputSourcesExpanded,
  pilePlansExpanded,
  optimizingPlanId,
  managementDisabled = false,
  creating = false,
  createDisabled = false,
  onActivate,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onSourceActivate,
  onExpansionChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const formatCurrency = (value: number) => new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);

  const startRename = (plan: PilePlanData) => {
    if (managementDisabled) return;
    setRenamingId(plan.id);
    setRenameValue(plan.name);
  };

  const finishRename = (plan: PilePlanData) => {
    if (!managementDisabled) onRename(plan.id, renameValue);
    setRenamingId(null);
  };

  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>, plan: PilePlanData) => {
    if (event.key === "Enter") finishRename(plan);
    if (event.key === "Escape") setRenamingId(null);
  };

  return (
    <OpenAECProvider sprite={spriteUrl}><aside className="oa-app project-explorer explorer-blueprint" aria-label={t("projectExplorer.aria")}>
      <Panel title={t("explorer")} className="explorer-panel">
      <div className="project-tree">
        <section className="project-tree-section">
          <div className="project-tree-label"><MonoLabel>{t("projectExplorer.project")}</MonoLabel></div>
          <div className="project-summary">
            <strong>{projectName}{isDirty ? " *" : ""}</strong>
            <small>IFCPP</small>
          </div>
        </section>

        <section className="project-tree-section" aria-label={t("projectExplorer.inputSources")}>
          <GroupHeading
            expanded={inputSourcesExpanded}
            label={t("projectExplorer.inputSources")}
            onToggle={() => onExpansionChange("inputSources", !inputSourcesExpanded)}
          />
          {inputSourcesExpanded && inputSources.map((source) => (
            <Button
              kind="quiet"
              aria-pressed={activeSourceKind === source.kind}
              className={`project-tree-item${activeSourceKind === source.kind ? " active" : ""}`}
              key={source.kind}
              onClick={() => onSourceActivate(source.kind)}
              type="button"
            >
              <span>{t(`projectExplorer.sources.${source.kind}`)}</span>
              <small>{t(source.kind === "bearing_capacities" ? "projectExplorer.resistanceValues" : "projectExplorer.rows", { count: source.itemCount })}</small>
            </Button>
          ))}
        </section>

        <section className="project-tree-section pile-plan-tree" aria-label={t("projectExplorer.pilePlans")}>
          <GroupHeading
            expanded={pilePlansExpanded}
            label={t("projectExplorer.pilePlans")}
            onToggle={() => onExpansionChange("pilePlans", !pilePlansExpanded)}
          />
          {pilePlansExpanded && <>
          <div className="pile-plan-list" role="listbox" aria-label={t("projectExplorer.pilePlans")}>
            {pilePlans.map((plan) => {
              const active = plan.id === activePilePlanId;
              const proposalCount = plan.pileCapProposals?.length ?? 0;
              const summary = costSummaries.get(plan.id) ?? { missingCount: 0, totalCost: 0 };
              const costsUnavailable = summary.missingCount > 0 && summary.totalCost === 0
                && !summary.proposalPending && !summary.proposalError;
              return (
                <div className={`pile-plan-row${active ? " active" : ""}`} key={plan.id}>
                  {renamingId === plan.id && !managementDisabled ? (
                    <div className="pile-plan-select pile-plan-rename">
                      <TextField
                        label={t("projectExplorer.rename")}
                        autoFocus
                        onBlur={() => finishRename(plan)}
                        onChange={(event) => setRenameValue(event.currentTarget.value)}
                        onKeyDown={(event) => handleRenameKey(event, plan)}
                        value={renameValue}
                      />
                    </div>
                  ) : (
                    <Button
                      kind="quiet"
                      aria-selected={active}
                      className="pile-plan-select"
                      onClick={() => onActivate(plan.id)}
                      role="option"
                      type="button"
                    >
                      <strong>{plan.name}</strong>
                      {plan.id === optimizingPlanId && <small>{t("projectExplorer.optimizing")}</small>}
                      <span className="pile-plan-meta">
                        <span aria-label={costsUnavailable ? t("projectExplorer.costsUnavailable") : undefined}>
                          {summary.proposalPending ? t("rightPanel:pileCap.calculating") : summary.proposalError ? t("rightPanel:pileCap.failed") : costsUnavailable ? "—" : formatCurrency(summary.totalCost)}
                        </span>
                        {proposalCount > 0 ? (
                          <span title={t("rightPanel:pileCap.costsIndicative")}>
                            {t("projectExplorer.proposalCount", { count: proposalCount })}
                          </span>
                        ) : null}
                        {summary.missingCount > 0 ? (
                          <span className="pile-plan-warning" aria-label={t("projectExplorer.missingCosts", { count: summary.missingCount })}>
                            <Status>{t("projectExplorer.missingCostsLabel",{count:summary.missingCount})}</Status>
                          </span>
                        ) : null}
                        {plan.lockedLoadPointIds.length > 0 ? (
                          <span>{t("projectExplorer.locked", { count: plan.lockedLoadPointIds.length })}</span>
                        ) : null}
                      </span>
                    </Button>
                  )}
                  <div className="pile-plan-actions">
                    <ActionButton disabled={managementDisabled} label={t("projectExplorer.rename")} kind="edit" onClick={() => startRename(plan)} />
                    <ActionButton disabled={managementDisabled} label={t("projectExplorer.duplicate")} kind="copy" onClick={() => onDuplicate(plan.id)} />
                    <ActionButton
                      disabled={managementDisabled || pilePlans.length === 1}
                      label={t("projectExplorer.delete")}
                      kind="delete"
                      onClick={() => onDelete(plan.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <SimpleIconAction kind="quiet" icon="local.add" className="new-pile-plan" disabled={creating || createDisabled} onClick={onCreate} type="button">
            <span>{creating ? t("projectExplorer.creating") : t("projectExplorer.newPilePlan")}</span>
          </SimpleIconAction>
          </>}
        </section>
      </div>
    </Panel></aside></OpenAECProvider>
  );
}

function GroupHeading({
  expanded,
  label,
  onToggle,
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      kind="quiet"
      aria-expanded={expanded}
      className="project-tree-group-heading"
      onClick={onToggle}
      type="button"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16"><path d={expanded ? "m4 6 4 4 4-4" : "m6 4 4 4-4 4"} /></svg>
      <span>{label}</span>
    </Button>
  );
}

function ActionButton({
  disabled = false,
  kind,
  label,
  onClick,
}: {
  disabled?: boolean;
  kind: "edit" | "copy" | "delete";
  label: string;
  onClick: () => void;
}) {
  if (kind === "edit") return <SimpleIconButton small icon="local.edit" disabled={disabled} label={label} onClick={onClick}
    data-oa-tip={undefined} data-tooltip={disabled?undefined:label} />;
  return <IconButton small icon={kind === "copy" ? "edit.copy" : "edit.delete"}
    disabled={disabled} label={label} onClick={onClick}
    data-oa-tip={undefined} data-tooltip={disabled?undefined:label} />;
}
