import { useTranslation } from "react-i18next";
import "./StatusBar.css";

type Props = {
  totalCost: number;
  missingCostCount: number;
  zoomPercent: number;
};

export default function StatusBar({ totalCost, missingCostCount, zoomPercent }: Props) {
  const { t, i18n } = useTranslation();
  const formattedCost = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(totalCost);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-item-label">{t("totalCost")}:</span>
          <span className="status-item-value">{formattedCost}</span>
        </div>
        {missingCostCount > 0 ? <span className="status-warning">{t("withoutCosts", { count: missingCostCount })}</span> : null}
      </div>

      <div className="status-bar-center">
        <span className="status-item-label" style={{ fontSize: "11px" }}>
          {t("version")}
        </span>
      </div>

      <div className="status-bar-right">
        <div className="status-item">
          <span className="status-item-label">{t("zoom")}:</span>
          <span className="status-item-value">{Math.round(zoomPercent)}%</span>
        </div>
      </div>
    </div>
  );
}
