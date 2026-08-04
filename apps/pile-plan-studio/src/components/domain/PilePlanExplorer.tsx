import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { PilePlanData } from "../../core/projectFile.ts";
import type { ProjectCostSummary } from "../../domain/projectCostSummary.ts";

type Props = {
  projectName: string;
  isDirty: boolean;
  pilePlans: PilePlanData[];
  activePilePlanId: string;
  costSummaries: Map<string, ProjectCostSummary>;
  creating?: boolean;
  createDisabled?: boolean;
  onActivate: (pilePlanId: string) => void;
  onCreate: () => void;
  onRename: (pilePlanId: string, name: string) => void;
  onDuplicate: (pilePlanId: string) => void;
  onDelete: (pilePlanId: string) => void;
};

export default function PilePlanExplorer({
  projectName,
  isDirty,
  pilePlans,
  activePilePlanId,
  costSummaries,
  creating = false,
  createDisabled = false,
  onActivate,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const formatCurrency = (value: number) => new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

  const startRename = (plan: PilePlanData) => {
    setRenamingId(plan.id);
    setRenameValue(plan.name);
  };

  const finishRename = (plan: PilePlanData) => {
    onRename(plan.id, renameValue);
    setRenamingId(null);
  };

  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>, plan: PilePlanData) => {
    if (event.key === "Enter") finishRename(plan);
    if (event.key === "Escape") setRenamingId(null);
  };

  const confirmDelete = (plan: PilePlanData) => {
    if (window.confirm(t("projectExplorer.confirmDelete", { name: plan.name }))) {
      onDelete(plan.id);
    }
  };

  return (
    <aside className="project-explorer" aria-label={t("projectExplorer.aria")}>
      <div className="panel-heading">{t("explorer")}</div>
      <div className="project-tree">
        <section className="project-tree-section">
          <div className="project-tree-label">{t("projectExplorer.project")}</div>
          <div className="project-summary">
            <strong>{projectName}{isDirty ? " *" : ""}</strong>
            <small>IFCPP</small>
          </div>
        </section>

        <section className="project-tree-section pile-plan-tree" aria-label={t("projectExplorer.pilePlans")}>
          <div className="project-tree-label">{t("projectExplorer.pilePlans")}</div>
          <div className="pile-plan-list" role="listbox" aria-label={t("projectExplorer.pilePlans")}>
            {pilePlans.map((plan) => {
              const active = plan.id === activePilePlanId;
              const summary = costSummaries.get(plan.id) ?? { missingCount: 0, totalCost: 0 };
              return (
                <div className={`pile-plan-row${active ? " active" : ""}`} key={plan.id}>
                  {renamingId === plan.id ? (
                    <div className="pile-plan-select">
                      <input
                        aria-label={t("projectExplorer.rename")}
                        autoFocus
                        onBlur={() => finishRename(plan)}
                        onChange={(event) => setRenameValue(event.currentTarget.value)}
                        onKeyDown={(event) => handleRenameKey(event, plan)}
                        value={renameValue}
                      />
                    </div>
                  ) : (
                    <button
                      aria-selected={active}
                      className="pile-plan-select"
                      onClick={() => onActivate(plan.id)}
                      role="option"
                      type="button"
                    >
                      <strong>{plan.name}</strong>
                      <span className="pile-plan-meta">
                        {formatCurrency(summary.totalCost)}
                        {summary.missingCount > 0 ? (
                          <span className="pile-plan-warning" title={t("projectExplorer.missingCosts", { count: summary.missingCount })}>
                            <Icon kind="warning" /> {summary.missingCount}
                          </span>
                        ) : null}
                        {plan.lockedLoadPointIds.length > 0 ? (
                          <span>{t("projectExplorer.locked", { count: plan.lockedLoadPointIds.length })}</span>
                        ) : null}
                      </span>
                    </button>
                  )}
                  <div className="pile-plan-actions">
                    <ActionButton label={t("projectExplorer.rename")} kind="edit" onClick={() => startRename(plan)} />
                    <ActionButton label={t("projectExplorer.duplicate")} kind="copy" onClick={() => onDuplicate(plan.id)} />
                    <ActionButton
                      disabled={pilePlans.length === 1}
                      label={t("projectExplorer.delete")}
                      kind="delete"
                      onClick={() => confirmDelete(plan)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button className="new-pile-plan" disabled={creating || createDisabled} onClick={onCreate} type="button">
            <Icon kind="plus" />
            <span>{creating ? t("projectExplorer.creating") : t("projectExplorer.newPilePlan")}</span>
          </button>
        </section>
      </div>
    </aside>
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
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon kind={kind} />
    </button>
  );
}

function Icon({ kind }: { kind: "edit" | "copy" | "delete" | "plus" | "warning" }) {
  if (kind === "edit") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
  if (kind === "copy") return <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="13" rx="2" width="13" x="9" y="9"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  if (kind === "delete") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>;
  if (kind === "warning") return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 2 21h20Z"/><path d="M12 9v5"/><path d="M12 18h.01"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>;
}
