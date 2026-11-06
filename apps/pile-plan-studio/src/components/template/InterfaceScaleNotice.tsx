import { useCallback, useEffect, useRef, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../openaec/react/src/index";
import "../../openaec/openaec-components.css";
import "./InterfaceScaleNotice.css";

export type InterfaceScaleNoticeValue = {
  id: number;
  percent: number;
};

type Props = {
  notice: InterfaceScaleNoticeValue | null;
  onExpire: (id: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
};

export default function InterfaceScaleNotice({
  notice,
  onExpire,
  onDecrease,
  onIncrease,
  onReset,
}: Props) {
  const { t } = useTranslation();
  const timeoutRef = useRef<number | null>(null);

  const pauseExpiry = useCallback(() => {
    if (timeoutRef.current === null) return;
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const scheduleExpiry = useCallback(() => {
    pauseExpiry();
    if (notice === null) return;
    timeoutRef.current = window.setTimeout(() => onExpire(notice.id), 2000);
  }, [notice, onExpire, pauseExpiry]);

  useEffect(() => {
    scheduleExpiry();
    return pauseExpiry;
  }, [pauseExpiry, scheduleExpiry]);

  if (notice === null) return null;

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) scheduleExpiry();
  };

  return (
    <div
      className="oa-app interface-scale-notice"
      onBlurCapture={handleBlur}
      onFocusCapture={pauseExpiry}
      onPointerEnter={pauseExpiry}
      onPointerLeave={scheduleExpiry}
    >
      <span aria-live="polite" className="interface-scale-value" role="status">
        {notice.percent}%
      </span>
      <Button kind="quiet"
        aria-label={`${t("zoom")} -`}
        className="interface-scale-icon-button"
        onClick={onDecrease}
        data-tooltip={`${t("zoom")} -`}
        type="button"
      >
        &minus;
      </Button>
      <Button kind="quiet"
        aria-label={`${t("zoom")} +`}
        className="interface-scale-icon-button"
        onClick={onIncrease}
        data-tooltip={`${t("zoom")} +`}
        type="button"
      >
        +
      </Button>
      <Button kind="quiet"
        className="interface-scale-reset-button"
        onClick={onReset}
        type="button"
      >
        {t("reset")}
      </Button>
    </div>
  );
}
