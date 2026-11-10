import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Dialog, OpenAECProvider, TextField } from "../../openaec/react/src/index";
import spriteUrl from "../../openaec/studioSprite.ts";

export default function DocsSaveAsDialog({ suggestedName, onClose, onSave }: {
  suggestedName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(suggestedName);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmed = name.trim();
  const valid = trimmed.length > 0 && !/[\\/]/.test(trimmed) && trimmed.toLowerCase() !== ".ifcpp";
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setFailed(false);
    const fileName = trimmed.toLowerCase().endsWith(".ifcpp") ? trimmed : trimmed + ".ifcpp";
    try { await onSave(fileName); }
    catch { setFailed(true); }
    finally { setSaving(false); }
  };

  return <OpenAECProvider sprite={spriteUrl}>
    <div className="oa-app">
    <Dialog open title={t("supercloud.saveAs")} onClose={() => { if (!saving) onClose(); }} actions={<>
      <Button disabled={saving} onClick={onClose}>{t("cancel")}</Button>
      <Button kind="primary" disabled={!valid || saving} onClick={() => void save()}>{t("save")}</Button>
    </>}>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <TextField label={t("supercloud.fileName")} value={name}
          onChange={event => setName(event.currentTarget.value)} disabled={saving} />
      </form>
      {failed && <Banner tone="error" word="">{t("supercloud.saveFailed")}</Banner>}
    </Dialog>
    </div>
  </OpenAECProvider>;
}
