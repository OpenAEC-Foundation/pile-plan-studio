import { useTranslation } from "react-i18next";
import Modal from "../template/Modal.tsx";

type Props = {
  open: boolean;
  isDesktop: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
};

export default function UnsavedChangesDialog({ open, isDesktop, onSave, onDiscard, onCancel }: Props) {
  const { t } = useTranslation("common");
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t("unsaved.title")}
      width={440}
      footer={(
        <>
          <button className="settings-btn settings-btn-secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
          <button className="settings-btn settings-btn-secondary" type="button" onClick={onDiscard}>{t("unsaved.discard")}</button>
          <button className="settings-btn settings-btn-primary" type="button" onClick={onSave}>
            {isDesktop ? t("unsaved.saveAndContinue") : t("unsaved.downloadAndContinue")}
          </button>
        </>
      )}
    >
      <p>{isDesktop ? t("unsaved.desktopMessage") : t("unsaved.browserMessage")}</p>
    </Modal>
  );
}
