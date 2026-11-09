"""Extrait le texte d'un PDF de grille tarifaire (une section « =====PAGE n===== » par page).

Usage (dans un environnement virtuel contenant pypdf) :
    python -m venv .venv && .venv/Scripts/pip install pypdf
    .venv/Scripts/python -I tools/extract-pdf-text.py <entree.pdf> <sortie.txt>

Les PDF sont des documents tiers (non versionnés) : voir data-sources/.
"""
import sys

from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
print("pages", len(reader.pages))
with open(sys.argv[2], "w", encoding="utf-8") as out:
    for i, page in enumerate(reader.pages):
        out.write(f"\n=====PAGE {i + 1}=====\n")
        out.write(page.extract_text() or "")
