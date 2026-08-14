import { useEffect } from "react";
import "./InterfaceScaleNotice.css";

export type InterfaceScaleNoticeValue = {
  id: number;
  percent: number;
};

type Props = {
  notice: InterfaceScaleNoticeValue | null;
  onExpire: (id: number) => void;
};

export default function InterfaceScaleNotice({ notice, onExpire }: Props) {
  useEffect(() => {
    if (notice === null) return;
    const timeoutId = window.setTimeout(() => onExpire(notice.id), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [notice, onExpire]);

  if (notice === null) return null;

  return (
    <div
      aria-live="polite"
      className="interface-scale-notice"
      role="status"
    >
      {notice.percent}%
    </div>
  );
}
