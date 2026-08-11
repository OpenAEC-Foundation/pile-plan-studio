import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../template/Modal.tsx";
import ThemedSelect from "../template/ThemedSelect.tsx";
import "../template/ThemedSelect.css";
import { normalizePileHeadLevel, normalizeProjectName } from "./projectInformationModel.ts";

const CURRENCY_OPTIONS = ["EUR", "GBP", "USD"].map((currency) => ({ value: currency, label: currency }));

type Props = {
  open: boolean;
  projectName: string;
  pileHeadLevelM: number | null;
  currencyCode: string;
  onClose: () => void;
  onSave: (project: { projectName: string; pileHeadLevelM: number; currencyCode: string }) => void;
};

export default function ProjectInformationDialog({ open, projectName, pileHeadLevelM, currencyCode, onClose, onSave }: Props) {
  const { t } = useTranslation("common");
  const [nameDraft, setNameDraft] = useState(projectName);
  const [pileHeadLevelDraft, setPileHeadLevelDraft] = useState(pileHeadLevelM?.toString() ?? "");
  const [currencyDraft, setCurrencyDraft] = useState(currencyCode);
  const normalizedName = normalizeProjectName(nameDraft);
  const normalizedPileHeadLevel = normalizePileHeadLevel(pileHeadLevelDraft);

  useEffect(() => {
    if (!open) return;
    setNameDraft(projectName);
    setPileHeadLevelDraft(pileHeadLevelM?.toString() ?? "");
    setCurrencyDraft(currencyCode);
  }, [currencyCode, open, pileHeadLevelM, projectName]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("projectInformation.title")}
      width={480}
      footer={(
        <>
          <button className="settings-btn settings-btn-secondary" type="button" onClick={onClose}>{t("cancel")}</button>
          <button
            className="settings-btn settings-btn-primary"
            disabled={normalizedName === null || normalizedPileHeadLevel === null}
            type="button"
            onClick={() => {
              if (normalizedName === null || normalizedPileHeadLevel === null) return;
              onSave({
                projectName: normalizedName,
                pileHeadLevelM: normalizedPileHeadLevel,
                currencyCode: currencyDraft,
              });
              onClose();
            }}
          >{t("save")}</button>
        </>
      )}
    >
      <div className="project-information-form">
        <label>
          <span>{t("projectInformation.projectName")}</span>
          <input
            id="project-name"
            autoFocus
            value={nameDraft}
            onChange={(event) => setNameDraft(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>{t("projectInformation.pileHeadLevel")}</span>
          <input
            inputMode="decimal"
            value={pileHeadLevelDraft}
            onChange={(event) => setPileHeadLevelDraft(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>{t("projectInformation.currency")}</span>
          <ThemedSelect
            ariaLabel={t("projectInformation.currency")}
            className="project-currency-select"
            value={currencyDraft}
            options={CURRENCY_OPTIONS}
            onChange={setCurrencyDraft}
          />
        </label>
      </div>
    </Modal>
  );
}
