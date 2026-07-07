from Palenvenster import afmetingskleuren, vormen_unicode
from Classes import Configuratie
from matplotlib import colors

import tkinter as tk

class Window(tk.Frame):
    
    sort = 'afmeting'
    geometry = "300x600"
    
    def __init__(self, main, master=None):
        
        self.main = main
        self.sondering = self.main.sondering
        self.master = master
        
        tk.Frame(self.master)
        self.master.protocol("WM_DELETE_WINDOW", self.onclose)
        self.master.bind('<Shift_L>', lambda event: setattr(self.main, 
                                                      'shift_is_held', True))
        self.master.bind('<KeyRelease-Shift_L>', lambda event: setattr(self.main, 
                                                      'shift_is_held', False))
        self.init_window()
    
    def init_window(self):
        self.master.geometry(Window.geometry)
        self.master.title(f"Sonderingsmetingen {self.sondering.nummer}")
        self.mark_sondering()
        self.showListbox()
        self.showMenu()
        self.master.bind('<Configure>', self.resize)
    
    def repack(self):
        self.listbox.pack_forget()
        self.showListbox()
        
    def mark_sondering(self):
        self.sondering.plot.set_color('lightblue')
        self.sondering.plot.set_zorder(3)
        self.main.canvas.draw()
    
    def resize(self, event):
        Window.geometry = self.master.winfo_geometry()
        max_length = max([len(str(s)) for s in self.sondering.sonderingsmetingen])
        font_height = int(12*self.listbox.winfo_width() / max_length**2) 
        self.listbox.configure(font="-size -"+str(font_height))
    
    def onclose(self):
        try:
            self.sondering.plot.set_color('lightgrey')
            self.sondering.plot.set_zorder(1)
        except:
            pass
        self.main.canvas.draw()
        self.main.sonderingsvenster = False
        self.master.destroy()
        
    def showListbox(self):
        ppns = list(set([config.ppn for config in Configuratie.mogelijk]))
        ppns.sort(reverse=True)
        
        self.listbox = tk.Listbox(self.master)
        self.listbox.pack(fill='both', expand=True)
        
        sonderingsmetingen = [s for s in self.sondering.sonderingsmetingen if
                        s.ppn not in Configuratie.uitgesloten and 
                        s.afmeting not in Configuratie.uitgesloten]
        
        if Window.sort == 'ppn':
            sonderingsmetingen.sort(key=lambda x: x.afmeting)
            sonderingsmetingen.sort(key=lambda x: -x.ppn)
            
        if Window.sort == 'afmeting':
            sonderingsmetingen.sort(key=lambda x: -x.ppn)
            sonderingsmetingen.sort(key=lambda x: x.afmeting)
        
        if Window.sort == 'belasting':
            sonderingsmetingen.sort(key=lambda x: x.afmeting)
            sonderingsmetingen.sort(key=lambda x: -x.ppn)
            sonderingsmetingen.sort(key=lambda x: x.frd)
            
        for s in sonderingsmetingen:
            if not self.main.legend_switched:
                vorm = vormen_unicode[min(self.main.ppns.index(s.ppn), len(vormen_unicode)-1)]
                kleur = afmetingskleuren[s.afmeting]
            if self.main.legend_switched:
                vorm = vormen_unicode[min(list(self.main.afmetingskleuren.keys()).index(s.afmeting), 
                               len(self.main.vormen)-1)]
                kleur = self.main.ppn_cmap(self.main.ppns.index(s.ppn) / (len(self.main.ppns)-1))
                kleur = colors.to_hex(kleur)
            self.listbox.insert(tk.END, " ".join([str(s), vorm]))
            self.listbox.itemconfig(tk.END, foreground=kleur)
        
        if len(self.main.selected) == 1:
            b = self.main.selected[0]
            if b.huidige_paal:
                if b.huidige_paal in sonderingsmetingen:
                    self.listbox.itemconfig(sonderingsmetingen.index(b.huidige_paal), 
                                background='light blue')
        
        self.listbox.config(width=0, height=0)
    
    def showMenu(self):
        menubar = tk.Menu(self.master)
        sortmenu = tk.Menu(self.master, tearoff=0)
        sortmenu.add_command(label='Sorteer op paalpuntniveau', 
                   command=lambda: self.sorteer('ppn'))
        sortmenu.add_command(label='Sorteer op afmeting', 
                   command=lambda: self.sorteer('afmeting'))
        sortmenu.add_command(label='Sorteer op belasting',
                   command=lambda: self.sorteer('belasting'))
        menubar.add_cascade(label='Sorteren', menu=sortmenu)
        self.master.config(menu=menubar)
    
    def sorteer(self, sort):
        Window.sort = sort
        self.repack()


def sonderingsvenster(main):
    root = tk.Tk()
    app = Window(main, master=root)
    
    return app
    