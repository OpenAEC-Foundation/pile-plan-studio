import "./ActionNotice.css";

export type ActionNoticeTone = "neutral" | "error";

type Props = {
  message: string;
  noticeId: number;
  tone?: ActionNoticeTone;
};

export default function ActionNotice({ message, noticeId, tone = "neutral" }: Props) {
  return (
    <div className="action-notice-region">
      {message && (
        <div
          key={noticeId}
          className={`action-notice${tone === "error" ? " is-error" : ""}`}
          role={tone === "error" ? "alert" : "status"}
          aria-live={tone === "error" ? "assertive" : "polite"}
          aria-atomic="true"
        >
          {message}
        </div>
      )}
    </div>
  );
}
