import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, changeLanguage } from "../../../i18n/config";
import { PRODUCT_INFO } from "../../../productInfo.ts";
import type { UserLanguage } from "../../../domain/settings/userSettings.ts";
import type { McpConnection } from "../../../app/mcp/desktopBridge.ts";
import { applyTheme } from "../../../app/appearance/applyAppearance.ts";
import type { WorkspaceAppearance } from "../../../domain/settings/appearance.ts";
import {
  DEFAULT_INTERFACE_SCALE,
  INTERFACE_SCALE_STEP,
  MAX_INTERFACE_SCALE,
  MIN_INTERFACE_SCALE,
  normalizeInterfaceScale,
} from "../../../domain/settings/interfaceScale.ts";
import { Button, Checkbox, Dialog, Heading, IconButton, OpenAECProvider, Select, Slider, Tabs } from "../../../openaec/react/src/index";
import spriteUrl from "../../../openaec/studioSprite.ts";
import "../../../openaec/openaec-components.css";
import "./SettingsDialog.css";

const THEME_OPTIONS = [
  { value: "light",     labelKey: "appearance.light" },
  { value: "dark",      labelKey: "appearance.dark" },
  { value: "blueprint", labelKey: "appearance.blueprint" },
  { value: "high-contrast-dark", labelKey: "appearance.contrastDark" },
  { value: "high-contrast-light", labelKey: "appearance.contrastLight" },
];

const TAB_IDS = ["general", "appearance", "about"] as const;
const CURRENCY_OPTIONS = ["EUR", "GBP", "USD"];

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: string;
  workspaceAppearance: WorkspaceAppearance;
  language: UserLanguage;
  defaultCurrencyCode: string;
  onPreferencesChange: (preferences: {
    theme: string;
    workspaceAppearance: WorkspaceAppearance;
    language: UserLanguage;
    interfaceScalePercent: number;
    defaultCurrencyCode: string;
  }) => void;
  isDesktop: boolean;
  projectAvailable?: boolean;
  siteAssistant?: boolean;
  siteAssistantReadOnly?: boolean;
  interfaceScalePercent: number;
  onInterfaceScalePreview: (scalePercent: number) => void;
  mcpStatus: "off" | "starting" | "on" | "stopping" | "error";
  mcpConnection: McpConnection | null;
  mcpError: string | null;
  onMcpToggle: (enabled: boolean) => void;
  mcpWriteEnabled: boolean;
  onMcpWriteToggle: (enabled: boolean) => void;
}

