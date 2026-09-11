# Built-in pile-cost defaults

Pile Plan Studio provides an editable built-in cost catalog for initial cost
comparisons. These values are indicative defaults, not project quotations.

## Scope and sources

The defaults are derived from CROW's *Handboek Funderingen – Deel A*, section
A 6100. That source uses a price level of 1 March 2008 and separates fixed
project costs, per-pile costs, material costs, and variable installation costs.
Pile Plan Studio includes only material and variable installation costs in its
volume-based rates:

- square sections are treated as prefabricated concrete piles;
- round sections are treated as vibro piles;
- mobilization, setting out, pile-head processing, testing, and other fixed or
  per-pile costs are excluded.

The CROW rates were updated with the CBS GWW input price index. The nearest
published observation to the CROW price date is April 2008 (`137.2`); December
2025 is the latest definitive year-end observation used here (`208.6`). The
applied factor is therefore `208.6 / 137.2 = 1.5204`.

- [CROW: A 6100 Kosten van funderingen, kelders en bouwputvoorzieningen](https://kennisbank.crow.nl/public/gastgebruiker/FUNT/Handboek_Funderingen_%E2%80%93_Deel_A_(Eurocode_7)/A_6100%C2%A0Kosten_van_funderingen,_kelders_en_bouwputvoorzieningen/64515)
- [CBS: Grond-, weg- en waterbouw; inputprijsindex 2000=100](https://www.cbs.nl/nl-nl/cijfers/detail/81139ned)

## Derivation

CROW bandwidths are represented by their midpoint. Missing pile sizes are
linearly interpolated between the available CROW dimensions. The 273 mm vibro
pile is extrapolated from the 356 mm and 456 mm rates. Per-metre installation
rates are divided by the pile cross-sectional area, added to the material rate,
indexed, and rounded to the nearest EUR 5/m³.

| Shape | Size | Built-in rate |
| --- | ---: | ---: |
| Round | 273 mm | EUR 535/m³ |
| Round | 356 mm | EUR 505/m³ |
| Round | 380 mm | EUR 490/m³ |
| Square | 250 mm | EUR 590/m³ |
| Square | 290 mm | EUR 545/m³ |
| Square | 320 mm | EUR 515/m³ |
| Square | 350 mm | EUR 485/m³ |
| Square | 400 mm | EUR 450/m³ |
| Square | 420 mm | EUR 440/m³ |
| Square | 450 mm | EUR 425/m³ |

Actual pile costs depend on project size, production, soil conditions,
accessibility, market conditions, pile system, and supplier. Existing projects
and personal default catalogs retain their own values when the built-in catalog
changes.
