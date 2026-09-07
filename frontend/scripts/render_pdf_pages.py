import sys
import json
import base64
import io
import os
import pdfplumber
from PIL import Image

def render_pdf_pages(pdf_path, start_page=1, end_page=None, dpi=150):
    if not os.path.exists(pdf_path):
        return {"error": f"File not found: {pdf_path}", "totalPages": 0, "pages": []}

    results = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            last_page = min(total_pages, end_page) if end_page else total_pages
            
            for p_idx in range(start_page - 1, last_page):
                page = pdf.pages[p_idx]
                page_img = page.to_image(resolution=dpi)
                
                # 轉為 RGB JPEG 減少記憶體與網路傳輸體積
                pil_img = page_img.original.convert("RGB")
                buffered = io.BytesIO()
                pil_img.save(buffered, format="JPEG", quality=85)
                b64_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                
                results.append({
                    "pageNumber": p_idx + 1,
                    "base64": b64_str
                })

            return {
                "totalPages": total_pages,
                "pages": results
            }
    except Exception as e:
        return {"error": str(e), "totalPages": 0, "pages": []}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No PDF path provided"}))
        sys.exit(1)

    pdf_file = sys.argv[1]
    start_p = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    end_p = int(sys.argv[3]) if len(sys.argv) > 3 else None

    res = render_pdf_pages(pdf_file, start_page=start_p, end_page=end_p)
    print(json.dumps(res))