export default function SettingsDialog({
  open,
  onClose,
  theme,
  workspaceAppearance,
  language,
  defaultCurrencyCode,
  onPreferencesChange,
  isDesktop,
  projectAvailable = true,
  siteAssistant,
  siteAssistantReadOnly,
  interfaceScalePercent,
  onInterfaceScalePreview,
  mcpStatus,
  mcpConnection,
  mcpError,
  onMcpToggle,
  mcpWriteEnabled,
  onMcpWriteToggle,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const [activeTab, setActiveTab] = useState("general");

  // Draft state — only committed on Save
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftWorkspace, setDraftWorkspace] = useState(workspaceAppearance);
  const [draftLang, setDraftLang] = useState<UserLanguage>(language);
  const [draftCurrencyCode, setDraftCurrencyCode] = useState(defaultCurrencyCode);
  const [draftInterfaceScale, setDraftInterfaceScale] = useState(interfaceScalePercent);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Snapshot of original values when dialog opens, for reverting on Cancel
  const originalTheme = useRef(theme);
  const originalWorkspace = useRef(workspaceAppearance);
  const originalLang = useRef<UserLanguage>(language);
  const originalInterfaceScale = useRef(interfaceScalePercent);

  // Reset draft to current values when dialog opens
  useEffect(() => {
    if (open) {
      originalTheme.current = theme;
      setDraftTheme(theme);
      originalWorkspace.current = workspaceAppearance;
      setDraftWorkspace(workspaceAppearance);
      originalLang.current = language;
      setDraftLang(language);
      setDraftCurrencyCode(defaultCurrencyCode);
      originalInterfaceScale.current = interfaceScalePercent;
      setDraftInterfaceScale(interfaceScalePercent);
    }
  }, [defaultCurrencyCode, interfaceScalePercent, language, open, theme, workspaceAppearance]);

  // Live theme preview — apply immediately when the user picks one in the dropdown.
  // Saved only on Save; reverted on Cancel.
  const handleThemePreview = (value: string) => {
    setDraftTheme(value);
    applyTheme(value, draftWorkspace);
  };

  const handleWorkspacePreview = (value: WorkspaceAppearance) => {
    setDraftWorkspace(value);
    applyTheme(draftTheme, value);
  };

  // Live language preview — switch i18n immediately on selection.
  const handleLangPreview = (value: string) => {
    if (value !== "auto" && value !== "en" && value !== "nl") return;
    setDraftLang(value);
    changeLanguage(value);
  };

  const handleInterfaceScalePreview = (value: number) => {
    const normalized = normalizeInterfaceScale(value);
    setDraftInterfaceScale(normalized);
    onInterfaceScalePreview(normalized);
  };

  // Cancel — discard all draft changes, revert live preview
  const handleCancel = () => {
    setDraftTheme(originalTheme.current);
    setDraftWorkspace(originalWorkspace.current);
    applyTheme(originalTheme.current, originalWorkspace.current);
    setDraftLang(originalLang.current);
    changeLanguage(originalLang.current);
    onInterfaceScalePreview(originalInterfaceScale.current);
    onClose();
  };

  // Save — commit all draft changes
  const handleSave = () => {
    applyTheme(draftTheme, draftWorkspace);
    changeLanguage(draftLang);
    onPreferencesChange({
      theme: draftTheme,
      workspaceAppearance: draftWorkspace,
      language: draftLang,
      interfaceScalePercent: draftInterfaceScale,
      defaultCurrencyCode: draftCurrencyCode,
    });

    onClose();
  };

  // Reset to defaults — resets draft values (still requires Save to apply)
  const handleReset = () => {
    setConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setDraftTheme("light");
    setDraftWorkspace("theme");
    applyTheme("light", "theme");
    setDraftLang("auto");
    changeLanguage("auto");
    setDraftCurrencyCode("EUR");
    setDraftInterfaceScale(DEFAULT_INTERFACE_SCALE);
    onInterfaceScalePreview(DEFAULT_INTERFACE_SCALE);
    setConfirmResetOpen(false);
  };

  const footer = (
    <>
      <Button className="settings-reset-action" onClick={handleReset}>
        {t("resetToDefaults")}
      </Button>
      <div className="settings-footer-right">
        <Button onClick={handleCancel}>
          {tCommon("cancel")}
        </Button>
        <Button kind="primary" onClick={handleSave}>
          {tCommon("save")}
        </Button>
      </div>
    </>
  );

  return (
    <OpenAECProvider sprite={spriteUrl}>
      {/* Keep modal keys away from workspace shortcuts; preserve native defaults,
          including Escape dispatching the Blueprint Dialog's cancel event. */}
      <div className="oa-app settings-blueprint" onKeyDown={event => event.stopPropagation()}>
        <Dialog open={open} onClose={handleCancel} title={t("title")} actions={footer}>
          <IconButton icon="ui.close" label={tCommon("close")} className="settings-close" onClick={handleCancel} />
          <Tabs label={t("title")} tabs={TAB_IDS.map(id => ({ id, label: t(`tabs.${id}`) }))}
            active={activeTab} onSelect={setActiveTab} />
          <div className="settings-content" role="tabpanel" aria-label={t(`tabs.${activeTab}`)}>
            {activeTab === "general" && (<>
              <GeneralTabContent
                lang={draftLang}
                onLangChange={handleLangPreview}
                defaultCurrencyCode={draftCurrencyCode}
                onDefaultCurrencyCodeChange={setDraftCurrencyCode}
              />
              {siteAssistant && <div className="settings-section settings-mcp-section">
                <Heading>{tCommon("supercloud.assistant")}</Heading>
                <Checkbox label={t("mcp.allowEdits")} checked={mcpWriteEnabled} disabled={siteAssistantReadOnly}
                  onChange={event => onMcpWriteToggle(event.currentTarget.checked)} />
              </div>}
              {isDesktop && projectAvailable && <McpConnectionSection
                status={mcpStatus}
                connection={mcpConnection}
                error={mcpError}
                onToggle={onMcpToggle}
                writeEnabled={mcpWriteEnabled}
                onWriteToggle={onMcpWriteToggle}
              />}
            </>)}
            {activeTab === "appearance" && (
              <AppearanceTabContent
                theme={draftTheme}
                workspaceAppearance={draftWorkspace}
                onWorkspaceSelect={handleWorkspacePreview}
                onThemeSelect={handleThemePreview}
                isDesktop={isDesktop}
                interfaceScalePercent={draftInterfaceScale}
                onInterfaceScalePreview={handleInterfaceScalePreview}
              />
            )}
            {activeTab === "about" && <AboutTabContent />}
          </div>
        </Dialog>
      </div>

      <div className="oa-app settings-reset" onKeyDown={event => event.stopPropagation()}>
        <Dialog
          open={open && confirmResetOpen}
          onClose={() => setConfirmResetOpen(false)}
          title={t("resetToDefaults")}
          actions={
            <>
              <Button onClick={() => setConfirmResetOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button kind="primary" onClick={handleConfirmReset}>
                {t("resetToDefaults")}
              </Button>
            </>
          }
        >
          <p>{t("resetConfirm")}</p>
        </Dialog>
      </div>
    </OpenAECProvider>
  );
}

function McpConnectionSection({ status, connection, error, onToggle, writeEnabled, onWriteToggle }: {
  status: SettingsDialogProps["mcpStatus"];
  connection: McpConnection | null;
  error: string | null;
  onToggle: (enabled: boolean) => void;
  writeEnabled: boolean;
  onWriteToggle: (enabled: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const [copyError, setCopyError] = useState(false);
  const copy = async (value: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(value);
      setCopyError(false);
    } catch { setCopyError(true); }
  };
  return (
    <div className="settings-section settings-mcp-section">
      <Heading>{t("mcp.title")}</Heading>
      <p className="settings-description">{t("mcp.description")}</p>
      <Checkbox label={t("mcp.enable")} checked={status === "on" || status === "starting"}
          disabled={status === "starting" || status === "stopping"}
          onChange={(event) => onToggle(event.currentTarget.checked)} />
      <Checkbox label={t("mcp.allowEdits")} checked={writeEnabled} disabled={status !== "on"}
          onChange={(event) => onWriteToggle(event.currentTarget.checked)} />
      <div className="settings-mcp-status" role="status">{t(`mcp.status_${status}`)}</div>
      {connection && status === "on" && <>
        <div className="settings-mcp-connection">
          <span>{t("mcp.endpoint")}</span>
          <code>{connection.endpoint}</code>
          <Button compact onClick={() => void copy(connection.endpoint)}>{t("mcp.copyEndpoint")}</Button>
        </div>
        <div className="settings-mcp-token-action">
          <Button compact onClick={() => void copy(connection.token)}>{t("mcp.copyToken")}</Button>
        </div>
      </>}
      {error && status === "error" && <p className="settings-mcp-error">{t("mcp.connectionError")}: {error}</p>}
      {copyError && <p className="settings-mcp-error">{t("mcp.copyError")}</p>}
    </div>
  );
}

function GeneralTabContent({
  lang,
  onLangChange,
  defaultCurrencyCode,
  onDefaultCurrencyCodeChange,
}: {
  lang: string;
  onLangChange: (value: string) => void;
  defaultCurrencyCode: string;
  onDefaultCurrencyCodeChange: (value: string) => void;
}) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-section">
      <Heading>{t("general.application")}</Heading>
      <div className="settings-row">
        <Select label={t("general.language")}
          value={lang}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
          onChange={event => onLangChange(event.currentTarget.value)}
        />
      </div>
      <div className="settings-row">
        <Select label={t("general.defaultCurrency")}
          value={defaultCurrencyCode}
          options={CURRENCY_OPTIONS.map((currency) => ({ value: currency, label: currency }))}
          onChange={event => onDefaultCurrencyCodeChange(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}

function AppearanceTabContent({
  theme,
  workspaceAppearance,
  onWorkspaceSelect,
  onThemeSelect,
  isDesktop,
  interfaceScalePercent,
  onInterfaceScalePreview,
}: {
  theme: string;
  workspaceAppearance: WorkspaceAppearance;
  onWorkspaceSelect: (value: WorkspaceAppearance) => void;
  onThemeSelect: (value: string) => void;
  isDesktop: boolean;
  interfaceScalePercent: number;
  onInterfaceScalePreview: (value: number) => void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-section">
      <Heading>{t("tabs.appearance")}</Heading>
      <div className="settings-row">
        <Select label={t("appearance.theme")} value={theme}
          options={THEME_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
          onChange={event => onThemeSelect(event.currentTarget.value)} />
      </div>
      <div className="settings-row">
        <Select label={t("appearance.planBackground")}
          value={workspaceAppearance}
          options={[
            { value: "theme", label: t("appearance.followTheme") },
            { value: "light", label: t("appearance.light") },
            { value: "dark", label: t("appearance.dark") },
          ]}
          onChange={event => onWorkspaceSelect(event.currentTarget.value as WorkspaceAppearance)}
        />
      </div>
      {isDesktop && (
        <div className="settings-interface-scale">
          <div className="settings-interface-scale-heading">
            <span>{t("appearance.interfaceScale")}</span>
            <output>{interfaceScalePercent}%</output>
          </div>
          <Slider
            min={MIN_INTERFACE_SCALE}
            max={MAX_INTERFACE_SCALE}
            step={INTERFACE_SCALE_STEP}
            value={interfaceScalePercent}
            label={t("appearance.interfaceScale")}
            onChange={(event) => onInterfaceScalePreview(Number(event.currentTarget.value))}
          />
          <p>{t("appearance.interfaceScaleDescription")}</p>
        </div>
      )}
    </div>
  );
}

function AboutTabContent() {
  const { t } = useTranslation("settings");
  return (
    <div className="settings-section">
      <Heading>{PRODUCT_INFO.name}</Heading>
      <div className="settings-about">
        <p className="oa-secondary">
          {t("about.description")}
        </p>
        <p><strong>{t("about.version")}:</strong> {PRODUCT_INFO.version}</p>
        <p><strong>{t("about.status")}:</strong> {PRODUCT_INFO.status}</p>
        <p><strong>{t("about.organization")}:</strong> {PRODUCT_INFO.organization}</p>
        <p><strong>{t("about.license")}:</strong> {PRODUCT_INFO.license}</p>
      </div>
    </div>
  );
}
