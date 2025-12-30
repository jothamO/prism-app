import pypdf
import sys

pdf_path = "Nigeria-Tax-Act-2025.pdf"

try:
    reader = pypdf.PdfReader(pdf_path)
    print(f"Total pages: {len(reader.pages)}")
    
    # Extract only first 5 pages for a quick check
    for i in range(min(5, len(reader.pages))):
        page = reader.pages[i]
        text = page.extract_text()
        print(f"\n--- PAGE {i+1} ---\n{text}")
        
except Exception as e:
    print(f"Error: {e}")
