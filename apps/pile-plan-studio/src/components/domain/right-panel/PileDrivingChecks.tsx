import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PileDrivingCheck, PileDrivingCheckSettings, PileDrivingEnergyGroup, PileDrivingEnergyRange, PileDrivingNeighborhood } from "../../../core/pileDrivingCoreClient.ts";
import { Button, Heading, Status } from "../../../openaec/react/src/index";

type LimitKey = Exclude<keyof PileDrivingCheckSettings, "expected_energy">;
type Limit = { key: LimitKey; min?: number; step?: number; max?: number };
const PLAN_LIMITS: readonly Limit[] = [
  { key: "length_tolerance_mm" },
  { key: "level_tolerance_mm" },
];
const CALENDAR_LIMITS: readonly Limit[] = [
  { key: "minimum_end_blows", step: 1, max: 4294967295 },
  { key: "end_window_increments", min: 2, step: 2, max: 4294967294 },
  { key: "maximum_end_drop", step: 1, max: 4294967295 },
  { key: "neighborhood_tolerance_pct" },
];
const ENERGY_LIMITS: readonly Limit[] = [
  { key: "target_energy_tolerance_kj" },
  { key: "peer_energy_spread_kj" },
];

export function PileDrivingSettings({ settings, pileSizes, readOnly, onApply }: {
  settings: PileDrivingCheckSettings;
  pileSizes: number[];
  readOnly: boolean;
  onApply: (settings: PileDrivingCheckSettings) => void;
}) {
  const { t } = useTranslation("rightPanel", { keyPrefix: "pileDriving.checks" });
  const energy = new Map(settings.expected_energy.map(target => [target.pile_size_mm, target.energy_kj]));
  const sizes = [...new Set([...pileSizes, ...energy.keys()])].sort((a, b) => a - b);
  const renderLimit = ({ key, min = 0, step, max }: Limit) => <label key={key}>
    <span>{t(`limits.${key}`)}</span>
    <input className="oa-field oa-field--compact" name={key} type="number" readOnly={readOnly} required min={min}
      step={step ?? "any"} max={max} defaultValue={settings[key]} />
  </label>;
  return <details className="pile-driving-disclosure pile-driving-settings">
    <summary>{t("settings")}</summary>
    <form key={JSON.stringify(settings)} onSubmit={event => {
      event.preventDefault();
      if (readOnly) return;
      const fields = new FormData(event.currentTarget);
      const limits = { ...settings };
      for (const { key } of [...PLAN_LIMITS, ...CALENDAR_LIMITS, ...ENERGY_LIMITS]) limits[key] = Number(fields.get(key));
      limits.expected_energy = sizes.flatMap(size => {
        const value = fields.get(`energy-${size}`);
        return typeof value === "string" && value !== "" ? [{ pile_size_mm: size, energy_kj: Number(value) }] : [];
      });
      onApply(limits);
    }}>
      <fieldset>
        <legend>{t("planLimits")}</legend>
        {PLAN_LIMITS.map(renderLimit)}
      </fieldset>
      <fieldset>
        <legend>{t("calendarLimits")}</legend>
        {CALENDAR_LIMITS.map(renderLimit)}
      </fieldset>
      <fieldset>
        <legend>{t("energyLimits")}</legend>
        {sizes.map(size => <label key={size}>
          <span>{t("targetEnergy", { size })}</span>
          <input className="oa-field oa-field--compact" name={`energy-${size}`} type="number" readOnly={readOnly} step="any" min={0.000001}
            defaultValue={energy.get(size)} />
        </label>)}
        {ENERGY_LIMITS.map(renderLimit)}
      </fieldset>
      <p className="oa-secondary">{t("settingsHelp")}</p>
      <Button type="submit" compact disabled={readOnly}>{t("apply")}</Button>
    </form>
  </details>;
}

