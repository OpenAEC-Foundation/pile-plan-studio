# V2 Direction

The next version of Pile Plan Studio should first be a reliable calculation and
decision-support tool for pile options per load point. The core goal is not to
automatically produce an optimal pile plan, but to provide a correct list of
available pile options for a given load point, CPT selection, and set of bearing
capacities.

## Core Requirement

- Each load point must have an explicit set of selected CPTs.
- Available bearing capacities must be linked to the correct CPTs and pile
  configurations.
- A pile option is valid only when every selected CPT has a bearing capacity for
  that configuration.
- The governing CPT is the selected CPT with the lowest total bearing capacity
  for the selected pile configuration and pile count.
- Utilization is the design load divided by the governing total bearing
  capacity.

## Deliberately Not Fixed

The current automatic optimization and iterative heuristic algorithm are legacy
reference behavior, not normative v2 behavior. In practice, the pile plan is
still reviewed and assembled largely by hand. V2 should therefore first support
manual selection, checking, comparison, and decision-making.

The current CPT selection logic is valuable, but not perfect and difficult to
encode as an objective model. V2 must leave room for more flexible selection:
automatic suggestions, manual correction, and possibly multiple selection
strategies later.

## UI Direction

V2 must help users manually compose and check a pile plan. The interface should
not only show a final result, but make the available pile options per load point
transparent.

Important UI goals:

- Show available pile options per load point, including why options are valid or
  invalid.
- Make selected CPTs visible and manually editable.
- Show the governing CPT and utilization for each pile option.
- Allow users to compare pile options by bearing capacity, utilization, cost,
  and constructability.
- Allow future optimization to provide suggestions, without making optimization
  the only way to create a pile plan.

Uniformity is an important design goal. In practice, a pile plan should avoid
using too many different pile types. This means minimizing both the total number
of different pile length and diameter combinations, and the difference between
nearby piles. It should be possible to form areas where the same pile type is
used.

Because this is difficult to model and optimize objectively, v2 does not need to
solve it automatically at first. The UI should support the process instead:
users must be able to select multiple load points, see the pile options shared
by that selection, and apply a choice to the group. The UI is therefore an
interactive design and checking environment, not a black-box optimization button.

## Future Extensions

Optimization can be added later as a separate module. Possible directions
include randomized iteration, simulated annealing, or linear programming. Any
optimization module must build on top of the tested pile option core, not become
entangled with the logic that determines whether an individual pile option is
structurally valid.
