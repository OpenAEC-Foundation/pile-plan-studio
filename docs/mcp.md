# MCP connection

Open Pile Plan Studio can share the project currently open in its desktop app
with a local AI client. In **Settings → General → AI connection**, enable
MCP access for this session. Copy the endpoint and access token into an MCP
client that supports Streamable HTTP and an Authorization bearer header.
Access starts off each time the app launches. Turning it off, or closing the
app, stops the local listener. The fixed endpoint is
`http://127.0.0.1:46537/mcp`; it binds to `127.0.0.1` only. The access token
changes each time MCP access is enabled. Update the token in your client after
restarting or re-enabling the connection. If the port is already in use, the
connection reports an error instead of silently switching to another address.

In ChatGPT Desktop, keep the fixed server URL and replace the bearer token
when you start a new Pile Plan Studio session. ChatGPT Desktop and Codex share
their local MCP configuration. Its `default_tools_approval_mode = "writes"`
setting can request approval for the write tools. The current integration does
not update the client's token automatically. See the
[ChatGPT MCP configuration guide](https://learn.chatgpt.com/docs/extend/mcp)
for the local HTTP server settings.

The server supports MCP protocol version `2025-11-25` with JSON responses on
the Streamable HTTP `POST /mcp` endpoint. The client sends
`Authorization: Bearer <copied token>` with each request. Read tools are
available when MCP access is on. To make project changes, also enable
**Allow editing through MCP** in Settings. This edit permission starts off
for every session and turns off when MCP access stops. The bridge cannot read
arbitrary local files or run shell commands.

| Area | Tools |
| --- | --- |
| Project | `pile_project_overview`, `pile_get_project_settings` |
| Load points and pile options | `pile_list_load_points`, `pile_get_load_point`, `pile_list_pile_options` |
| CPTs and advice | `pile_list_cpts`, `pile_get_cpt_advice` |
| Groups and assessment | `pile_list_groups`, `pile_get_technical_assessment` |
| Plans | `pile_list_plans`, `pile_get_plan`, `pile_get_plan_costs`, `pile_compare_plans` |
| Optimization | `pile_get_plan_optimization`, `pile_get_current_optimization` |
| Import formats and status | `pile_get_import_requirements`, `pile_get_source_import_status`, `pile_get_pile_plan_import_requirements`, `pile_get_pile_plan_import_status`, `pile_get_file_operation_status` |

The server also advertises these project operations. Calls to them are
rejected until editing is enabled:

| Area | Tools |
| --- | --- |
| Plans | `pile_duplicate_plan`, `pile_rename_plan` |
| Assignments | `pile_assign_configuration`, `pile_clear_assignment`, `pile_set_assignments_bulk` |
| Plan navigation and removal | `pile_activate_plan`, `pile_delete_plan` |
| Locks | `pile_set_load_point_lock`, `pile_set_load_point_locks_bulk` |
| CPT selection | `pile_set_manual_cpts`, `pile_use_automatic_cpts`, `pile_set_cpt_selections_bulk` |
| Groups | `pile_group_load_points`, `pile_ungroup_load_points`, `pile_ungroup_load_points_bulk` |
| Files | `pile_open_project`, `pile_save_project`, `pile_save_project_as`, `pile_export_plan` |
| Pile-plan CSV import | `pile_begin_pile_plan_import`, `pile_append_pile_plan_import`, `pile_validate_pile_plan_import`, `pile_apply_pile_plan_import`, `pile_discard_pile_plan_import` |

Every write call requires `expected_project_instance_id` and
`expected_project_revision` from a recent read response. The plan operations,
lock operation and assignment operations also require `plan_id`. Assignment
and lock calls require `load_point_id`; `pile_assign_configuration` requires
`pile_size_mm` and `pile_tip_level_mm`. Assignments apply to the current active
plan and the full effective load-point group. The Rust core enforces group
and lock rules. Unknown configurations, stale project revisions, and writes to
an inactive plan are rejected.

| New tool | Additional input | Effect |
| --- | --- | --- |
| `pile_activate_plan` | `plan_id` | Switch to an existing plan. Like switching plans in the interface, this changes the project revision but adds no undo step. |
| `pile_delete_plan` | `plan_id` | Delete a plan, provided at least one other plan remains. |
| `pile_set_load_point_lock` | `plan_id`, `load_point_id`, `locked` (`true` or `false`) | Lock or unlock one load point in the active plan. |
| `pile_set_manual_cpts` | `load_point_id`, `cpt_ids` (unique CPT IDs) | Replace that load point's manual CPT selection. `[]` explicitly selects no CPTs. |
| `pile_use_automatic_cpts` | `load_point_id` | Remove its manual override and use the project's automatic CPT selection. |
| `pile_group_load_points` | `load_point_ids` (at least two unique IDs) | Ask the Rust core to join the selected effective groups. |
| `pile_ungroup_load_points` | `load_point_id` | Remove a manual group containing the point, or record a separation of an automatic group. |

## Bulk edits

Four bulk tools apply up to 500 explicitly named load points in one project
change and one Undo step. Different rows may have different values. The entire
request is rejected if one row is invalid or blocked; no earlier rows are
applied. A request with no content change creates no Undo entry. The local
HTTP request body may be at most 256 KiB. There is no separate preview step.

Every example below uses project markers obtained from a recent read. Replace
`"current-instance"` and `7` with the current values before calling a tool.
Each successful write returns the new project revision for the next call.

```json
{
  "plan_id": "active-plan-id",
  "changes": [
    { "load_point_id": 101, "configuration": { "pile_size_mm": 300, "pile_tip_level_mm": -12000 } },
    { "load_point_id": 102, "configuration": null }
  ],
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

Pass that input to `pile_set_assignments_bulk`. `null` clears an assignment.
The active plan is required. Each named configuration must be a known pile
option for its load point. Because an effective group shares an assignment,
two members of one group cannot request different configurations in the same
batch. Rust checks the whole batch for group conflicts and locks.

```json
{
  "plan_id": "active-plan-id",
  "changes": [
    { "load_point_id": 101, "locked": true },
    { "load_point_id": 102, "locked": false }
  ],
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

Pass that input to `pile_set_load_point_locks_bulk`. Locks apply separately
to each named load point in the active plan.

```json
{
  "changes": [
    { "load_point_id": 101, "cpt_ids": [11, 12] },
    { "load_point_id": 102, "cpt_ids": [] },
    { "load_point_id": 103, "cpt_ids": null }
  ],
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

Pass that input to `pile_set_cpt_selections_bulk`. `[]` explicitly selects
no CPTs; `null` removes the manual override and restores automatic selection.
The selection is shared by all plans. Changed locations request analysis
together, so the write response does not yet contain recalculated options.

```json
{
  "load_point_ids": [101, 205],
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

Pass that input to `pile_ungroup_load_points_bulk`. Each ID identifies its
original effective group. Naming several members of that same group separates
it once. A singleton or blocked group rejects the entire request. Existing
pile assignments are not silently changed.

Except for plan activation, successful content changes participate in
undo/redo and dirty-state tracking. A request that changes nothing returns
`changed: false` without adding an undo step. Lock edits affect one load
point; assignment edits still affect its entire effective group. A manual CPT
change requests fresh analysis. Its response does not mean that new pile
options have already been calculated. After grouping or separating, read
`pile_list_groups` and `pile_get_technical_assessment` again when grouping is
current. Existing assignments are not silently reconciled if a new group
reveals a conflict. The Rust core can reject grouping, for example when the
selected points are disconnected in its topology; its reason is returned as
an MCP error and no project change is applied.

## Project settings edits

The desktop bridge also accepts settings changes. They use the same current
`expected_project_instance_id` and `expected_project_revision` fields as the
other write tools. The session editing switch must be on. Rust checks each
complete request before one project change is committed. A blocked row rejects
the whole batch; an unchanged request creates no Undo entry. There is no
separate preview.

| Tool | Purpose |
| --- | --- |
| `pile_set_cpt_selection_settings` | Patch projectwide automatic CPT rules. |
| `pile_set_cpt_selection_settings_bulk` | Patch distinct automatic CPT rules for up to 500 explicit load points. |
| `pile_set_grouping_settings` | Set automatic grouping and/or maximum group distance. |
| `pile_reset_group_overrides` | Clear all manual joins and explicit automatic-group separations. |
| `pile_add_cost_item` | Add one project cost row for a pile size. |
| `pile_update_cost_item` | Change the shape and/or unit cost of one row. |
| `pile_remove_cost_item` | Remove one unused row. |
| `pile_edit_cost_catalog_bulk` | Apply up to 500 mixed add, update, and remove actions in one Undo step. |

For CPT rules, a `settings` patch may contain `algorithm` (`quadrants` or
`maximum-angle`), `max_distance_m`, `monopoly_distance_m`, and
`max_angle_degrees`. Distances must be nonnegative; the maximum angle must be
between 1 and 360 degrees. A projectwide patch also updates the named fields
in existing per-location overrides, leaving their other fields intact. The
bulk tool takes `changes: [{ "load_point_id": 101, "settings": {
"max_distance_m": 18 }, "overwrite_manual_selections": true }]`. Each row may
carry different settings. Manual CPT choices remain by default; set
`overwrite_manual_selections: true` at the project level or for an individual
bulk row to remove those choices and use automatic selection. The resulting
analysis runs after the project change. `pile_get_load_point` reports both its
override and effective CPT settings.

`pile_set_grouping_settings` accepts `automatic` and/or
`max_edge_distance_m`. Changing the resulting groups does not change pile
assignments or locks. Read `pile_list_groups` and
`pile_get_technical_assessment` again after the group assessment settles.
`pile_reset_group_overrides` removes both kinds of manual override together.

Cost rows have a positive integer `pile_size_mm`, `shape` (`round` or
`square`), and nonnegative `cost_per_m3`. A single add uses `item`; a single
update or remove uses `pile_size_mm`, with an update supplying `shape` and/or
`cost_per_m3`. A mixed batch uses tagged actions, for example:

```json
{
  "actions": [
    { "action": "update", "pile_size_mm": 290, "cost_per_m3": 245 },
    { "action": "add", "item": { "pile_size_mm": 350, "shape": "round", "cost_per_m3": 200 } },
    { "action": "remove", "pile_size_mm": 999 }
  ],
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

The batch cannot repeat a pile size. A size used by foundation-advice source
rows cannot be removed. Existing sizes cannot be renamed through update; add
the new size and remove the old one when unused. Personal default prices and
the project's currency are outside the cost-catalog tools. Read `pile_get_project_settings`
and `pile_get_plan_costs` after a change to see the current catalog and Rust
cost estimates.

## More project edits

These operations use the same project instance ID, revision, session editing
switch, Rust validation, and one Undo step as the other MCP writes. Read
`pile_get_project_settings` and `pile_get_plan` before editing. The former now
returns `project_properties`, the complete `legend.settings`, and optimization
settings. The latter returns the plan's active sizes and tip levels.

| Tool | Input | Effect |
| --- | --- | --- |
| `pile_set_optimization_settings` | `settings` patch | Changes project-owned solver rules, including candidate source, limits, utilization, coherence budget, and transition weights. Omitted fields retain their values. |
| `pile_set_active_configurations` | `plan_id`, complete `pile_sizes_mm` and `pile_tip_levels_mm` arrays | Replaces one plan's active configurations. Values must occur in foundation advice. Existing pile assignments are retained. |
| `pile_set_legend_settings` | complete `legend` object; optional `show_tip_level_regions` | Replaces encoding mode, both color schemes, symbols, colors, and automatic-style flags. Can also toggle tip-level regions. The Rust core rejects invalid styles and missing values used by advice. |
| `pile_set_project_properties` | `name`, `pile_head_level_m`, `currency_code` | Changes the same three properties as the app's project-properties dialog. Costs are recalculated from the new pile-head level. |

`pile_set_optimization_settings` changes the saved project defaults, not a
running solve or the personal time-limit preference. A `transition_weights`
patch may contain `tip_only_milli` and `size_only_milli`. Set a maximum to
`null` to remove that limit. `budget_basis_points` remains the percentage above
the cost-only reference solution. Custom candidate configurations use exact
`pile_size_mm` and `pile_tip_level_mm` keys. The complete legend object uses
IFCPP field names such as `encoding_mode`, `pile_sizes`, `symbol.base_shape`,
`color`, and `color_automatic`; copy the current shape from
`pile_get_project_settings` before changing individual values.
For one MCP optimization run, `pile_start_optimization` also accepts
`limit_scope` (`target` or `whole-plan`) and `include_boundary_transitions`.
Omitting them uses the corresponding controls currently shown in the app.

## Targeted source corrections

Use one of these tools for small, explicit source corrections without staging
whole files. Each call accepts 1 to 500 `actions` and applies them atomically
as one Undo step. An invalid action rejects the entire call. `add` and
`update` carry a complete `item`; `remove` carries the row key. Updates keep
the existing ID or advice key; to change a key, remove the old row and add the
new one in the same batch.

| Tool | Row fields | Remove key |
| --- | --- | --- |
| `pile_edit_load_points_bulk` | `id`, `name`, `x_mm`, `y_mm`, `design_load_kn` | `id` |
| `pile_edit_cpts_bulk` | `id`, `name`, `x_mm`, `y_mm` | `id` |
| `pile_edit_foundation_advice_bulk` | `cpt_id`, `pile_size_mm`, `pile_tip_level_m`, `frd_kn` | `cpt_id`, `pile_size_mm`, `pile_tip_level_mm` |

Coordinates and sizes are in millimetres, load and resistance in kN, and
advice tip levels in metres. The removal key uses exact integer millimetres.
Read the current source rows with `pile_list_load_points`, `pile_list_cpts`,
and `pile_get_cpt_advice` before forming an update. The Rust core checks IDs,
positions, tip precision, CPT references, and all resulting project state.
Removing a load point removes its plan assignments, locks, CPT settings, and
group references. Removing a CPT removes its advice rows and manual CPT
references; a manual choice that loses all CPTs returns to automatic selection.
Changed advice reconciles each plan's active sizes and tip levels:
newly introduced values become active, while values no longer in advice are
removed. Source changes invalidate saved optimization results and request
fresh technical analysis. The response reports the new source counts; read
technical assessments again once analysis is ready. New pile sizes may need
an explicit cost-catalog row before optimization can estimate their cost.

For example, an AI client can read `pile_project_overview` and `pile_list_plans`,
then duplicate a plan using the returned project markers. To assign a pile,
it can first read `pile_list_pile_options` for the load point and pass the
configuration's exact millimetre values to `pile_assign_configuration`.
To choose a particular CPT for one load point, first read `pile_list_cpts`
and `pile_get_load_point`, then call `pile_set_manual_cpts` with its
`load_point_id` and the desired `cpt_ids`. Use the new revision from the write
response for the next edit, and reread the load point after analysis completes.

The tools read committed in-memory project changes, including changes that
have not yet been saved to IFCPP. They do not use temporary pile-plan previews
or unfinished editing drafts. The current optimization status is explicitly
marked transient; a saved plan result is reported separately. Costs are
recalculated through the Rust core from the current project inputs. When
analysis or grouping is pending or has failed, the tool reports that state
instead of presenting an empty or retained result as current.

Lists use bounded pages. Every successful result includes a project-instance
ID and observed project revision. Clients can compare these markers across
reads and retry if the project changed. File paths and the access token are
never included in tool results.

## Optimization from MCP

The desktop MCP bridge exposes the same optimization run as the app's
optimization panel. Enable MCP editing before using these commands:

| Tool | Purpose |
| --- | --- |
| `pile_start_optimization` | Start a run and return its ID immediately. |
| `pile_get_current_optimization` | Read progress and the terminal outcome. |
| `pile_stop_optimization` | Stop a named run and keep its best valid solution, if one exists. |
| `pile_cancel_optimization` | Stop a named run and discard its outcome. |

Read `pile_project_overview` for the current project marker and `pile_list_plans`
for the active `plan_id`. A start call requires that active plan and the marker:

```json
{
  "plan_id": "active-plan-id",
  "target_load_point_ids": [101, 102],
  "time_limit_seconds": 1800,
  "create_new_plan": true,
  "new_plan_name": "Optimization A",
  "expected_project_instance_id": "current-instance",
  "expected_project_revision": 7
}
```

Omit `target_load_point_ids` to optimize all load points; the app's current
selection is never used implicitly. Omit `time_limit_seconds` to use the
personal app preference (ten minutes by default), pass an integer from 1 to
7200 to override it for one run, or pass `null` for no time limit. The app's
optimization panel offers the same limit as a stored personal preference in
whole minutes, plus an explicit **No time limit** choice. This preference is
not IFCPP project content. `local_only: true` selects the app's quick local
improvement mode. `create_new_plan` defaults to true; pass false to update the
active plan instead. The destination name is allowed only for a new plan.

Optimization has two stages. Rust first calculates a **cost reference** by
minimizing cost under the technical and configuration constraints, without
optimizing coherence between neighboring load points. When coherence
optimization is enabled, `optimization.settings.budget_basis_points` from
`pile_get_project_settings` allows extra cost above that reference: `500`
means 5%, so the budget is `reference.cost × 1.05`. The percentage is **not**
relative to the current pile plan's cost. Read `solution.reference.cost` and
`solution.budget` in the optimization result to see the actual values. With a
finite time limit, the reference may be feasible without being proven
minimum-cost; inspect `solution.reference.proof` separately from the returned
plan's `proof`.

Starting optimization again starts a new search with the same rules. The
current plan's assignments can be used as a starting solution if they are
valid within the calculated budget, but they do not raise the budget. A second
run may improve an earlier time-limited result; it does not guarantee a better
plan. When the returned plan is proven optimal for the same inputs and limits,
another run cannot improve that objective under those same conditions.

Start returns `run_id` without waiting for the solver. Poll
`pile_get_current_optimization` using that ID in the response to identify the
run, and continue until a terminal status appears. A solved status includes
`committed`; when it becomes true, `committed_destination_plan_id` identifies
the plan to read with `pile_get_plan_optimization`. The result and its summary
are one undoable project change. A blocked, infeasible, cancelled, failed, or
no-solution run leaves the plan unchanged. A finite limit may return a valid
plan without proof of optimality; inspect the returned plan's proof and
termination fields. A run with no limit continues until it completes or is
stopped or cancelled.

Stop and Cancel require the exact `run_id`, but not a project revision because
they control a transient run. An old ID cannot affect a newer run. Both
return promptly; the `stopping` status remains until the solver acknowledges
the request. Project changes during a run invalidate its result and prevent a
stale plan from being saved.

## Source files and new projects through MCP

The desktop MCP bridge accepts converted source data as **standard-table CSV
text**. Call `pile_get_import_requirements` before conversion: its versioned
response comes from the Rust import module and describes column order, units,
examples, and constraints. The app cannot read a file merely because it was
attached to the AI chat. The AI client must read that file, convert it to the
specified CSV, and send the text to the MCP tools. The existing import screen
continues to accept CSV, XLSX, and RFEM exports directly.

Enable MCP editing and use this sequence:

1. Read `pile_project_overview` and pass its instance ID and revision to
   `pile_begin_source_import`. Use `mode: "refresh"` to update one or more of
   the three source roles in the open project; omit the three new-project
   metadata fields or pass `null`. Use `mode: "new_project"` with
   `project_name`, `pile_head_level_m`, and `currency_code` to create a project.
2. Send each role with `pile_append_import_source`: `transaction_id`, `role`,
   `.csv` display basename, `chunk_index` starting at zero, CSV `text`, and
   `final: true` on its last chunk. Chunks must arrive in order and be at most
   128 KiB; each source is limited to 8 MiB and the transaction to 16 MiB.
   A role may be restaged from chunk zero after validation fails.
3. Call `pile_validate_source_import`, then poll
   `pile_get_source_import_status` with the transaction ID until `ready` or
   `failed`. The status includes Rust diagnostics, source counts, warnings,
   and for refresh, before/after, remapped, and lost counts for assignments,
   locks, and manual CPT selections. Validation does not change the project.
4. Use the returned `validation_id` in `pile_apply_source_import`. Refresh is
   one Undo step. New project creation clears the old project's history and
   file path and leaves the new project unsaved. A new project cannot replace
   one with unsaved changes; save or discard those changes in the app first.
   Use `pile_discard_source_import` to abandon the transaction.

All three roles (`load-points`, `cpts`, `bearing-capacities`) are required for
a new project. Refresh needs at least one completed role. Transactions are
temporary, local to the current MCP bridge session, and expire after 30
minutes. No arbitrary filesystem path or URL is accepted by these tools.
Changes to the project while validation is running invalidate the staged
result. A converted CSV may still contain invalid engineering data; only a
`ready` status means Rust accepted the complete import.

## Existing pile plans, files, and comparison

Use `pile_get_pile_plan_import_requirements` for the Rust-defined standard-table
CSV header, units, and example. The AI client reads an attached file itself and
sends converted UTF-8 CSV text; an attachment does not automatically become a
file inside Pile Plan Studio. To add an existing plan:

1. Read `pile_project_overview` and begin with `pile_begin_pile_plan_import`,
   providing the project instance ID and revision, a `.csv` display filename,
   the coordinate tolerance, and whether to import pile assignments, manual
   CPT choices, or both. The optional plan name defaults to the filename.
2. Send ordered text chunks through `pile_append_pile_plan_import`, starting
   with index zero and marking the last chunk `final: true`. Each chunk may be
   at most 128 KiB and the full CSV at most 8 MiB.
3. Call `pile_validate_pile_plan_import` and poll
   `pile_get_pile_plan_import_status` until it is `ready` or `failed`. Inspect
   matched, skipped, and conflicting rows and the paged diagnostics. Validation
   leaves the project unchanged. Restage from chunk zero to correct a CSV.
4. Apply the returned validation ID with `pile_apply_pile_plan_import`. If
   there were skipped or conflicting rows, explicitly set
   `allow_partial_import: true`. The result is a new active plan and one Undo
   step. Manual CPT choices are project-wide, so importing them also changes
   the choices seen by other plans. `pile_discard_pile_plan_import` abandons the
   temporary import.

The importer checks the CSV against the open project's load points, CPTs, and
available configurations. Before applying assignments, the existing Rust group
and lock rules check the batch. An import that would require unlisted group
assignments is rejected rather than silently expanding the CSV. Project
changes invalidate a staged import. Transactions expire after 30 minutes and
exist only while the desktop MCP bridge remains connected.

`pile_open_project`, `pile_save_project`, and `pile_save_project_as` use the
desktop app's native file dialogs and its normal IFCPP reader/writer. Opening a
project with unsaved changes asks the user in the app. Saving to the current
path does not open a dialog; Save As always does. `pile_export_plan` requires a
plan ID and `csv` or `xlsx`; it exports that plan without switching the active
plan. These operations return an ID immediately because a dialog can remain
open. Poll `pile_get_file_operation_status` for `completed`, `cancelled`, or
`failed`. The MCP response contains only the file basename, never its local
path. Save and export do not add an Undo step.

Use `pile_compare_plans` with two distinct plan IDs to get assignment, lock,
cost, and optimizer-result differences. The changed load points are paged.
Costs are calculated from the project cost catalog; if either plan has
assignments without a price, the response gives known subtotals and omits a
total cost difference. Comparison does not change either plan.
