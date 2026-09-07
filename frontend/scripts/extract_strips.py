import sys
import json
import base64
import io
import os
import pdfplumber
from PIL import Image

def extract_and_stack_owner_cards(pdf_path):
    raw_strips = []
    if not os.path.exists(pdf_path):
        return []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for p_idx, page in enumerate(pdf.pages):
                page_strips = []
                for img_dict in page.images:
                    h = img_dict.get('height', 0)
                    img_h = img_dict.get('stream', {}).get('Height', 0)
                    
                    # 台灣電子第一類謄本個資長條圖特徵
                    if (10 < h < 30) or (img_h == 60):
                        try:
                            stream = img_dict['stream']
                            data = stream.get_data()
                            width = stream['Width']
                            height = stream['Height']
                            
                            if len(data) == width * height * 3:
                                img = Image.frombytes('RGB', (width, height), data)
                                page_strips.append({
                                    'page': p_idx + 1,
                                    'y0': float(img_dict.get('y0', 0)),
                                    'width': width,
                                    'height': height,
                                    'img': img
                                })
                        except Exception:
                            pass
                
                # 頁面內依照 y 座標由上而下排序 (y0 大到小)
                page_strips.sort(key=lambda s: s['y0'], reverse=True)
                raw_strips.extend(page_strips)
    except Exception as e:
        sys.stderr.write(f"Error reading PDF strips: {e}\n")
        return []

    # 每 3 條長條圖為一組所有權人個資 (姓名、統編/出生日、住址)
    owner_cards = []
    for i in range(0, len(raw_strips), 3):
        group = raw_strips[i:i+3]
        if not group:
            continue
        
        max_w = max(s['img'].width for s in group)
        total_h = sum(s['img'].height for s in group)
        
        stacked = Image.new('RGB', (max_w, total_h), (255, 255, 255))
        curr_y = 0
        for s in group:
            stacked.paste(s['img'], (0, curr_y))
            curr_y += s['img'].height
        
        buf = io.BytesIO()
        stacked.save(buf, format='PNG')
        b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        
        owner_cards.append({
            'ownerIndex': len(owner_cards),
            'page': group[0]['page'],
            'stripsCount': len(group),
            'base64': b64
        })

    return owner_cards

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'count': 0, 'ownerCards': []}))
        sys.exit(0)
    
    pdf_path = sys.argv[1]
    cards = extract_and_stack_owner_cards(pdf_path)
    print(json.dumps({'count': len(cards), 'ownerCards': cards}))
