import { useEffect, useState } from "react";
import Modal from "../template/Modal.tsx";
import { normalizeProjectName } from "./projectInformationModel.ts";

type Props = {
  open: boolean;
  projectName: string;
  onClose: () => void;
  onSave: (projectName: string) => void;
};

export default function ProjectInformationDialog({ open, projectName, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(projectName);
  const normalizedName = normalizeProjectName(draft);

  useEffect(() => {
    if (open) setDraft(projectName);
  }, [open, projectName]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Project information"
      width={420}
      footer={(
        <>
          <button className="settings-btn settings-btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button
            className="settings-btn settings-btn-primary"
            disabled={normalizedName === null}
            type="button"
            onClick={() => {
              if (normalizedName === null) return;
              onSave(normalizedName);
              onClose();
            }}
          >Save</button>
        </>
      )}
    >
      <div className="project-information-form">
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}
