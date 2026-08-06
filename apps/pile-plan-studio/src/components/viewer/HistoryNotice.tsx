import "./HistoryNotice.css";

type Props = {
  message: string;
  noticeId: number;
};

export default function HistoryNotice({ message, noticeId }: Props) {
  return (
    <div className="history-notice-region" aria-live="polite" aria-atomic="true">
      {message && (
        <div key={noticeId} className="history-notice" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
