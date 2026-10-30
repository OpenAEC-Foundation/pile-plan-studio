# Sample project: compression and tension

The bundled IFCPP sample includes 328 load points, 77 CPTs, its original compression advice and costs, and tension demands from the accompanying `Export RFEM.xlsx`. Thirty-three locations have positive tension demand; the other 295 have known zero tension.

**Tension resistances are fictional software-test data. Do not use them for foundation design.** For every unique compression-advice key (CPT, pile size, tip level), the test resistance is `max(1, round(0.10 * effective compression resistance)) kN`. The percentage has no geotechnical basis. There are 2,208 unique tension rows. The original 2,340 compression rows include overlapping keys; the synthetic rows use the same last-row interpretation as the existing core index.

One base plan uses the application's cheapest valid default assignment, checking compression and imported tension for each effective load-point group. All 303 assigned locations satisfy both checks. Twenty-five previously unresolved source locations remain open. Optimization includes tension and is configured to skip unsolvable locations.

Geometry, compression loads and costs are unchanged. The original source spreadsheets remain unchanged. Refreshing only the original compression advice does not regenerate the fictional tension values. Ordinary projects do not acquire synthetic resistances; this data is confined to this sample.
