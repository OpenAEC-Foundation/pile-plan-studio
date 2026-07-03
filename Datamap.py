import os
import tkinter as tk
from tkinter import filedialog


DEFAULT_DATAMAP = "sample_data"
_datamap = None


def set_datamap(datamap):
    global _datamap
    gekozen_datamap = datamap.strip() if datamap else DEFAULT_DATAMAP
    _datamap = os.path.abspath(os.path.expanduser(gekozen_datamap))
    return _datamap


def get_datamap():
    if _datamap is None:
        return set_datamap(DEFAULT_DATAMAP)
    return _datamap


def reset_datamap():
    global _datamap
    _datamap = None


def data_path(bestandsnaam):
    return os.path.join(get_datamap(), bestandsnaam)


def vraag_datamap(master=None):
    eigen_root = None
    if master is None:
        eigen_root = tk.Tk()
        eigen_root.withdraw()
        master = eigen_root

    standaard_datamap = os.path.abspath(DEFAULT_DATAMAP)
    datamap = filedialog.askdirectory(
        parent=master,
        initialdir=standaard_datamap,
        mustexist=True,
        title="Kies de map met databestanden",
    )

    if eigen_root is not None:
        eigen_root.destroy()

    return set_datamap(datamap)
