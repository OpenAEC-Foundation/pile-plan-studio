import pandas as pd
import numpy as np
import csv
from Datamap import data_path

excel_file = 'Export RFEM.xlsx'


def import_rfem():
    coordinatensheet = np.array(pd.read_excel(data_path(excel_file), sheet_name=0))[1:]
    belastingensheet = np.array(pd.read_excel(data_path(excel_file), sheet_name=1))[1:]
    
    coordinatenknopen = [rij[0] for rij in coordinatensheet if not 
                      np.isnan(rij[4]) and not np.isnan(rij[5])]
    
    alle_coordinaten = [(int(round(rij[4]*1e3, 0)), int(round(rij[5]*1e3, 0)))\
                     for rij in coordinatensheet if not np.isnan(rij[4]) and\
                         not np.isnan(rij[5])]
    
    belastingenknopen = [rij[0] for rij in belastingensheet if not np.isnan(rij[0])]
    alle_belastingen = [rij[4] for rij in belastingensheet if rij[1] in ["Min PZ", "Min PZ'"]]
    knopen = [knoop for knoop in belastingenknopen if knoop in coordinatenknopen]
    geen_coordinaat_knopen = [knoop for knoop in belastingenknopen \
                           if knoop not in coordinatenknopen]
        
    if geen_coordinaat_knopen:
        print(geen_coordinaat_knopen)
    
    coordinaten = [alle_coordinaten[index] for index in range(len(\
                 alle_coordinaten)) if coordinatenknopen[index] in knopen]
    
    belastingen = [abs(alle_belastingen[index]) for index in range(len(\
                   alle_belastingen)) if belastingenknopen[index] in knopen]
    
    return knopen, coordinaten, belastingen

def write_csv(knopen, coordinaten, belastingen):
    with open(data_path('Belastinglocaties.csv'), mode='w', 
           newline = '') as file:
        writer = csv.writer(file, delimiter=',')
        for i in range(len(knopen)):
            row = [knopen[i], *coordinaten[i], belastingen[i]]
            writer.writerow([str(j) for j in row])

def main():
    knopen, coordinaten, belastingen = import_rfem()
    write_csv(knopen, coordinaten, belastingen)
    
if __name__ == "__main__":
    main()
    

        
        




    
    

    
    
