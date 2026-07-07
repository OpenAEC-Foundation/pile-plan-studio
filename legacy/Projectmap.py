import os
import tkinter as tk
from tkinter import filedialog


DEFAULT_PROJECTMAP = "sample_project"
_projectmap = None


def set_projectmap(projectmap):
    global _projectmap
    gekozen_projectmap = projectmap.strip() if projectmap else DEFAULT_PROJECTMAP
    _projectmap = os.path.abspath(os.path.expanduser(gekozen_projectmap))
    return _projectmap


def get_projectmap():
    if _projectmap is None:
        return set_projectmap(DEFAULT_PROJECTMAP)
    return _projectmap


def reset_projectmap():
    global _projectmap
    _projectmap = None


def project_path(bestandsnaam):
    return os.path.join(get_projectmap(), bestandsnaam)


def vraag_projectmap(master=None):
    eigen_root = None
    if master is None:
        eigen_root = tk.Tk()
        eigen_root.withdraw()
        master = eigen_root

    standaard_projectmap = os.path.abspath(DEFAULT_PROJECTMAP)
    projectmap = filedialog.askdirectory(
        parent=master,
        initialdir=standaard_projectmap,
        mustexist=True,
        title="Kies de projectmap",
    )

    if eigen_root is not None:
        eigen_root.destroy()

    return set_projectmap(projectmap)
