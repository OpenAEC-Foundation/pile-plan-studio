# View Display Controls Design

## Summary

Pile Plan Studio will gain a dedicated **View** ribbon tab for frequently used
viewer controls. The release combines five related GitHub requests:

- [#8 Show total costs](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/8)
- [#11 Specify wanted range for usage](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/11)
- [#12 Change symbol size](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/12)
- [#13 Toggle foreground layer objects](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/13)
- [#14 Set max use for optimization](https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/14)

The viewer range is presentation-only. It does not redefine whether a pile
option is technically valid. The optimizer maximum is a separate engineering
constraint enforced by the Rust core.

## Goals

- Make symbol size adjustable without coupling it to zoom.
- Keep pointer selection and overlap detection consistent with visible symbols.
- Let users define a preferred utilization range and identify deviations at a
  glance.
- Let users choose whether ordinary load points or CPTs are drawn in front.
- Show total project cost persistently without reducing viewer space.
- Allow the greedy optimizer to enforce a user-selected maximum utilization.
- Preserve backward compatibility with existing IFCPP projects.

## Non-Goals

- Changing technical `OK`, `Not OK`, or `Missing` status based on the viewer
  range.
- Changing lasso inclusion based on symbol outlines; lasso selection continues
  to use load-point centres.
- Adding separate symbol-size settings for load points and CPTs.
- Publishing a new installer as part of this feature implementation.

## User Interface

### View Ribbon

Add `view` to the active ribbon tabs. Its controls are shown directly in the
ribbon and divided into three groups:

1. **Symbols**
   - One continuous range control from 10% through 200%.
   - Values snap to whole percentages.
   - Default: 100%.

2. **Preferred utilization**
   - One dual-handle range control from 0% through 100%.
   - Values snap to whole percentages.
   - The lower handle cannot pass the upper handle.
   - Default: 0% through 100%.

3. **Foreground**
   - A segmented control with `Load points` and `CPTs`.
   - Default: load points in front.

Controls and labels follow the current English/Dutch language setting.

### Optimization Panel

Add a **Maximum utilization** range control to the existing optimization
settings:

- range: 0% through 100%;
- whole-percentage values;
- default: 100%.

This setting is independent of the preferred viewer range.

### Status Bar

Replace the placeholder status information with live project information:

- left: total known pile cost;
- left, only when applicable: the number of load points without a known cost;
- right: the current viewer zoom percentage.

The cost summary is derived from current pile assignments and cost settings. It
is not persisted independently.

## State And Persistence

### Local Viewer Preferences

The following settings are personal application preferences and apply across
projects:

- `symbolScalePercent`, constrained to 10 through 200;
- `foregroundLayer`, either `load-points` or `cpts`.

They use the existing local preference store. Invalid or absent values fall
back to 100% and `load-points` respectively.

### IFCPP Project Settings

Add a viewer-utilization settings object to the Rust project settings and its
IFCPP representation:

- minimum preferred utilization;
- maximum preferred utilization.

Wire values use utilization ratios (`0.0` through `1.0`), while the UI presents
percentages. Missing settings in older IFCPP projects default to `0.0` and
`1.0`. Parsing clamps values to the supported range and ensures minimum does
not exceed maximum.

Extend `GreedyOptimizationSettings` with `max_utilization`. The wire value is a
ratio from `0.0` through `1.0`; older projects default to `1.0`.

## Viewer Behaviour

### Symbol Scaling

One normalized symbol scale controls:

- load-point and CPT symbol dimensions;
- no-pile crosses;
- selection and inspection rings;
- marker hit areas;
- hover candidate visual radii;
- the spatial hover index's maximum visual radius.

Changing symbol scale rebuilds the hover spatial index. The visual symbol,
click target, and hover overlap radius therefore remain aligned at every scale.
Lasso selection remains centre-based.

### Utilization Styling

Styling is based on the currently assigned pile option:

- utilization inside the preferred inclusive range keeps the normal pile
  symbol styling;
- utilization above the maximum receives a red overlay;
- utilization below the minimum receives a green overlay;
- overlay intensity increases linearly with percentage-point distance from the
  nearest boundary and reaches its maximum at 50 percentage points;
- a missing bearing-capacity result keeps the existing yellow styling;
- no selected or available pile keeps the existing cross representation.

The range is visual only. A technically valid option remains `OK` in tables
when it lies outside the preferred viewer range. Selection and hover outlines
remain visible above utilization overlays.

### Layer Ordering

The foreground preference reverses only the ordinary load-point and CPT layer
order. The interactive ordering is invariant:

1. ordinary background object type;
2. ordinary foreground object type;
3. context-selected CPTs and selected load points;
4. active hover candidate or inspected object.

Manual CPT-edit mode retains its existing ability to raise editable CPTs.

## Optimization Behaviour

The Rust greedy optimizer filters candidate options for target load points. A
candidate is eligible only when:

- it is technically valid;
- it contains no missing CPT capacity;
- its utilization is less than or equal to `max_utilization`.

Existing manual assignments do not change until optimization is run. If no
eligible option remains for a target load point, the optimizer returns no pile
assignment for that target and the viewer shows the existing cross. Load points
outside the optimization target remain unchanged.

The optimizer threshold does not alter pile-option table status and does not
inherit the preferred viewer maximum.

## Components And Boundaries

- Rust project/IFCPP types own project-persisted viewer and optimization
  settings.
- Rust optimization code owns enforcement of maximum utilization.
- A focused TypeScript viewer-preferences model validates local display
  preferences and integrates with the existing preference store.
- A focused utilization-visual helper maps assigned-option utilization and
  preferred range to CSS state and intensity.
- `PilePlanViewer` consumes validated scale, layer order, and utilization visual
  results but does not duplicate their calculations.
- `Ribbon` exposes controlled View settings through callbacks rather than
  directly mutating project state.
- `StatusBar` receives derived cost and viewport values as props.

## Error Handling And Compatibility

- Invalid local preference values fall back to defaults without blocking app
  startup.
- Invalid project utilization settings are clamped and normalized when loaded.
- Missing utilization remains neutral unless the option is already marked
  missing.
- Old IFCPP files load with the current 0%-100% visual range and 100% optimizer
  maximum.
- Saving an opened legacy project writes the new explicit settings.

## Test Plan

### Rust

- Default missing viewer range and optimizer maximum during deserialization.
- IFCPP round-trip of the new project settings.
- Greedy optimizer accepts a candidate at the exact maximum.
- Greedy optimizer rejects a candidate above the maximum.
- A target with no candidate below the maximum receives no assignment.
- Non-target load points remain unchanged.

### TypeScript

- Clamp and default local symbol scale and layer preference.
- Persist and reload local viewer preferences.
- Enforce ordered dual-range handles.
- Produce neutral, red, green, and missing visual states.
- Increase color intensity with distance and clamp at the visual maximum.
- Scale marker dimensions, rings, hit radii, and hover radii from one value.
- Rebuild hover-index inputs when symbol scale changes.
- Reverse ordinary marker layers while keeping selected and hover layers above.
- Derive total cost, missing-cost count, and live zoom display.
- Verify English and Dutch View ribbon labels.

### Integration And Visual Verification

- Run Rust workspace tests and the complete frontend test suite.
- Run TypeScript compilation and the Vite production build.
- Verify the View ribbon at desktop and narrow widths.
- Verify symbol scaling, pointer selection, overlapping candidates, lasso,
  selection rings, and layer switching in the sample project.
- Verify utilization colors in light and dark application themes while the
  viewer remains white.
- Verify total costs and zoom update immediately after relevant state changes.
