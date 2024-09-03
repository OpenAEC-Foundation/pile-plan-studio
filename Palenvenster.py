from Classes import Configuratie, Paal
from Paalopties import is_paal_optie
from time import time
import tkinter as tk
from matplotlib import colors

afmetingskleuren = {
    220: "yellow",
    250: "forestgreen",
    273: "yellowgreen",
    290: "blue",
    320: "magenta",
    350: "darkviolet",
    356: "orchid",
    380: "lightsteelblue",
    400: "red",
    420: "saddlebrown",
    450: "orange"
    }

vormen = ["o", "s", "^", "D", "*", "p", "d", "P", "v", "<", ">", "8", 
          '$\\bowtie$', '$\\ast$', '$s$', '$\\#$', '$\\$$', 
          '$&$', '$-$', '$=$', '$<$', '$>$', 'X',]

vormen_unicode = ['\N{BLACK LARGE CIRCLE}', 
                  '\N{BLACK MEDIUM SQUARE}', 
                  '\N{BLACK UP-POINTING TRIANGLE}', 
                  '\N{BLACK DIAMOND CENTRED}', 
                  '\N{BLACK STAR}', 
                  '\N{BLACK PENTAGON}', 
                  '\N{BLACK DIAMOND SUIT}',
                  '\N{HEAVY GREEK CROSS}', 
                  '\N{BLACK DOWN-POINTING TRIANGLE}',
                  '\N{BLACK LEFT-POINTING TRIANGLE}',
                  '\N{BLACK RIGHT-POINTING TRIANGLE}',
                  '\N{HORIZONTAL BLACK OCTAGON}',
                  '\N{BOWTIE}',
                  '\N{HEAVY ASTERISK}',
                  '\N{MATHEMATICAL BOLD SCRIPT CAPITAL S}',
                  '#', 
                  '$',
                  '&',
                  '-',
                  '=',
                  '<',
                  '>',
                  '\N{CROSS MARK}']

