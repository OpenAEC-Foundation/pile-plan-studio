import { useTranslation } from "react-i18next";
import "./StatusBar.css";

type Props = {
  zoomPercent: number;
  historyMessage?: string;
};

export default function StatusBar({ zoomPercent, historyMessage }: Props) {
  const { t } = useTranslation();
  return (
    <div className="status-bar">
      <div className="status-bar-left" aria-live="polite">
        {historyMessage && <span className="status-history-message">{historyMessage}</span>}
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
