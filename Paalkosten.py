
import math
import pandas as pd
import numpy as np

sheet = np.array(pd.read_excel('Paalkosten.xlsx', sheet_name=0))

rond = [row[0] for row in sheet if row[1] == 'rond']
-1.
kuub_kosten_dict = {row[0]: row[2] for row in sheet}

peil = sheet[0, 3]
extra_kosten_paal = sheet[0, 4]

def paalkosten(configuratie, aantal_palen):
    
    paallengte = abs(peil - configuratie.ppn)
    afmeting = configuratie.afmeting

    if afmeting in rond:
        oppervlakte = 0.00000025 * math.pi * (afmeting/2)**2

    else:
        oppervlakte = (0.001*afmeting)**2

    kuub_kosten = kuub_kosten_dict[afmeting] * aantal_palen * paallengte * oppervlakte
    extra_kosten = (aantal_palen-1) * extra_kosten_paal

    return int(kuub_kosten+extra_kosten)