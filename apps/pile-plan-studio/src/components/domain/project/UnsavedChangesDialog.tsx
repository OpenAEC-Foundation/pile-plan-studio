import { useTranslation } from "react-i18next";
import { Banner, Button, Dialog, IconButton, OpenAECProvider } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./UnsavedChangesDialog.css";

type Props = {
  open: boolean;
  isDesktop: boolean;
  isPlatform?: boolean;
  saving?: boolean;
  saveError?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export default function UnsavedChangesDialog({ open, isDesktop, isPlatform = false, saving = false, saveError, onSave, onDiscard, onCancel }: Props) {
  const { t } = useTranslation("common");
  return (
    <OpenAECProvider sprite={spriteUrl}>
      <div className="oa-app unsaved-changes-blueprint" onKeyDown={event => event.stopPropagation()}>
        <Dialog open={open} onClose={() => { if (!saving) onCancel(); }} title={t("unsaved.title")} actions={(
          <>
            <Button disabled={saving} onClick={onCancel}>{t("cancel")}</Button>
            <Button kind="danger" disabled={saving} onClick={onDiscard}>{t("unsaved.discard")}</Button>
            <Button kind="primary" disabled={saving} aria-busy={saving} onClick={onSave}>
              {isDesktop || isPlatform ? t("unsaved.saveAndContinue") : t("unsaved.localSaveAndContinue")}
            </Button>
          </>
        )}>
          <IconButton icon="ui.close" label={t("close")} className="unsaved-changes-close" disabled={saving} onClick={onCancel} />
          <p className="unsaved-changes-message">{isPlatform ? t("supercloud.unsaved") : isDesktop ? t("unsaved.desktopMessage") : t("unsaved.browserMessage")}</p>
          {saveError && <Banner tone="error" word="">{saveError}</Banner>}
        </Dialog>
      </div>
    </OpenAECProvider>
  );
}
