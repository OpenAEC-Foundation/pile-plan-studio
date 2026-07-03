from Classes import Belastinglocatie, Sondering, Coordinaten
import ImportRFEM
import pandas as pd
import numpy as np
import csv
from Datamap import data_path


def lees_instellingen():
    instellingen = np.array(pd.read_excel(data_path("Sonderingsinstellingen.xlsx"), 
                                          sheet_name=0, header=None))
    return instellingen[0,1], instellingen[1,1], instellingen[2,1]

def importeer():
    ImportRFEM.main()
    #Importeren belastinglocaties
    with open(data_path('Belastinglocaties.csv')) as csvfile:
        csvlist = csv.reader(csvfile, delimiter=',')
        belastinglocaties = list(csvlist)
    
    #Aanmaak van belastinglocatieobjecten
    for i, belastinglocatie in enumerate(belastinglocaties):
        belastinglocaties[i] = Belastinglocatie(*belastinglocatie)
            
    #Importeren sonderingen    
    sonderingen_array = np.array(pd.read_excel(data_path("Sonderingen.xlsx"), 
                                            sheet_name=0, header=None))
    sonderingen_array = np.array([row[0:3] for row in sonderingen_array])
    
    #Aanmaak van sonderingobjecten    
    sonderingen = []
    nummers = [sondering.nummer for sondering in Sondering.instances]
    for sonderingseigenschappen in sonderingen_array:
        nummer, x, y = sonderingseigenschappen
        if nummer in nummers:
            sondering = Sondering.instances[nummers.index(nummer)]
            sondering.x = int(x)
            sondering.y = int(y)
            sondering.coordinaten = Coordinaten(sondering.x, sondering.y)
            sondering.sonderingsmetingen = []
        else:
            sondering = Sondering(*sonderingseigenschappen)
        sonderingen.append(sondering)
            
    #Voeg alle sonderingen toe aan elke belastinglocatie
    for belastinglocatie in belastinglocaties:
        for sondering in sonderingen:
            belastinglocatie.sonderingen.append(sondering)
    
    return belastinglocaties

def sonderingenselectie():
    max_afstand_sondering, monopolie_afstand, max_hoek = lees_instellingen()
    
    belastinglocaties = importeer()
    
    for b in belastinglocaties:

        #Sorteer op afstand
        b.sonderingen.sort(key=lambda x: b.afstand(x))
        
        #Eerste sondering
        s0 = b.sonderingen[0]
    
        #Beperking afstand
        b.sonderingen = [s for s in b.sonderingen \
                   if b.afstand(s) <= max_afstand_sondering]
        
        if not b.sonderingen:
            print(b.afstand(s0))
            
        #Laatst gekozen sondering
        s1_index = 0
        s1 = s0
        
        #De belastinglocatie is nu met één sondering omsloten als:
        omsloten = s1.afstand(b) <= monopolie_afstand
            
        while not omsloten:
            
            s2_opties = b.sonderingen[s1_index+1:]
            
            gekozen=False
            
            #We kiezen in eerste instante de sondering die voldoet aan de
            #voorwaarden met de kortste afstand tot de belastingloctie
            for s2 in s2_opties:            
                hoek = b.hoek(s1, s2)
                
                if hoek < max_hoek:
                    gekozen = s2
                    break
    
            #Als er geen sondering binnen voorwaarden is, kiezen we de sondering
            #die de kleinste hoek heeft
            if not gekozen:
                if s1 != s0:
                    hoek_gekozen = b.hoek(s1, s0)
                else:
                    hoek_gekozen = 360
                
                for s2 in s2_opties:
                    hoek = b.hoek(s1, s2)
                    
                    if hoek < hoek_gekozen:
                        gekozen = s2
                        hoek_gekozen = hoek
                        
                if hoek_gekozen != 360:
                    b.te_grote_hoeken.append(hoek_gekozen)
            
            #Break als er nog steeds geen gekozen sondering is
            if not gekozen:
                laatste_hoek = b.hoek(s1,s0)
                if max_hoek < laatste_hoek < 360:
                    b.te_grote_hoeken.append(laatste_hoek)
                break
            
            b.sonderingen.remove(gekozen)
            b.sonderingen.insert(s1_index+1, gekozen)
            
            s1_index += 1
            s1 = b.sonderingen[s1_index]
            
            omsloten = b.hoek(s1, s0) < max_hoek
        
        #Voeg extra sonderingen toe om rechthoeken te bevorderen
        extra_sonderingen = []
        selectie = b.sonderingen[:s1_index+1]
        niet_gekozen = b.sonderingen[s1_index+1:]
        for i, s1 in enumerate(selectie):
            s3 = selectie[(i+1)%len(selectie)]
            for s2 in niet_gekozen:
                hoek = int(s2.hoek(s1, s3)) 
                if np.abs(hoek-90) < 5 or np.abs(hoek-270) < 5:
                    extra_sonderingen.append(s2)
        
        if b.naam == "Knoop 532":
            print([s.nummer for s in niet_gekozen])
        b.sonderingen = selectie + extra_sonderingen
        b.sonderingen.sort(key=lambda x: b.hoek(s0, x))
    
    return belastinglocaties

if __name__ == "__main__":
    belastinglocaties = sonderingenselectie()
    
    
    
    
    
    


