import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, IconButton, OpenAECProvider, Select, TextField } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./ProjectInformationDialog.css";
import { normalizePileHeadLevel, normalizeProjectName } from "./projectInformationModel.ts";
import { NumberField } from "../../template/NumberInput.tsx";

const CURRENCY_OPTIONS = ["EUR", "GBP", "USD"].map((currency) => ({ value: currency, label: currency }));

type Props = {
  open: boolean;
  projectName: string;
  pileHeadLevelM: number | null;
  currencyCode: string;
  onClose: () => void;
  onSave: (project: { projectName: string; pileHeadLevelM: number; currencyCode: string }) => Promise<boolean>;
};

export default function ProjectInformationDialog({ open, projectName, pileHeadLevelM, currencyCode, onClose, onSave }: Props) {
  const { t } = useTranslation("common");
  const [nameDraft, setNameDraft] = useState(projectName);
  const [pileHeadLevelDraft, setPileHeadLevelDraft] = useState(pileHeadLevelM?.toString() ?? "");
  const [currencyDraft, setCurrencyDraft] = useState(currencyCode);
  const [saving, setSaving] = useState(false);
  const [helpDismissed, setHelpDismissed] = useState(false);
  const referenceHelpId = useId();
  const normalizedName = normalizeProjectName(nameDraft);
  const normalizedPileHeadLevel = normalizePileHeadLevel(pileHeadLevelDraft);

  useEffect(() => {
    if (!open) return;
    setNameDraft(projectName);
    setPileHeadLevelDraft(pileHeadLevelM?.toString() ?? "");
    setCurrencyDraft(currencyCode);
    setHelpDismissed(false);
  }, [currencyCode, open, pileHeadLevelM, projectName]);

  return (
    <OpenAECProvider sprite={spriteUrl}>
      {/* Native modal keys, including Escape cancellation, stay out of the viewer. */}
      <div className="oa-app project-information-blueprint" onKeyDown={event => event.stopPropagation()}>
        <Dialog open={open} onClose={onClose} title={t("projectInformation.title")} actions={(
          <>
            <Button onClick={onClose}>{t("cancel")}</Button>
            <Button kind="primary"
              disabled={saving || normalizedName === null || normalizedPileHeadLevel === null}
              onClick={() => void (async () => {
                if (normalizedName === null || normalizedPileHeadLevel === null) return;
                setSaving(true);
                try {
                  const saved = await onSave({
                    projectName: normalizedName,
                    pileHeadLevelM: normalizedPileHeadLevel,
                    currencyCode: currencyDraft,
                  });
                  if (saved) onClose();
                } finally {
                  setSaving(false);
                }
              })()}>{t("save")}</Button>
          </>
        )}>
          <IconButton icon="ui.close" label={t("close")} className="project-information-close" onClick={onClose} />
          <div className="project-information-form">
            <TextField id="project-name" label={t("projectInformation.projectName")} autoFocus
              value={nameDraft} onChange={event => setNameDraft(event.currentTarget.value)} />
            <div className="project-information-reference">
              <NumberField label={t("projectInformation.pileHeadLevel")} type="text" inputMode="decimal" step={0.1}
                aria-describedby={referenceHelpId}
                value={pileHeadLevelDraft} onValueChange={setPileHeadLevelDraft} />
              <IconButton small icon="ui.about" label={t("projectInformation.pileHeadLevelInfo")}
                className="project-information-help-button" aria-describedby={referenceHelpId}
                data-oa-tip={t("projectInformation.pileHeadLevelHelp")}
                data-oa-tip-hidden={helpDismissed ? "" : undefined}
                onFocus={() => setHelpDismissed(false)} onMouseEnter={() => setHelpDismissed(false)}
                onKeyDown={event => {
                  if (event.key === "Escape" && !helpDismissed) {
                    event.preventDefault();
                    setHelpDismissed(true);
                  }
                }} />
              <span id={referenceHelpId} hidden>{t("projectInformation.pileHeadLevelHelp")}</span>
            </div>
            <Select label={t("projectInformation.currency")} value={currencyDraft} options={CURRENCY_OPTIONS}
              onChange={event => setCurrencyDraft(event.currentTarget.value)} />
          </div>
        </Dialog>
      </div>
    </OpenAECProvider>
  );
}