export function PileDrivingChecks({ checks, energyRange, neighborhood, neighborhoodExpanded, onToggleNeighborhood }: {
  checks: PileDrivingCheck[];
  energyRange?: PileDrivingEnergyRange | null;
  neighborhood?: PileDrivingNeighborhood | null;
  neighborhoodExpanded: boolean;
  onToggleNeighborhood: () => void;
}) {
  const { t, i18n } = useTranslation("rightPanel", { keyPrefix: "pileDriving.checks" });
  const neighborhoodRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (neighborhoodExpanded) neighborhoodRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [neighborhoodExpanded]);
  const format = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 });
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 2 });
  const display = (value: number | null | undefined) => value == null ? "–" : format.format(value);
  const recordedSize = checks.find(check => check.kind === "size")?.actual;
  const comparisonTitle = recordedSize == null
    ? t("neighborhood.title")
    : t("neighborhood.titleBySize", { size: display(recordedSize) });
  return <section className="pile-driving-checks">
    <Heading>{t("title")}</Heading>
    <ul>
      {checks.map(check => {
        const values = {
          actual: display(check.actual),
          other: check.kind === "neighborhood" && check.other != null
            ? percent.format(check.other / 100) : display(check.other),
          reference: display(check.reference),
          tolerance: check.kind === "neighborhood" && check.tolerance != null
            ? percent.format(check.tolerance / 100) : display(check.tolerance),
        };
        const canExpand = check.kind === "neighborhood" && (neighborhood?.reference_piles.length ?? 0) > 0;
        return <li key={check.kind} ref={check.kind === "neighborhood" ? neighborhoodRef : undefined}
          className={check.status === "warning" ? "pile-driving-check-warning" : undefined}>
          <div className="pile-driving-check-title">
            {canExpand && <Button compact className="pile-driving-neighborhood-toggle"
              aria-label={t(neighborhoodExpanded ? "neighborhood.hide" : "neighborhood.show")}
              aria-expanded={neighborhoodExpanded} onClick={onToggleNeighborhood}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>}
            <strong>{t(`labels.${check.kind}`)}</strong>
            <Status tone={check.status === "warning" ? "warning" : check.status === "ok" ? "success" : "info"}>
              {t(`status.${check.status}`)}
            </Status>
          </div>
          <p className="oa-secondary">{t(`values.${check.kind}`, values)}</p>
          {check.kind === "neighborhood" && neighborhood && <div className="pile-driving-neighborhood">
            <p className="oa-secondary">
              {t("neighborhood.peers", { count: neighborhood.peer_count })}
              {" · "}{t(neighborhood.relaxed_selection ? "neighborhood.relaxed" : "neighborhood.exact")}
            </p>
            <p className="oa-secondary">{t("neighborhood.own", {
              ppn: display(neighborhood.final_ppn_m),
              energy: display(neighborhood.mean_energy_kj),
            })}</p>
            {canExpand && neighborhoodExpanded && <p className="oa-secondary">{t("neighborhood.included")}</p>}
            {canExpand && neighborhoodExpanded && <div className="pile-driving-table" tabIndex={0}
              role="region" aria-label={comparisonTitle}>
              <table className="oa-table">
                <caption>{comparisonTitle}</caption>
                <thead><tr>
                  <th scope="col">{t("neighborhood.location")}</th>
                  <th scope="col">{t("neighborhood.average")}</th>
                  <th scope="col">{t("neighborhood.deviation")}</th>
                  <th scope="col">{t("neighborhood.ppn")}</th>
                  <th scope="col">{t("neighborhood.energy")}</th>
                </tr></thead>
                <tbody>{neighborhood.reference_piles.map(pile => {
                  const deviation = percent.format(pile.deviation_pct / 100);
                  return <tr key={pile.load_point_id}>
                    <th scope="row">{pile.load_point_id}</th>
                    <td>{display(pile.mean_blows)}</td>
                    <td aria-label={pile.exceeds_tolerance ? t("neighborhood.outsideLimit", { deviation }) : undefined}>
                      {pile.exceeds_tolerance ? <Status tone="warning">{deviation}</Status> : deviation}
                    </td>
                    <td>{display(pile.final_ppn_m)}</td>
                    <td>{display(pile.mean_energy_kj)}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          </div>}
        </li>;
      })}
    </ul>
    {energyRange && <p className="pile-driving-energy-range oa-secondary">
      {t("energyRange", { min: display(energyRange.minimum_kj), max: display(energyRange.maximum_kj) })}
    </p>}
  </section>;
}

export function PileDrivingEnergyBySize({ groups, limit, fileCount, skipped }: {
  groups: PileDrivingEnergyGroup[];
  limit: number;
  fileCount: number;
  skipped: string[];
}) {
  const { t, i18n } = useTranslation("rightPanel", { keyPrefix: "pileDriving.checks" });
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 6 });
  const warnings = groups.filter(group => group.status === "warning").length;
  return <details className="pile-driving-disclosure pile-driving-energy">
    <summary>
      <span>{t("energyBySize.title")}</span>
      {warnings > 0 && <Status tone="warning">{t("energyBySize.warnings", { count: warnings })}</Status>}
    </summary>
    <div className="pile-driving-disclosure-body">
      <p className="oa-secondary">{t("energyBySize.help", { limit: number.format(limit) })}</p>
      <p className="oa-secondary">{t("energyBySize.files", { used: fileCount - skipped.length, total: fileCount })}</p>
      {skipped.length > 0 && <p><Status tone="warning">
        {t("energyBySize.skipped", { names: skipped.join(", ") })}
      </Status></p>}
      {groups.length === 0 ? <p>{t("energyBySize.empty")}</p> : <ul className="pile-driving-energy-groups">
        {groups.map(group => {
          const range = { min: number.format(group.minimum_kj), max: number.format(group.maximum_kj) };
          return <li key={group.pile_size_mm}>
            <div className="pile-driving-check-title">
              <strong>{t("energyBySize.group", { size: number.format(group.pile_size_mm), count: group.pile_count })}</strong>
              <Status tone={group.status === "warning" ? "warning" : group.status === "ok" ? "success" : "info"}>
                {t(`status.${group.status}`)}
              </Status>
            </div>
            <span className="oa-secondary">{group.spread_kj == null
              ? t("energyBySize.single", range)
              : t("energyBySize.values", { ...range, spread: number.format(group.spread_kj) })}</span>
          </li>;
        })}
      </ul>}
    </div>
  </details>;
}
