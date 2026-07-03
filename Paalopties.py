from Classes import Configuratie, Paal, Sonderingsmeting, Palenplan
from Sonderingenselectie import sonderingenselectie

import pandas as pd
import numpy as np
from numpy import inf
from Datamap import data_path
    
def importeer_draagvermogens():

    #Import excel met draagvermogen
    excel_file = data_path("Draagvermogens.xlsx")
    sht_d = pd.read_excel(excel_file, sheet_name=0)
    draagvermogens = list()
    
    for column in range(0, sht_d.shape[1]):
        draagvermogens.append(sht_d.values.T[column].tolist())
    
    return draagvermogens

def vind_mogelijke_configuraties(draagvermogens):
    
    Configuratie.mogelijk = []
    mogelijke_ppns = set()   
    for ppn in draagvermogens[1]:
        mogelijke_ppns.add(ppn)
    mogelijke_ppns = sorted(mogelijke_ppns, reverse = True)
    
    mogelijke_afmetingen = set()
    for afmeting in draagvermogens[2]:
        mogelijke_afmetingen.add(afmeting)
    mogelijke_afmetingen = sorted(mogelijke_afmetingen)

    for ppn in mogelijke_ppns:
        for afmeting in mogelijke_afmetingen:
            configuratie = Configuratie(ppn, afmeting)
            if configuratie not in Configuratie.mogelijk:
                Configuratie.mogelijk.append(configuratie)


def is_paal_optie(belastinglocatie, configuratie, aantal_palen, app):
    
    frd_min = inf
    frd_sondering = None
    for sondering in belastinglocatie.sonderingen:
        frd = configuratie.vind_frd(sondering)
        if frd == 0:
            return(False, 10, None) #10 for inf
        if aantal_palen*frd < frd_min:
            frd_min = aantal_palen * frd
            frd_sondering = sondering
          
    if frd_min != 0:
        optie = belastinglocatie.fed / frd_min <= app.parameters.max_graad
    else:
        optie = False
    return (optie, frd_min, frd_sondering)

def sonderingsmetingen(belastinglocatie, draagvermogens):
    for sondering in belastinglocatie.sonderingen:
               if not sondering.sonderingsmetingen:
                   sondering_indexen = [i for i, x in enumerate(draagvermogens[0])\
                            if int(x) == sondering.nummer]

                   for sondering_index in sondering_indexen:
                       if not np.isnan(draagvermogens[3][sondering_index]):
                           ppn = float(draagvermogens[1][sondering_index])
                           afmeting = int(draagvermogens[2][sondering_index])
                           frd = int(draagvermogens[3][sondering_index])
                           sonderingsmeting = Sonderingsmeting(ppn, afmeting, frd)
                           sondering.sonderingsmetingen.append(sonderingsmeting)

def voeg_palen_toe(belastinglocatie, app):
    for aantal_palen in range(1, app.parameters.max_aantal + 1):
            for configuratie in Configuratie.opties:
                   optie, frd_min, frd_sondering = is_paal_optie(belastinglocatie, 
                                                 configuratie, aantal_palen, app)    
                   benuttingsgraad = belastinglocatie.fed / frd_min
                   paal = Paal(aantal_palen, configuratie.ppn, 
                configuratie.afmeting, benuttingsgraad,
                frd_sondering = frd_sondering)
                
                   if benuttingsgraad == 0:
                       pass
                   elif paal not in belastinglocatie.palen and optie:
                       belastinglocatie.voeg_paal_toe(paal)
                   elif paal not in belastinglocatie.geen_opties:
                       belastinglocatie.geen_opties.append(paal)

def lock(belastinglocaties, app):
    locked = np.array(pd.read_excel(data_path("Vergrendeld.xlsx"), 
                                 sheet_name='Vergrendeld', header=None))
    
    namen = [row[0] for row in locked]
    for b in belastinglocaties:
        if b.naam in namen:
            locked_b = locked[namen.index(b.naam)]
            lockpaal = Paal(*locked_b[1:5])
            optie, frd_min, frd_sondering = is_paal_optie(b, 
                                                 lockpaal.configuratie, 
                                                 lockpaal.aantal, app)
            lockpaal.benuttingsgraad = b.fed / frd_min
            lockpaal.frd_sondering = frd_sondering
            b.locked = True
            b.huidige_paal = lockpaal
            if lockpaal not in b.palen:
                b.palen.append(lockpaal)
            if not optie:            
                b.marked_red = True

def bepaal_uitgesloten_configuraties():
    configuraties = list(np.array(pd.read_excel(data_path("Configuraties.xlsx"), 
                                sheet_name="Configuraties", header=None)))
    waarden = [c[0] for c in configuraties]

    Configuratie.opties = [c for c in Configuratie.mogelijk if \
                        c.ppn not in waarden \
                        and c.afmeting not in waarden]
    Configuratie.uitgesloten = waarden
    
#Vind alle paalconfiguraties die voor elke belastinglocatie voldoen
def vind_paalopties(belastinglocaties, draagvermogens, app):
    
       vind_mogelijke_configuraties(draagvermogens)
       bepaal_uitgesloten_configuraties()
    
       for belastinglocatie in belastinglocaties:    
           
            sonderingsmetingen(belastinglocatie, draagvermogens)
            voeg_palen_toe(belastinglocatie, app)
       
       lock(belastinglocaties, app)

       return belastinglocaties

def paalopties(app):
    draagvermogens = importeer_draagvermogens()
    belastinglocaties = sonderingenselectie()
    palenplan = Palenplan(vind_paalopties(belastinglocaties, 
                                       draagvermogens, app))
    return palenplan

