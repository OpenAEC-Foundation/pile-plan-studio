import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Dialog, Heading, IconButton, OpenAECProvider, Radio, TextArea, TextField } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import {
  FeedbackError, FEEDBACK_IMAGE_TYPES, MAX_FEEDBACK_IMAGES, MAX_FEEDBACK_LENGTH, MIN_FEEDBACK_LENGTH,
  submitFeedback, validateFeedbackImages, type FeedbackCategory, type FeedbackErrorCode,
} from "../../../app/feedback/feedbackClient.ts";
import { captureFeedbackScreenshot, getFeedbackEnvironment, openFeedbackIssue } from "../../../app/feedback/feedbackEnvironment.ts";
import "../../../openaec/openaec-components.css";
import "./FeedbackDialog.css";

const CATEGORIES: FeedbackCategory[] = ["general", "bug", "feature"];
type Attachment = { id: string; file: File; preview: string };
type Props = { open: boolean; onClose: () => void };

export default function FeedbackDialog({ open, onClose }: Props) {
  return open ? <FeedbackForm onClose={onClose} /> : null;
}

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("feedback"), { t: common } = useTranslation("common");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentRef = useRef<Attachment[]>([]), fileInputRef = useRef<HTMLInputElement>(null);
  const [environment, setEnvironment] = useState({ appVersion: __APP_VERSION__, osInfo: navigator.platform || t("unknownSystem") });
  const [submitting, setSubmitting] = useState(false), [capturing, setCapturing] = useState(false);
  const pending = useRef(false), mounted = useRef(true);
  const [receipt, setReceipt] = useState<{ issueUrl: string | null } | null>(null);
  const [error, setError] = useState<FeedbackErrorCode | null>(null);
  const busy = submitting || capturing;
  useLayoutEffect(() => {
    const opener = document.activeElement;
    // Removing the dialog discards the draft, but skips the native close focus restoration.
    return () => queueMicrotask(() => {
      if (opener instanceof HTMLElement && opener.isConnected && document.activeElement === document.body) opener.focus();
    });
  }, []);
  useEffect(() => {
    mounted.current = true;
    void getFeedbackEnvironment().then(value => { if (mounted.current) setEnvironment(value); });
    return () => { mounted.current = false; attachmentRef.current.forEach(item => URL.revokeObjectURL(item.preview)); };
  }, []);

  function addImages(files: File[]) {
    try {
      validateFeedbackImages([...attachmentRef.current.map(item => item.file), ...files]);
      const added = files.map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }));
      attachmentRef.current = [...attachmentRef.current, ...added];
      setAttachments(attachmentRef.current); setError(null);
    } catch (problem) { setError(problem instanceof FeedbackError ? problem.code : "errorGeneric"); }
  }
  function removeImage(id: string) {
    const item = attachmentRef.current.find(item => item.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    attachmentRef.current = attachmentRef.current.filter(item => item.id !== id);
    setAttachments(attachmentRef.current); setError(null);
  }
  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === "file" && item.type.startsWith("image/"))
      .map(item => item.getAsFile()).filter((file): file is File => file !== null);
    if (files.length) { event.preventDefault(); addImages(files); }
  }
  async function capture() {
    if (busy) return;
    setCapturing(true); setError(null);
    try { const file = await captureFeedbackScreenshot(); if (mounted.current) addImages([file]); }
    catch (problem) { if (mounted.current) setError(problem instanceof FeedbackError ? problem.code : "errorScreenshot"); }
    finally { if (mounted.current) setCapturing(false); }
  }
  async function send() {
    if (pending.current || capturing || message.trim().length < MIN_FEEDBACK_LENGTH) return;
    pending.current = true; setSubmitting(true); setError(null);
    try {
      const result = await submitFeedback({ message, category, fullname: fullName, email, ...environment,
        images: attachmentRef.current.map(item => item.file) });
      if (mounted.current) setReceipt(result);
    } catch (problem) { if (mounted.current) setError(problem instanceof FeedbackError ? problem.code : "errorGeneric"); }
    finally { pending.current = false; if (mounted.current) setSubmitting(false); }
  }
  function close() { if (!pending.current && !capturing) onClose(); }
  function again() {
    attachmentRef.current.forEach(item => URL.revokeObjectURL(item.preview));
    attachmentRef.current = []; setAttachments([]); setFullName(""); setEmail(""); setCategory("general");
    setMessage(""); setReceipt(null); setError(null);
  }
  const canSend = message.trim().length >= MIN_FEEDBACK_LENGTH && !busy;
  return <OpenAECProvider sprite={spriteUrl}>
    <div className="oa-app feedback-blueprint" onKeyDown={event => event.stopPropagation()}>
      <Dialog open title={t("title")} onClose={close} actions={receipt ? <>
        <Button onClick={again}>{t("sendAnother")}</Button>
        <Button kind="primary" onClick={close}>{common("close")}</Button>
      </> : <>
        <Button disabled={busy} onClick={close}>{common("cancel")}</Button>
        <Button kind="primary" disabled={!canSend} onClick={() => void send()}>{t(submitting ? "submitting" : "submit")}</Button>
      </>}>
        <IconButton icon="ui.close" label={common("close")} className="feedback-close" disabled={busy} onClick={close} />
        <div className="feedback-content" aria-busy={busy}>
          {receipt ? <div className="feedback-success" role="status">
            <Heading>{t("successTitle")}</Heading>
            <p>{t(receipt.issueUrl ? "issueCreated" : "storedMessage")}</p>
            {receipt.issueUrl && <Button onClick={() => void openFeedbackIssue(receipt.issueUrl!).catch(() => setError("errorOpenIssue"))}>{t("viewIssue")}</Button>}
          </div> : <>
            <Banner tone="info" word="">{t("publicNotice")}</Banner>
            <fieldset className="feedback-category-group" disabled={busy}>
              <legend>{t("category")}</legend>
              <div className="feedback-categories">{CATEGORIES.map(value => <Radio key={value} name="feedback-category" label={t("category" + value[0].toUpperCase() + value.slice(1))}
                value={value} checked={category === value} onChange={() => setCategory(value)} />)}</div>
            </fieldset>
            <TextArea label={t("message")} placeholder={t("messagePlaceholder")} help={t("messageHelp")} rows={5}
              maxLength={MAX_FEEDBACK_LENGTH} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} onPaste={pasteImages} />
            <div className="feedback-char-count">{message.length}/{MAX_FEEDBACK_LENGTH}</div>
            <div className="feedback-reporter">
              <TextField label={t("fullName")} value={fullName} maxLength={200} autoComplete="name" disabled={busy} onChange={event => setFullName(event.target.value)} />
              <TextField label={t("email")} value={email} maxLength={254} type="email" autoComplete="email" disabled={busy} onChange={event => setEmail(event.target.value)} />
            </div>
            <p className="feedback-hint">{t("contactHint")}</p>
            <div className="feedback-attachment-actions">
              <Button disabled={busy || attachments.length >= MAX_FEEDBACK_IMAGES} onClick={() => fileInputRef.current?.click()}>{t("attachImages")}</Button>
              <Button disabled={busy || attachments.length >= MAX_FEEDBACK_IMAGES} onClick={() => void capture()}>{t(capturing ? "capturing" : "captureScreenshot")}</Button>
              <input ref={fileInputRef} hidden tabIndex={-1} aria-label={t("attachImages")} type="file" multiple accept={FEEDBACK_IMAGE_TYPES.join(",")}
                disabled={busy} onChange={event => { addImages(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
            </div>
            <p className="feedback-hint">{t("imageLimit")}</p>
            {attachments.length > 0 && <div className="feedback-previews">{attachments.map((item, index) => <div className="feedback-preview" key={item.id}>
              <img src={item.preview} alt={t("imagePreview", { number: index + 1, name: item.file.name })} />
              <IconButton small icon="ui.close" label={t("removeImage", { number: index + 1 })} disabled={busy} onClick={() => removeImage(item.id)} />
            </div>)}</div>}
            <p className="feedback-hint">{t("environment", environment)}</p>
          </>}
          {error && <Banner tone="error" word="">{t(error)}</Banner>}
        </div>
      </Dialog>
    </div>
  </OpenAECProvider>;
}
