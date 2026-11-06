import { useRef } from "react";
import { Button } from "../../../openaec/react/src/index";
import "./sourceFileButton.css";

/** Shared action with a native file picker; repeated selection of one file works. */
export default function SourceFileButton({ label, pickerLabel = label, multiple = false, disabled = false, onFiles }: {
  label: string;
  pickerLabel?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <span className="source-file-picker project-import-file-picker">
    <Button icon="file.open" disabled={disabled} onClick={() => input.current?.click()}>{label}</Button>
    <input ref={input} className="project-import-native-file" type="file" accept=".csv,.xlsx"
      multiple={multiple} disabled={disabled} aria-label={pickerLabel} tabIndex={-1}
      onChange={event => {
        const files = [...event.currentTarget.files ?? []];
        event.currentTarget.value = "";
        if (files.length) onFiles(files);
      }} />
  </span>;
}