class Window(tk.Frame):
    
    sort = 'afmeting'
    select = 'beide'
    geometry = "400x800"
    
    def __init__(self, main, master=None):

        self.bs = main.selected
        self.bs = [b for b in self.bs if b.palen]	
        self.main = main
        self.master = master
        self.history = []
        self.undo_visible = False
        self.save_current()
        
        self.master.protocol("WM_DELETE_WINDOW", self.onclose)
        self.init_window()
        
    
    def onclose(self, draw=True, empty=True):
        if empty:
            self.main.selected = []
            self.main.ppnselect = []
            self.main.afmetingselect = []
            self.main.first_selected = False
        for b in self.bs:
            b.marker.set_visible(False)
        for line in self.main.sondering_lines:
            try:
                line.remove()
            except:
                pass
        try:
            self.marked_sondering.plot.set_color('lightgrey')
            self.marked_sondering.plot.set_zorder(1)
        except:
            pass
        if draw:
            self.main.update_plot()
            self.main.canvas.draw()
        self.main.save_current()
        self.main.app = False
        self.master.destroy()
    
    def resize(self, event):
        Window.geometry = self.master.winfo_geometry()
        if Window.select == 'beide':
            height = 40
        else:
            height = 30
        if self.palen:
            max_length = max([len(str(p)) for p in self.palen])
            font_height = int(height*self.listbox.winfo_width() / max_length**2) 
            self.listbox.configure(font="-size -"+str(font_height))
    
    def init_window(self):
        
        self.master.geometry(Window.geometry)
        title = "Paalopties "
        if len(self.bs) == 1:
            title += self.bs[0].naam
        self.master.title(title)
        
        self.master.columnconfigure(0, weight=1)
        self.master.grid_rowconfigure(0, weight=1)
        self.showListbox()
        self.showMenu()
        self.master.bind('<Configure>', self.resize)
        self.master.bind('<Shift_L>', lambda event: setattr(self.main, 
                                                      'shift_is_held', True))
        self.master.bind('<KeyRelease-Shift_L>', lambda event: setattr(self.main, 
                                                      'shift_is_held', False))
        self.master.bind('<Escape>', self.onclose)
        
        if self.bs:
            self.locked = True
        else:
            self.locked = False
        for b in self.bs:
            if not b.locked:
                self.locked = False
        self.showFED()
        self.showToggle()
        self.showAantalButtons()
        if len(self.bs) == 1:
            self.marked_sondering = None
            self.mark_sondering(self.bs[0].huidige_paal.frd_sondering)
        self.main.canvas.blit(self.main.ax.bbox)
    
    def mark_sondering(self, frd_sondering):
        if self.main.sonderingen_visible:
            if self.marked_sondering:
                self.marked_sondering.plot.set_color('lightgrey')
                self.marked_sondering.plot.set_zorder(1)
            if frd_sondering:
                self.marked_sondering = self.main.sonderingen[self.main.sonderingen.index(
                    frd_sondering)]
                self.marked_sondering.plot.set_color('darkred')
                self.marked_sondering.plot.set_zorder(3)
            self.main.ax.draw_artist(self.marked_sondering.plot)
            self.main.ax.draw_artist(self.marked_sondering.nummer_text)
        
    def repack(self):
        self.listbox.grid_forget()
        self.locktoggle.grid_forget()
        if self.aantal_plus:
            self.aantal_plus.grid_forget()
        if self.aantal_min:
            self.aantal_min.grid_forget()
        if len(self.bs) == 1:
            self.fed_text.grid_forget()
        if self.undo_visible:
            self.undobutton.grid_forget()
        self.bs = self.main.selected
        if len(self.bs) == 1:
            self.mark_sondering(self.bs[0].huidige_paal.frd_sondering)
        self.showListbox()
        self.showToggle()
        self.showAantalButtons()
        self.showFED()
        if self.undo_visible:
            self.showUndo()
    
    def showFED(self):
        een_fed = True
        fed = self.bs[0].fed
        for b in self.bs:
            if b.fed != fed:
                een_fed = False
        if een_fed:
            self.fed_text = tk.Label(self.master, text=str(fed))
            self.fed_text.grid(row=1, column=1, sticky='e')
    
    def showToggle(self):
        text = ['\N{LOCK}', '\N{KEY}'][int(self.locked)]
        self.locktoggle = tk.Button(self.master, text=text, command=self.toggle_lock)
        self.locktoggle.grid(row=2, column=1, sticky='e')
        
    def toggle_lock(self):
        self.locked = not self.locked
        if self.locked:
            self.locktoggle.config(text='\N{KEY}')
            self.main.lock(self.bs)
        else:
            self.locktoggle.config(text='\N{LOCK}')
            self.main.unlock(self.bs)
        self.save_current()
        self.main.canvas.draw()
        
    def showUndo(self):
        text = '\N{ANTICLOCKWISE GAPPED CIRCLE ARROW}'
        self.undobutton = tk.Button(self.master, text=text, command=self.undo)
        self.undobutton.grid(row=0, column=1, sticky='ne')
        self.undo_visible = True
    
    def undo(self):
        self.history.pop()
        palen, locked, marked = self.history[-1]
        self.main.unlock(self.bs)
        for b, paal in zip(self.bs, palen):
            self.main.verander_paal(b, paal)
        self.main.lock(locked)
        for b in self.bs:
            b.red_marker.set_visible(b in marked)
        try:
            self.marked_sondering.plot.set_color('lightgrey')
            self.marked_sondering.plot.set_zorder(1)
        except:
            pass
        if len(self.bs) == 1:
                    self.mark_sondering(self.bs[0].huidige_paal.frd_sondering)
        self.main.update_plot()
        self.main.canvas.draw()
        self.repack()
        
        if len(self.history) <= 1:
            self.undo_visible = False
            self.undobutton.grid_forget()
    
    def save_current(self):
        palen = [b.huidige_paal for b in self.bs]
        locked = [b for b in self.bs if b.locked]
        marked = [b for b in self.bs if b.marked_red]
        self.history.append([palen, locked, marked])
        if len(self.history) > 1:
            self.showUndo()
        
    def showListbox(self):
        
        self.listbox = tk.Listbox(self.master, activestyle='none',
                                  selectmode = 'EXTENDED')
        self.listbox.grid(row=0, column=0, rowspan=6, sticky='nesw')

        if Window.select == 'beide':
            paallijsten = [b.palen for b in self.bs]
            self.paalopties = list(set(paallijsten[0]).intersection(*paallijsten))
            geen_optieslijsten = [b.geen_opties for b in self.bs]
            self.geen_opties = list(set().union(*geen_optieslijsten))
            
            for paal in self.paalopties:
                if paal in self.geen_opties:
                    self.geen_opties.pop(self.geen_opties.index(paal))
                
            self.palen = self.paalopties + self.geen_opties
            
            if len(self.bs) > 1:
                totaal_palen = []
                for p in self.palen:
                    palen = []
                    for b in self.bs:
                        alle_palen = b.palen + b.geen_opties
                        palen.append(alle_palen[alle_palen.index(p)])
                    aantal = sum([p.aantal for p in palen])
                    benuttingsgraad = max([p.benuttingsgraad for p in palen])
                    totaal_paal = Paal(aantal, p.ppn, p.afmeting, benuttingsgraad)
                    totaal_palen.append(totaal_paal)
                self.palen = totaal_palen
                    
            self.palen.sort(key=lambda x: x.kosten)
            if Window.sort == 'aantal':
                self.palen.sort(key=lambda x: x.aantal)
            if Window.sort == 'ppn':
                self.palen.sort(key=lambda x: -x.ppn)
            if Window.sort == 'afmeting':
                self.palen.sort(key=lambda x: x.afmeting)
            if Window.sort == 'benuttingsgraad':
                self.palen.sort(key=lambda x: x.benuttingsgraad)
        
            for p in self.palen:
                    
                if not self.main.legend_switched:
                    vorm = vormen_unicode[min(self.main.ppns.index(p.ppn), len(vormen_unicode)-1)]
                    kleur = afmetingskleuren[p.afmeting]
                if self.main.legend_switched:
                    vorm = vormen_unicode[min(self.main.afmetingen.index(p.afmeting), 
                                   len(self.main.vormen)-1)]
                    kleur = self.main.ppn_cmap(self.main.ppns.index(p.ppn) / (len(self.main.ppns)-1))
                    kleur = colors.to_hex(kleur)
                    
                self.listbox.insert(tk.END, " ".join([str(p), vorm]))
                
                if p in self.paalopties:
                    self.listbox.itemconfig(tk.END, background='white')
                if p in self.geen_opties:
                    self.listbox.itemconfig(tk.END, background='lightgrey')
                        
                for b in self.bs:
                    if p == b.huidige_paal and p in b.palen:
                        self.listbox.itemconfig(tk.END, background='light blue')
                for b in self.bs:
                    if p == b.huidige_paal and p not in b.palen:
                        self.listbox.itemconfig(tk.END, background='#ffb8b8') #red
                
                self.listbox.itemconfig(tk.END, foreground=kleur)
                
        if Window.select == 'ppn':
            ppnlijsten = [[p.ppn for p in b.palen] for b in self.bs]
            self.ppnopties = list(set(ppnlijsten[0]).intersection(*ppnlijsten))
            totaal_palen = []
            for ppn in self.ppnopties:
                palen = []
                for b in self.bs:
                    for p in b.palen:
                        if p.ppn == ppn:
                            palen.append(p)
                            break
                aantal = sum([p.aantal for p in palen])
                benuttingsgraad = max([p.benuttingsgraad for p in palen])
                kosten = sum([p.kosten for p in palen])
                totaal_paal = Paal(aantal, ppn, '', benuttingsgraad, kosten)
                totaal_palen.append(totaal_paal)
            self.palen = totaal_palen
            
            self.palen.sort(key=lambda x: x.kosten)
            if Window.sort == 'aantal':
                self.palen.sort(key=lambda x: x.aantal)
            if Window.sort == 'ppn' or Window.sort == 'afmeting':
                self.palen.sort(key=lambda x: -x.ppn)
            if Window.sort == 'benuttingsgraad':
                self.palen.sort(key=lambda x: x.benuttingsgraad)
                
            for p in self.palen:
                    
                if not self.main.legend_switched:
                    vorm = vormen_unicode[min(self.main.ppns.index(p.ppn), len(vormen_unicode)-1)]
                    kleur = 'black'
                    
                if self.main.legend_switched:
                    vorm = ''
                    kleur = self.main.ppn_cmap(self.main.ppns.index(p.ppn) / (len(self.main.ppns)-1))
                    kleur = colors.to_hex(kleur)
                    
                self.listbox.insert(tk.END, " ".join([str(p), vorm]))
                self.listbox.itemconfig(tk.END, background='white')
                        
                for b in self.bs:
                    if p.ppn == b.huidige_paal.ppn:
                        self.listbox.itemconfig(tk.END, background='light blue')
                
                self.listbox.itemconfig(tk.END, foreground=kleur)
            
        if Window.select == 'afmeting':
            afmetingslijsten = [[p.afmeting for p in b.palen] for b in self.bs]
            self.afmetingsopties = list(set(afmetingslijsten[0]).intersection(*afmetingslijsten))
            totaal_palen = []
            for afmeting in self.afmetingsopties:
                palen = []
                for b in self.bs:
                    for p in b.palen:
                        if p.afmeting == afmeting:
                            palen.append(p)
                            break
                aantal = sum([p.aantal for p in palen])
                benuttingsgraad = max([p.benuttingsgraad for p in palen])
                kosten = sum([p.kosten for p in palen])
                totaal_paal = Paal(aantal, '', afmeting, benuttingsgraad, kosten)
                totaal_palen.append(totaal_paal)
            self.palen = totaal_palen
            
            self.palen.sort(key=lambda x: x.kosten)
            if Window.sort == 'aantal':
                self.palen.sort(key=lambda x: x.aantal)
            if Window.sort == 'ppn' or Window.sort == 'afmeting':
                self.palen.sort(key=lambda x: x.afmeting)
            if Window.sort == 'benuttingsgraad':
                self.palen.sort(key=lambda x: x.benuttingsgraad)
                
            for p in self.palen:
                    
                if not self.main.legend_switched:
                    vorm = ''
                    kleur = afmetingskleuren[p.afmeting]
                    
                if self.main.legend_switched:
                    kleur = colors.to_hex(kleur)
                    vorm = vormen_unicode[min(self.main.afmetingen.index(p.afmeting), 
                                   len(self.main.vormen)-1)]
                    kleur = 'black'
                    
                self.listbox.insert(tk.END, " ".join([str(p), vorm]))
                self.listbox.itemconfig(tk.END, background='white')
                        
                for b in self.bs:
                    if p.afmeting == b.huidige_paal.afmeting:
                        self.listbox.itemconfig(tk.END, background='light blue')
                
                self.listbox.itemconfig(tk.END, foreground=kleur)
            
        self.listbox.bind('<<ListboxSelect>>', self.onselectListItem)
        self.listbox.bind('<Shift-Button-1>', self.onShiftSelectListItem)
        self.listbox.bind('<<ListboxSelected>>', lambda e: self.master.focus())
        self.listbox.config(width=0, height=0)
    
    def onselectListItem(self, event):
        selection = self.listbox.curselection()
        if selection:
            index = int(selection[0])
            self.listbox.selection_clear(index)
            
            if Window.select == 'beide':
                paal = self.palen[index]
                if any([b.huidige_paal != paal for b in self.bs]):
                    locked = [b for b in self.bs if b.locked]
                    self.main.unlock(locked)
                    for b in self.bs:
                        alle_palen = b.palen + b.geen_opties
                        self.main.verander_paal(b, alle_palen[alle_palen.index(paal)])
                    self.main.lock(locked)
                    
                    if len(self.bs) == 1:
                        self.mark_sondering(paal.frd_sondering)
    
                    for p in self.palen:
                        if p in self.geen_opties:
                            self.listbox.itemconfig(self.palen.index(p), 
                                  background='lightgrey')
                        else:
                            self.listbox.itemconfig(self.palen.index(p),
                                  background='white')
                            
                    if paal in self.paalopties:
                        self.listbox.itemconfig(self.palen.index(paal), 
                                  background='light blue')
                        for b in self.bs:
                            b.red_marker.set_visible(False)
                    else:
                        self.listbox.itemconfig(self.palen.index(paal), 
                                  background='#ffb8b8') #red
                        for b in self.bs:
                            if paal not in b.palen:
                                b.red_marker.set_visible(True)      
                    self.main.update_plot()
                    self.main.canvas.draw()
                    self.save_current()
            if Window.select == 'ppn':
                paal = self.palen[index]
                ppn = paal.ppn
                if any([b.huidige_paal.ppn != ppn or b.huidige_paal in b.geen_opties
                        for b in self.bs]):
                    locked = [b for b in self.bs if b.locked]
                    self.main.unlock(locked)
                    for b in self.bs:
                        for p in b.palen:
                            if p.ppn == ppn:
                                self.main.verander_paal(b, p)
                                break
                    self.main.lock(locked)
                    
                    if len(self.bs) == 1:
                        for p in b.palen:
                            if p.ppn == ppn:
                                self.mark_sondering(p.frd_sondering)
                    
                    for p in self.palen:
                        if p.ppn == ppn:
                            self.listbox.itemconfig(self.palen.index(p),
                                                background = 'light blue')
                        else:
                            self.listbox.itemconfig(self.palen.index(p),
                                                background = 'white')
                            
                    for b in self.bs:
                        b.red_marker.set_visible(False)
    
                    self.main.update_plot()
                    self.main.canvas.draw()
                    self.save_current()
                
                    
            if Window.select == 'afmeting':
                paal = self.palen[index]
                afmeting = paal.afmeting
                if any([b.huidige_paal.afmeting != afmeting or \
                        b.huidige_paal in b.geen_opties
                        for b in self.bs]):
                    locked = [b for b in self.bs if b.locked]
                    self.main.unlock(locked)
                    for b in self.bs:
                        for p in b.palen:
                            if p.afmeting == afmeting:
                                self.main.verander_paal(b, p)
                                break
                    self.main.lock(locked)
                    
                    if len(self.bs) == 1:
                        for p in b.palen:
                            if p.afmeting == afmeting:
                                self.mark_sondering(p.frd_sondering)
                    
                    for p in self.palen:
                        if p.afmeting == afmeting:
                            self.listbox.itemconfig(self.palen.index(p),
                                                background = 'light blue')
                        else:
                            self.listbox.itemconfig(self.palen.index(p),
                                                background = 'white')
                            
                    for b in self.bs:
                        b.red_marker.set_visible(False)
    
                    self.main.update_plot()
                    self.main.canvas.draw()
                    self.save_current()
    
    def onShiftSelectListItem(self, event):
        index = self.listbox.index("@%s,%s" % (event.x, event.y))
        paal = self.palen[index]
        if Window.select == 'beide':
            self.main.selectie_waarde([paal.ppn, paal.afmeting], clear=True)
        if Window.select == 'ppn':
            self.main.selectie_waarde([paal.ppn], clear=True)
        if Window.select == 'afmeting':
            self.main.selectie_waarde([paal.afmeting], clear=True)
                
    def showMenu(self):
        menubar = tk.Menu(self.master)
        sortmenu = tk.Menu(self.master, tearoff=0)
        sortmenu.add_command(label='Sorteer op aantal palen', 
                   command=lambda: self.sorteer('aantal'))
        sortmenu.add_command(label='Sorteer op paalpuntniveau', 
                   command=lambda: self.sorteer('ppn'))
        sortmenu.add_command(label='Sorteer op afmeting', 
                   command=lambda: self.sorteer('afmeting'))
        sortmenu.add_command(label='Sorteer op kosten', 
                   command=lambda: self.sorteer('kosten'))
        sortmenu.add_command(label='Sorteer op benuttingsgraad',
                   command=lambda: self.sorteer('benuttingsgraad'))
        menubar.add_cascade(label='Sorteren', menu=sortmenu)
        
        selectmenu = tk.Menu(self.master, tearoff=0)
        selectmenu.add_command(label='Selecteer op paalpuntniveau en afmeting',
                               command =lambda:self.selecteer('beide'))
        selectmenu.add_command(label='Selecteer op paalpuntniveau',
                               command = lambda: self.selecteer('ppn'))
        selectmenu.add_command(label='Selecteer op afmeting',
                            command = lambda: self.selecteer('afmeting'))
        menubar.add_cascade(label='Selecteren', menu=selectmenu)
        self.master.config(menu=menubar)
    
    def sorteer(self, sort):
        Window.sort = sort
        self.repack()
    
    def selecteer(self, select):
        Window.select = select
        self.repack()
        
    def showAantalButtons(self):
        if len(self.bs) == 1 and self.bs[0].palen and Window.select == 'beide':
            b = self.bs[0]
            
            benuttingsgraad_plus = b.fed / is_paal_optie(b, b.huidige_paal.configuratie,
                                   b.huidige_paal.aantal+1, self.main)[1]
            self.aantal_plus = tk.Button(self.master, text='+', 
                                command=lambda: self.verander_aantal(1, benuttingsgraad_plus))
            self.aantal_plus.grid(row=3, column=1, sticky='e')
            
            if b.huidige_paal.aantal > 1:
                optie, frd_min, frd_sondering = is_paal_optie(b, b.huidige_paal.configuratie, 
                             b.huidige_paal.aantal-1, self.main)
    
                if frd_min != 0:
                    benuttingsgraad_min = b.fed / frd_min
                else:
                    benuttingsgraad_min = 10
            
                self.aantal_min = tk.Button(self.master, text='-', 
                                command=lambda: self.verander_aantal(-1, 
                                             benuttingsgraad_min))
                self.aantal_min.grid(row=4, column=1, sticky='e')
                self.aantal_min_optie = optie
                
            else:
                self.aantal_min = False
                self.aantal_min_optie = False
                
        else:
            self.aantal_plus = False
            self.aantal_min = False
            self.aantal_min_optie = False
    
    def verander_aantal(self, verandering, benuttingsgraad):
        #Update paal
        self.bs[0].huidige_paal.aantal += verandering
        self.bs[0].huidige_paal.benuttingsgraad = benuttingsgraad
        self.bs[0].huidige_paal.kosten = self.bs[0].huidige_paal.get_kosten()
        
        #Update plot
        self.bs[0].aantal_text.set_text(self.bs[0].huidige_paal.aantal)
        self.bs[0].aantal_text.set_visible(self.bs[0].huidige_paal.aantal>1)
        
        #Update listbox
        p = self.bs[0].huidige_paal
        index = self.palen.index(p)
        self.listbox.delete(index)
        if not self.main.legend_switched:
            vorm = vormen_unicode[min(self.main.ppns.index(p.ppn), len(vormen_unicode)-1)]
            kleur = afmetingskleuren[p.afmeting]
        if self.main.legend_switched:
            vorm = vormen_unicode[min(self.main.afmetingen.index(p.afmeting), 
                               len(self.main.vormen)-1)]
            kleur = self.main.ppn_cmap(self.main.ppns.index(p.ppn) / (len(self.main.ppns)-1))
            kleur = colors.to_hex(kleur)
            
        self.listbox.insert(index, " ".join([str(p), vorm]))
        
        
        if verandering == 1:
            self.listbox.itemconfig(index, foreground=kleur, background='light blue')
            if not self.aantal_min_optie:
                self.bs[0].red_marker.set_visible(False)
        if verandering == -1:
            if self.aantal_min_optie:
                self.listbox.itemconfig(index, foreground=kleur, background='light blue')
            else:
                self.listbox.itemconfig(index, foreground=kleur, background='#ffb8b8') #red
                self.bs[0].red_marker.set_visible(True)    
            
        self.main.update_plot()
        self.main.canvas.draw()
        self.save_current()
        
        #Update aantalbuttons
        if self.aantal_min:
            self.aantal_min.grid_forget()
        if self.aantal_plus:
            self.aantal_plus.grid_forget()
        self.showAantalButtons()
        

def palenvenster(main):
    
    root = tk.Tk()
    app = Window(main, master=root)
    
    return app
    
    
