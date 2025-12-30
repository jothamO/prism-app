import pdfplumber
import sys

pdf_path = "Nigeria-Tax-Act-2025.pdf"

with pdfplumber.open(pdf_path) as pdf:
    print(f"Total pages: {len(pdf.pages)}")
    
    # Extract and print first 15 pages to understand structure
    for i, page in enumerate(pdf.pages[:15]):
        text = page.extract_text() or ""
        print(f"\n--- PAGE {i+1} ---\n{text[:2000]}")
