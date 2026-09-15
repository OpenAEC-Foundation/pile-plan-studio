import { useTranslation } from "react-i18next";
import type { LegendValuePlanUsageItem } from "../../../../domain/legendConflicts.ts";

export default function LegendPlanUsageSection({
  items,
  title,
}: {
  items: LegendValuePlanUsageItem[];
  title: string;
}) {
  const { t } = useTranslation("common");
  return (
    <span className="legend-editor-plan-info-section">
      <b>{title}</b>
      {items.map((item) => (
        <span className="legend-editor-plan-info-row" key={item.planId}>
          <span>{item.planName}</span>
          <span>{item.active ? t("legend.active") : t("legend.inactive")}</span>
          <span>{t("legend.assignedLocations", { count: item.assignmentCount })}</span>
        </span>
      ))}
    </span>
  );
}

