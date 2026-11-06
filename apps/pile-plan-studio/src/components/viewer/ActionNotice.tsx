import { Banner, OpenAECProvider } from "../../openaec/react/src/index";
import spriteUrl from "../../openaec/studioSprite";
import "../../openaec/openaec-components.css";
import "./ActionNotice.css";

export type ActionNoticeTone = "neutral" | "error";

type Props = {
  message: string;
  noticeId: number;
  tone?: ActionNoticeTone;
};

export default function ActionNotice({ message, noticeId, tone = "neutral" }: Props) {
  return (
    <OpenAECProvider sprite={spriteUrl}><div className="action-notice-region">
      {message && (
        <div
          key={noticeId}
          className="action-notice"
          aria-atomic="true"
        >
          <Banner tone={tone === "error" ? "error" : "info"} word="">{message}</Banner>
        </div>
      )}
    </div></OpenAECProvider>
  );
}
