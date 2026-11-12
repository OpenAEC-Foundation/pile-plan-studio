# IFCPP IFCX profile 1.0.0

This profile specifies the IFCX storage mapping for the project data in legacy IFCPP schema 9. The reference is Pile Plan Studio revision `21251fa`. The fixtures are synthetic. They exercise the file contract independently and through the Rust project reader and writer.

The project keeps its `.ifcpp` extension. It contains `header`, `imports`, `schemas` and `data`. The draft project imports `urn:example:ifcpp:1.0.0` and has an empty `schemas` object. A resolver supplies [the versioned profile](ifcpp-profile-1.0.0.ifcx) from the app bundle. This makes a saved project usable offline. The draft URN identifies a specific profile. A published version can use an immutable, publicly resolvable URI.

The IFCX reference revision is [buildingSMART IFC5-development 1a63082](https://github.com/buildingSMART/IFC5-development/commit/1a63082ada967c683cfacee2005f8f749c8e1b79). The combined profile declares the used buildingSMART class and name attributes, the OpenAEC foundation and source attributes, and the OPPS-specific attributes. The IFC class attribute has the shape from buildingSMART IFC Core v5a. The name attribute is a string. The Rust core remains responsible for project validation and engineering decisions.

## Graph and identity

| Node | Structural children and identity |
| --- | --- |
| Project | A project UUID is both `header.id` and the root node path. The root owns one foundation node. |
| Foundation | Owns the plans, load points, CPTs, advice nodes and source documents. |
| Pile plan | Owns the piles designed in this variant. The plan also keeps its original string variant ID. |
| Pile | References the shared load point. At most one pile per load point per plan. |
| Load point and CPT | Independent UUIDs. The original numeric ID is retained in `number`. |
| Advice and source documents | Independent UUIDs. Advice rows stay on the advice node. A source document can be referenced by several rows and import-log records. |

Every node has a UUID in `path`. Store the UUID when the node is first created or converted, and reuse it across saves. Keep it on a confirmed source refresh. A duplicated plan and its piles get new UUIDs and continue to refer to the shared load points. The keys in `children` are readable, unique within the parent, and separate from the node UUID. Attributable local relationships use the IFCX `Reference` type. Check the target node's role as well as its existence.

`openaec::opps::inputOrder` retains load point and CPT vector order. `planSettings.order` retains variant order. `bearingAdvice.entries[].order` retains advice-row order across source nodes. Source-file and import-log order comes from their arrays.

## Field mapping

Unqualified field names below refer to the enclosing Rust structure or IFCX attribute in the same row. Objects use camelCase field names. Keep legacy enum values as documented in the profile. Optional Rust values become absent fields. An explicitly empty collection remains empty where its presence has meaning.

### Project and foundation

| Legacy fields | IFCX destination |
| --- | --- |
| `schema`, `schema_version` | The root attribute `openaec::opps::document.format` is `IFCPP`. `header.ifcxVersion` identifies the IFCX envelope. `header.dataVersion` and the profile URI identify the new IFCPP profile. Run the existing 1–9 normalization on legacy input. |
| `application.name`, `application.version` | Root `openaec::opps::document.application`. |
| `metadata.name` | Root `bsi::ifc::prop::Name`. |
| `metadata.author`, `organization`, `created_at`, `modified_at`, `description` | Root `openaec::project::metadata`. Header author and timestamp describe the serialization and may use a writer name and write time when project metadata is absent. |
| `metadata.external_references` | Root `openaec::source::externalReferences`. Preserve optional source file, IFC GlobalId, entity and description as strings. |
| `units.coordinates`, `design_loads`, `pile_tip_levels`, `bearing_capacities`, `costs` | Root `openaec::project::units` declares `coordinates` in `mm`, `force` in `kN`, `pileSize` in `mm` and `levels` in `m`. Keep the original `costs` label. Preserve any differing legacy labels under `openaec::opps::document.legacyUnitLabels` for round-trip fidelity. The legacy fields' numeric semantics determine the conversion. |
| `settings.pile_head_level_m` | Foundation `openaec::foundation::design.pileHeadLevel` as a real number in metres. Preserve the original floating-point value and any uncertainty about the vertical datum. |
| `settings.global_cpt_selection`, `settings.cpt_selection_by_load_point` | `openaec::opps::cptRules` on the foundation and on the relevant load point. Preserve algorithm, maximum distance in metres, monopoly distance in metres and maximum angle in degrees. Rules for an unavailable legacy location go to `openaec::opps::legacyLocationSettings` keyed by its numeric ID. |
| `settings.load_point_grouping` | Foundation `openaec::opps::grouping`. Preserve `automatic`, `maxEdgeDistanceMm`, `manualGroups` and `ungroupedGroups` with load point references. Effective groups are recomputed in Rust. |
| `settings.pile_costs` | Foundation `openaec::opps::pileCosts`. Preserve its own schema version and every item’s pile size, shape and cost per m³. Currency comes from project units. |
| `settings.ilp_optimization`, legacy `settings.optimization` | Foundation `openaec::opps::optimizerSettings` after existing Rust normalization. The historical settings shape is used for old input. |
| `settings.viewer_utilization` | Foundation `openaec::opps::viewerUtilization` with minimum and maximum. |
| `settings.pile_legend` | Foundation `openaec::opps::legend`. Preserve encoding mode, general and per-dimension color schemes, and size and tip-level entries with their symbol base shape, fill pattern, color and automatic flags. Size values use millimetres. Tip-level values use decimal metres with whole-millimetre precision. |
| `settings.viewer`, `user_state.active_pile_plan_id` | Foundation `openaec::opps::planView`. `plan` is the reference to the viewed plan. Preserve grid, tip-level regions, group visibility, symbol scale and foreground layer. |

### Inputs, source provenance and heistaten

| Legacy fields | IFCX destination |
| --- | --- |
| `inputs.load_points[]` | One load point node per entry. Use `bsi::ifc::prop::Name` for `name`. Map `id`, `x_mm`, `y_mm` and `design_load_kn` to `number`, `x`, `y` and `fed` in `openaec::foundation::loadPoint`. Preserve the tension state and include `tension.value` exactly when known, including a true zero. |
| `inputs.cpts[]` | One `openaec::cpt` node per entry. `name` is the name attribute. `id`, `x_mm` and `y_mm` become `number`, `x` and `y`. |
| `user_state.manual_cpt_selections` | `openaec::foundation::cptSelection` on the load point with method `manual` and `cpts` references. Preserve an empty manual selection as present. Unknown CPT IDs go in `legacyCptNumbers`. Selections keyed by an unavailable location go in `legacyLocationSettings.manualCptNumbers`. |
| `inputs.bearing_capacities[]` | `openaec::foundation::bearingAdvice.entries[]`. Map CPT ID to `cpt`, or preserve an unresolved legacy ID in `legacyCptNumber`. Use `pileSize` in millimetres, `tipLevel` in decimal metres and `resistance` in kilonewtons. Preserve direction, optional pile count and original order. A missing row uses `availability: "missing"` with no resistance. A present zero uses `availability: "available"` with zero. Reconstruct the legacy placeholder zero for a missing row on read. |
| `import_log[]` | Foundation `openaec::opps::importLog`. Each entry retains its source reference, import time, sheet, mapped columns, warnings, role, format, schema version, profile and profile details. Store arbitrary string maps as arrays of key/value pairs. Preserve profile details verbatim, including old source IDs, ownership keys and reimport options. |
| Source file and advice ownership | `openaec::source::document` carries original filename, kind, known worksheet names and known revision. A log points to its actual source. Use legacy import ownership to infer a row’s source where available. An advice node's `source` is the default; a row's optional `sources` replaces that default for the row. Preserve several owners with references to each source. Unprovenanced rows stay in an advice node with no default source. |
| `inputs.pile_driving.files[]` | The foundation's `openaec::opps::pileDriving.files` array carries the original file ID, source reference and optional match-field, CSV leading-zero and table overrides. The source document carries its name and format (`csv` or `spreadsheet` for `xlsx`); `openaec::source::embeddedFile` carries the original base64 bytes. |
| `inputs.pile_driving.shared_match_by`, `shared_ignore_csv_leading_zeros`, `shared_table`, `check_settings` | `pileDriving.sharedMatchBy`, `sharedIgnoreCsvLeadingZeros`, `sharedTable` and `checkSettings`. The optional CSV boolean also exists per file at `overrides.ignoreCsvLeadingZeros`. An explicit `false` preserves exact matching. Preserve shared headers and all table mapping settings. Preserve all check thresholds and expected energy per size. An absent `pileDriving` remains distinct from a present record with an empty files array. |

Table mapping settings retain fixed pile size, pile count, sheet name, header presence, header row, first data row, delimiter and column mappings. Each column retains index, role, optional unit and optional pile size. Row and column indices use decimal strings to preserve `usize` values exactly.

### Palenplannen and optimizer history

| Legacy fields | IFCX destination |
| --- | --- |
| `user_state.pile_plans[].id`, `name` | `openaec::foundation::pilePlan.variantId` and `bsi::ifc::prop::Name`. |
| `active_pile_sizes`, `active_pile_tip_levels`, `locked_load_point_ids` | `openaec::opps::planSettings`. Store `activePileSizes` in millimetres and `activeTipLevels` in decimal metres. Locks reference load points and can exist without a pile assignment. Unknown legacy lock IDs go in `legacyLockedLoadPointNumbers`. |
| `selected_piles[location].pile` | For a known location and a chosen configuration, a plan child with `bsi::ifc::class` of `IfcPile` and `openaec::foundation::pile` carrying the load point reference, size and tip level. For an explicitly unassigned choice at a known location, retain `openaec::opps::unassignedChoices`. Legacy choices for unknown locations go in `openaec::opps::legacyAssignments` with their original numeric key. |
| `selected_piles[location].external_references` | `openaec::source::externalReferences` on the pile, or the `externalReferences` field of the unassigned or unresolved choice. |
| `revit_marks_by_load_point` | A **Paalnummer** on the pile in the same variant at `openaec::foundation::pile.pileNumber`. Preserve the exact string. If the plan has no pile at that location, retain the number on the plan in `openaec::opps::legacyPileNumbers` with a load point reference, or the original numeric ID if the location is unavailable. A newer legacy reader can normalize the renamed Rust field to this same mapping. |
| `pile_cap_proposals` | `openaec::opps::pileCapProposals`. Preserve member references, legacy member IDs when unresolved, pile count, quarter turns and optional configuration. |
| `optimization_unassigned` | `openaec::opps::optimizationUnassigned` with the location reference or original numeric ID and the exact reason. |
| `ilp_result` | `openaec::opps::optimizerResult`. Preserve the solution, assignments, proposed caps, cost and budget, reference solution with its own proof and termination, counts, transitions, score, returned solution proof and termination, diagnostics, run settings, scope flags, currency and basis fingerprint. Historical location numbers stay as numbers in the snapshot, independent of current assignments. |

An optimizer settings snapshot retains tension inclusion, pile-count changes, allowed and maximum counts, skip-unsolvable behavior, coherence, configuration limits, maximum utilization, candidate source and custom configurations, cost budget and transition weights. Retain historical `bothMilli` where present. Costs, budgets and optimizer scores stored as `u64` are decimal strings in IFCX to preserve values above the JSON safe-integer limit.

### Vertical level precision

Tip levels use the same exact millimetre key across advice, legend entries, active levels, pile configurations, proposals and optimizer snapshots. For legacy tip levels stored as floating-point metres, obtain that key using the existing Rust precision checks. For a legacy integer key, use the original integer. Serialize the key as a decimal JSON number in metres with at most three fractional digits. Convert the original JSON number token back to an integer millimetre key before any floating-point conversion. For example, `-17.123` is exactly `-17123` mm. Near the upper precision limit, `9007199254740.99` and `9007199254740.991` represent different keys and collapse to the same value if first parsed as a binary float.

Read and write the pile head level as a round-trippable floating-point number in metres at its original precision. The units specify the scale of the numbers. A legacy project with an unknown vertical datum retains that uncertainty.

## Verification

Run from the repository root.

```powershell
node --test schemas/ifcpp/profile.test.mjs
```

The compact fixture covers two variants sharing L17 with different paalnummers, an unassigned L18, one manual CPT choice and Excel advice. The full fixture exercises every schema attribute, including a lock and legacy paalnummer at an unassigned location, unknown historical IDs, grouping and optimizer outcomes, a real zero next to a missing scoped resistance, overlapping source ownership and an embedded heistaat. The profile tests require a Node.js runtime with `JSON.parse` reviver source support, such as Node.js 22 or later. They verify a shared millimetre key across the fixture's pile, plan and advice, check the precise head-level token, and exercise exact decimal conversion of adjacent millimetre keys near the precision limit and at both signed 64-bit endpoints. The tests also reject an unsupported profile, dangling and mistyped CPT references, duplicate pile assignments and an inconsistent missing resistance.

### Pinned buildingSMART reader

Use a checkout of IFC5-development at `1a63082ada967c683cfacee2005f8f749c8e1b79` and the TypeScript CLI installed with the OPPS frontend dependencies. Set the checkout path before running these commands from the OPPS repository root.

```powershell
$upstream = (Resolve-Path '<IFC5-development checkout>').Path
$revision = git -C $upstream rev-parse HEAD
if ($revision -ne '1a63082ada967c683cfacee2005f8f749c8e1b79') { throw 'Unexpected IFCX alpha revision' }
$compiled = Join-Path ([System.IO.Path]::GetTempPath()) 'ifcpp-building-smart-1a63082'
node apps/pile-plan-studio/node_modules/typescript/bin/tsc --noCheck --module node16 --target es2022 --rootDir $upstream --outDir $compiled `
    (Join-Path $upstream 'src/ifcx-core/layers/layer-stack.ts') `
    (Join-Path $upstream 'src/ifcx-core/layers/layer-providers.ts')
if ($LASTEXITCODE -ne 0) { throw 'Could not compile the IFCX reader' }
node schemas/ifcpp/check-building-smart.cjs (Join-Path $compiled 'src/ifcx-core')
```

The harness provides both the project and its imported profile to the upstream in-memory layer resolver. It verifies offline composition of 11 and 15 nodes, and checks rejection of an unavailable profile and an invalid CPT number. The same two projects also parse and compose with OpenAEC IFCX core revision `35df7389708b8ef7671b38be208118291f8a81fd`.

The pinned TypeSpec still declares a bracketed `path` pattern. This profile uses bare UUIDs as in the upstream [Hello Wall example](https://github.com/buildingSMART/IFC5-development/blob/1a63082ada967c683cfacee2005f8f749c8e1b79/examples/Hello%20Wall/hello-wall.ifcx). The executed upstream reader accepts them. A validator enforcing the TypeSpec path pattern can reject them.

The Rust tests exercise legacy normalization, IFCX round-trips, exact millimetre keys, pile-head `f64` bits, and stable paths across saves, duplication and source refresh. The browser/WASM and Tauri tests exercise the same codec through their project-document entry points.
