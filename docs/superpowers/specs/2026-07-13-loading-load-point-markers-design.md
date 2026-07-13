# Loading Load Point Markers

## Goal

Avoid showing a temporary field of red crosses while pile options and the default pile choices are still being calculated. A red cross must only mean that calculation has completed and no valid pile option exists for that load point.

## Behaviour

- Newly imported projects and the bundled sample project start with default pile selection pending.
- While pile options or the subsequent default selection are pending, every load point without a definitive choice is shown as a neutral light-grey circular marker.
- Existing saved choices remain visible. This principally applies to opened IFCPP projects, which do not run default initialization.
- The existing `Calculating pile options...` message remains the single loading indication in the right panel. Individual markers do not contain spinners or animation.
- After default selection succeeds, markers switch in one state update to their selected pile symbols.
- A load point receives a red cross only after initialization has completed and no valid default option was returned.
- If analysis or default selection fails, unresolved markers remain neutral rather than becoming red crosses. The existing error presentation reports the failure.

## State And Rendering

The viewer derives a temporary-marker state from the existing analysis/default-selection lifecycle. It must distinguish:

1. unresolved while calculation is pending;
2. resolved with a pile choice;
3. resolved without a valid pile choice;
4. unresolved because calculation failed.

No new domain state is stored in IFCPP. This is transient UI state only. The marker renderer receives enough lifecycle information to avoid interpreting an absent selection as a definitive no-pile result prematurely.

## Visual Style

Pending and failed-unresolved markers use a small light-grey circle with a restrained grey outline. They do not use pile size shapes, tip colours, warning colours, crosses, pulsing, or spinning animation. Selection may still add the normal circular selection outline without changing the marker's neutral meaning.

## Testing

- A pending default-selection state renders an unselected load point as a neutral marker and not as a cross.
- A completed default-selection state with no returned choice renders a red cross.
- A completed state with a returned choice renders the configured pile symbol.
- An analysis/default-selection error leaves unresolved markers neutral.
- Opened IFCPP projects continue to render stored choices immediately and do not enter default initialization.

