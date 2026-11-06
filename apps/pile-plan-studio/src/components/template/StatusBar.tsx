import { useTranslation } from "react-i18next";
import { StatusBar as BlueprintStatusBar } from "../../openaec/react/src/index";
import "../../openaec/openaec-components.css";
import "./StatusBar.css";

type Props = { zoomPercent: number; message?: string };

export default function StatusBar({ zoomPercent, message }: Props) {
  const { t } = useTranslation();
  return <div className="oa-app status-bar">
    <BlueprintStatusBar message={<span className="status-message">{message}</span>} items={[
      <span className="status-bar-center" key="product">{t("version")}</span>,
      <span className="status-item" key="zoom">
        <span className="status-item-label">{t("zoom")}:</span>
        <span className="status-item-value">{Math.round(zoomPercent)}%</span>
      </span>,
    ]} />
  </div>;
}
