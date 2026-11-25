# Driving records

Use **Plan > Driving records** to compare driving logs with the pile plan shown
in the viewer. The panel links recorded pile numbers to plan locations and shows
the resulting checks and warnings.

## Import and match files

1. Add one or more CSV or Excel logs. The panel recognizes headings such as
   `paalnummer` (pile number).
2. In **Import settings**, check the detected table, select the header or data
   row, and map the columns. Settings are shared unless you give a file its own
   settings. The panel reports files it cannot read.
3. Check how pile numbers are matched. The default is the plan's pile number
   (`Mark` or `Revit Mark`) when available, and **Location ID** otherwise.
4. Open **Check settings** to adjust the limits for all driving files in the
   project.

The IFCPP project includes the original files and their settings. Reopen
**Driving records** to recalculate the checks against the currently displayed
plan. To remove a file, select it and use the trash button next to the file
picker. Undo restores the file.

## Review warnings and select locations

**All driving records** shows day numbers, matches, and warnings across files.
Day numbers are assigned to distinct recorded dates in chronological order.
Warnings appear first, including nonblank remarks. Clear the warning filter to
include records without a match or with multiple matches. Open a row to see its
source file, measurements, and checks and to locate the matched pile on the
drawing.

Click a location in the viewer to inspect its first registration in the chosen
file scope, even when the warning filter hides that row. This selects a single
location, including when it belongs to a group. Ctrl/Cmd-click toggles individual
locations. Shift-click selects a row range in the table and Shift-drag selects a
rectangle on the drawing. **Follow filter** selects the locations linked to the
visible rows and updates as the filter changes. Selecting locations yourself or
turning the button off ends this behavior.

## Location status

The location uses the most severe result across all linked registrations, even
when the table shows a single file.

| Status | Automatic result |
| --- | --- |
| **Deviation** | At least one pile length or final driving level deviation |
| **Needs review** | One or more other warnings, such as a recorded remark |
| **Good** | At least one check performed and no warnings |
| **Unassessed** | No warnings and no available checks |

Select locations and choose **Good**, **Needs review**, or **Deviation** to set
a manual status. Linked records show a filterable **Manual status** warning.
Add an optional reason and press Enter or leave the field to save it. Shift+Enter
adds a line break. Escape restores the last saved text. **Automatic** clears the
manual status and reason.

Use **Show driving status colors on the map** in the panel or **View > Driving
status colors** in the ribbon to display driving status on the drawing.
Unassessed locations have no status color. The color setting and manual status
edits are saved with the project and support undo and redo.

## What the checks compare

| Check | Method and defaults |
| --- | --- |
| Pile plan | Compares recorded pile size, length, and final NAP level against the reference plan. The plan length is the pile-head level minus the assigned tip level. |
| Final blow count | Defaults to at least 15 blows per full 250 mm increment. |
| Final increment trend | Compares the two half-window averages over the final consecutive full increments. The window defaults to six and accepts any even number of at least two. A drop beyond the configured limit gives a warning. |
| Neighbor comparison | Compares the mean blow count over the final consecutive full 250 mm increments with the median for other piles of the same recorded size across all open logs. Defaults are six increments, three reference piles, and a 10% deviation limit. |
| Blow energy | Checks readings against a per-size target with a shared tolerance, or checks the largest difference between two distinct piles of the same size when no target is set. The window is the final four increments by default. |

The neighbor comparison starts with identical CPT selections. When there are
too few reference piles, **All selected CPTs required** also allows piles with
additional CPTs. **One selected CPT may be missing**, the default, allows those
same references and can broaden the search further to piles missing one of the
selected CPTs, as long as at least one is shared. **Identical selection** uses
exact matches only. Piles need enough usable increments to take part.

Expand the neighbor comparison under **Checks** to see the reference piles, their
final measured tip levels, average blow energy within the configured energy
window, and deviation from the median. Every displayed reference contributes to
the median. The viewer frames the checked pile and its references and marks the
references with gray rings.

For energy checks, shorter logs use the available increments and unnumbered
increments follow source row order. Missing readings within the energy window
stay missing. Checks with incomplete or inconsistent input show **Cannot
assess** when the required comparison cannot be calculated.
