"""
DMRC Metro Ticket PDF Generator - Premium Edition
Landscape A5 boarding-pass style
"""

from reportlab.lib.pagesizes import A5, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from io import BytesIO
from PIL import Image
import base64, sys, json

W, H = landscape(A5)

# Colors
C_NAVY  = colors.HexColor('#0B1F4B')
C_BLUE  = colors.HexColor('#1A56A0')
C_SKY   = colors.HexColor('#3B9EE8')
C_RED   = colors.HexColor('#D62828')
C_GOLD  = colors.HexColor('#F7B731')
C_WHITE = colors.white
C_OFF   = colors.HexColor('#F4F7FC')
C_LGRAY = colors.HexColor('#DDE5F0')
C_MGRAY = colors.HexColor('#8899B0')
C_DGRAY = colors.HexColor('#2D3A4A')
C_GREEN = colors.HexColor('#1DB954')

def fill(c, col):   c.setFillColor(col)
def stroke(c, col, w=1): c.setStrokeColor(col); c.setLineWidth(w)
def font(c, bold=False, size=10): c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)

def rect_fill(c, x, y, w, h, col):
    fill(c, col); c.rect(x, y, w, h, fill=1, stroke=0)

def rounded_box(c, x, y, w, h, r, fill_col=None, stroke_col=None, lw=1):
    p = c.beginPath()
    p.moveTo(x+r,y); p.lineTo(x+w-r,y)
    p.arcTo(x+w-2*r,y,x+w,y+2*r,270,90)
    p.lineTo(x+w,y+h-r)
    p.arcTo(x+w-2*r,y+h-2*r,x+w,y+h,0,90)
    p.lineTo(x+r,y+h)
    p.arcTo(x,y+h-2*r,x+2*r,y+h,90,90)
    p.lineTo(x,y+r)
    p.arcTo(x,y,x+2*r,y+2*r,180,90)
    p.close()
    if fill_col:   c.setFillColor(fill_col)
    if stroke_col: c.setStrokeColor(stroke_col); c.setLineWidth(lw)
    c.drawPath(p, fill=1 if fill_col else 0, stroke=1 if stroke_col else 0)

def hline(c, x1, y, x2, col=None, w=0.5, dash=None):
    stroke(c, col or C_LGRAY, w)
    if dash: c.setDash(*dash)
    c.line(x1, y, x2, y)
    if dash: c.setDash()

def vline(c, x, y1, y2, col=None, w=0.5):
    stroke(c, col or C_LGRAY, w); c.line(x, y1, x, y2)

def perforation(c, x, y1, y2):
    stroke(c, C_MGRAY, 0.8); c.setDash(3,4); c.line(x,y1,x,y2); c.setDash()
    fill(c, C_OFF)
    c.circle(x, y2, 5, fill=1, stroke=0)
    c.circle(x, y1, 5, fill=1, stroke=0)

def draw_route_map(c, stations, x, y, w, h):
    if len(stations) < 2: return
    
    source = stations[0].get('station_name', '')
    dest = stations[-1].get('station_name', '')
    
    interchanges = []
    # Agar JSON mein line ka naam ya color hai, toh usko track karenge
    current_line = stations[0].get('line', stations[0].get('line_color', None))
    
    for i in range(1, len(stations)-1):
        st_name = stations[i].get('station_name', '')
        st_line = stations[i].get('line', stations[i].get('line_color', None))
        
        is_actual_transfer = False
        
        # Condition 1: Agar line change ho rahi hai
        if current_line and st_line and st_line != current_line:
            is_actual_transfer = True
            current_line = st_line
        
        # Condition 2: Agar API ne station name lagatar 2 baar diya hai (jaise Kashmere Gate)
        next_name = stations[i+1].get('station_name', '')
        if st_name == next_name:
            is_actual_transfer = True
            
        if is_actual_transfer:
            # Duplicate entry dobara add na ho, isliye check laga diya
            if not interchanges or interchanges[-1] != st_name:
                interchanges.append(st_name)
                
    # Ab list banate hain
    lines = [f"SOURCE : {source.upper()}"]
    for i, ic in enumerate(interchanges):
        lines.append(f"INTERCHANGE {i+1} : {ic.upper()}")
    lines.append(f"DESTINATION : {dest.upper()}")
    
    font(c, True, 7)
    
    start_y = y + h - 5*mm
    gap = 5.5*mm # Line ke beech ka gap
    
    for i, txt in enumerate(lines):
        parts = txt.split(' : ')
        prefix = parts[0] + ' :'
        station_name = parts[1] if len(parts) > 1 else ''
        
        # Prefix (Source/Interchange/Dest)
        fill(c, C_RED if "INTERCHANGE" in prefix else C_MGRAY)
        c.drawString(x + 2*mm, start_y - (i * gap), prefix)
        
        # Station ka naam
        pw = c.stringWidth(prefix, 'Helvetica-Bold', 7)
        fill(c, C_NAVY)
        c.drawString(x + 2*mm + pw + 2*mm, start_y - (i * gap), station_name)

def create_metro_ticket_pdf(td, output_path):
    cv = canvas.Canvas(output_path, pagesize=(W, H))

    # ── 1. Full background ────────────────────────────────────────
    rect_fill(cv, 0, 0, W, H, C_OFF)

    # ── 2. LEFT STUB (navy) ───────────────────────────────────────
    STUB = 70*mm
    rounded_box(cv, 0, 0, STUB+8, H, 10, fill_col=C_NAVY)
    rect_fill(cv, STUB, 0, 8, H, C_NAVY)

    # Stripe texture
    cv.saveState()
    p2 = cv.beginPath(); p2.rect(0,0,STUB,H); cv.clipPath(p2, fill=0, stroke=0)
    stroke(cv, C_WHITE, 0.4); cv.setStrokeAlpha(0.05)
    for i in range(-20, 50):
        x0 = i*10; cv.line(x0, 0, x0+H, H)
    cv.setStrokeAlpha(1); cv.restoreState()

    # DMRC logo text
    fill(cv, C_WHITE); font(cv, True, 28)
    cv.drawCentredString(STUB/2, H-17*mm, 'DMRC')
    rect_fill(cv, STUB/2-17*mm, H-19.5*mm, 34*mm, 2*mm, C_GOLD)
    fill(cv, C_SKY); font(cv, False, 6.5)
    cv.drawCentredString(STUB/2, H-23.5*mm, 'Delhi Metro Rail Corporation')

    # QR Code
    qr_size = 36*mm
    qr_x = (STUB - qr_size)/2
    qr_y = H/2 - qr_size/2

    qrd = td.get('qr_code_data','')
    if qrd:
        try:
            b64  = qrd.split(',')[1] if ',' in qrd else qrd
            img  = Image.open(BytesIO(base64.b64decode(b64))).convert('RGB')
            tmp  = '/tmp/dmrc_qr_v2.png'; img.save(tmp)
            rounded_box(cv, qr_x-3*mm, qr_y-3*mm, qr_size+6*mm, qr_size+6*mm, 5, fill_col=C_WHITE)
            cv.drawImage(tmp, qr_x, qr_y, width=qr_size, height=qr_size, mask='auto')
        except Exception as e:
            print(f'QR Error: {e}')
            rounded_box(cv, qr_x-3*mm, qr_y-3*mm, qr_size+6*mm, qr_size+6*mm, 5, fill_col=C_WHITE)

    fill(cv, C_GOLD); font(cv, True, 5.5)
    cv.drawCentredString(STUB/2, qr_y-7*mm, 'SCAN AT ENTRY / EXIT GATE')

    # Ticket ID at bottom of stub
    tid = td.get('ticket_id','')[:22]
    fill(cv, C_SKY); font(cv, True, 5.5)
    cv.drawCentredString(STUB/2, 14*mm, 'TICKET ID')
    fill(cv, C_MGRAY); font(cv, False, 5.5)
    cv.drawCentredString(STUB/2, 10*mm, tid)

    # ── 3. PERFORATION ────────────────────────────────────────────
    PERF_X = STUB + 5*mm
    perforation(cv, PERF_X, 5*mm, H-5*mm)

    # ── 4. RIGHT BODY ─────────────────────────────────────────────
    BX = PERF_X + 6*mm
    BW = W - BX - 5*mm

    # White card
    rounded_box(cv, BX-2*mm, 4*mm, BW+4*mm, H-8*mm, 8,
                fill_col=C_WHITE, stroke_col=C_LGRAY, lw=0.7)

    # ── Header stripe ─────────────────────────────────────────────
    SH = 14*mm; SY = H - 4*mm - SH
    rounded_box(cv, BX-2*mm, SY, BW+4*mm, SH, 8, fill_col=C_NAVY)
    rect_fill(cv, BX-2*mm, SY, BW+4*mm, 5*mm, C_NAVY)

    fill(cv, C_WHITE); font(cv, True, 11)
    cv.drawString(BX+4*mm, SY+5*mm, 'METRO TICKET')

    # Skyline decoration
    bldg_x = BX + 60*mm
    for bx, bh in [(0,8),(6,12),(12,6),(18,10),(24,7),(30,13),(36,8),(42,9)]:
        rect_fill(cv, bldg_x+bx*mm*0.6, SY, 3.5*mm, bh*0.7*mm, colors.HexColor('#1A3570'))

    # VALID pill
    pw=22*mm; px2=BX+BW-pw-2*mm
    rounded_box(cv, px2, SY+3.5*mm, pw, 7*mm, 3.5, fill_col=C_GREEN)
    fill(cv, C_WHITE); font(cv, True, 7)
    cv.drawCentredString(px2+pw/2, SY+6.5*mm, 'VALID')

    # ── Passenger + Fare row ──────────────────────────────────────
    R1Y = SY - 12*mm
    fill(cv, C_MGRAY); font(cv, True, 5.8)
    cv.drawString(BX+4*mm, R1Y+4.5*mm, 'PASSENGER')
    fill(cv, C_NAVY); font(cv, True, 9.5)
    cv.drawString(BX+4*mm, R1Y-0.5*mm, td.get('user_name','Passenger').upper())

    # Fare pill
    fp=30*mm; fpx=BX+BW-fp-2*mm
    rounded_box(cv, fpx, R1Y-3.5*mm, fp, 13*mm, 4, fill_col=C_RED)
    fill(cv, C_WHITE); font(cv, True, 6)
    cv.drawCentredString(fpx+fp/2, R1Y+6.5*mm, 'FARE')
    font(cv, True, 12)
    cv.drawCentredString(fpx+fp/2, R1Y+0.5*mm, f"Rs.{td.get('fare_amount','0')}")

    hline(cv, BX+2*mm, R1Y-5*mm, BX+BW-2*mm, C_LGRAY, 0.6)

    # ── FROM --> TO ───────────────────────────────────────────────
    JY = R1Y - 19*mm; half = (BW-20*mm)/2

    fill(cv, C_MGRAY); font(cv, True, 6)
    cv.drawString(BX+4*mm, JY+12*mm, 'FROM')
    fill(cv, C_NAVY); font(cv, True, 10)
    frm = td.get('from_station','').upper()
    while cv.stringWidth(frm,'Helvetica-Bold',10) > half and len(frm)>2:
        frm = frm[:-1]
    cv.drawString(BX+4*mm, JY+6*mm, frm)

    # Arrow
    fill(cv, C_RED); font(cv, True, 20)
    cv.drawCentredString(BX+BW/2, JY+5*mm, '-->')

    fill(cv, C_MGRAY); font(cv, True, 6)
    cv.drawRightString(BX+BW-4*mm, JY+12*mm, 'TO')
    fill(cv, C_NAVY); font(cv, True, 10)
    to = td.get('to_station','').upper()
    while cv.stringWidth(to,'Helvetica-Bold',10) > half and len(to)>2:
        to = to[:-1]
    cv.drawRightString(BX+BW-4*mm, JY+6*mm, to)

    hline(cv, BX+2*mm, JY-3*mm, BX+BW-2*mm, C_LGRAY, 0.5)

    # ── Info grid (4 columns) ─────────────────────────────────────
    IY = JY - 14*mm; cw = BW/4
    grid = [
        ('JOURNEY DATE', td.get('journey_date','-')),
        ('VALID UNTIL',  td.get('valid_until','-')),
        ('VALIDITY',     f"{td.get('validity_hours','?')} hr(s)"),
        ('STATIONS',     str(td.get('num_stations','?'))),
    ]
    for i,(lbl,val) in enumerate(grid):
        cx = BX+4*mm + i*cw
        fill(cv, C_MGRAY); font(cv, True, 5.5)
        cv.drawString(cx, IY+6.5*mm, lbl)
        fill(cv, C_DGRAY); font(cv, False, 7.5)
        v = val[:17] if len(val)>17 else val
        cv.drawString(cx, IY, v)
        if i>0: vline(cv, cx-3*mm, IY-1*mm, IY+10*mm, C_LGRAY, 0.5)

    hline(cv, BX+2*mm, IY-5*mm, BX+BW-2*mm, C_LGRAY, 0.7, dash=[4,3])

    # ── Text Route Summary ────────────────────────────────────────
    MAP_TOP = IY - 7*mm
    fill(cv, C_NAVY); font(cv, True, 6)
    cv.drawString(BX+4*mm, MAP_TOP, 'ROUTE SUMMARY')

    route = td.get('route',[])
    if route:
        draw_route_map(cv, route, BX+2*mm, 11*mm, BW-4*mm, MAP_TOP-12*mm)

    # ── Footer ────────────────────────────────────────────────────
    rect_fill(cv, BX-2*mm, 4*mm, BW+4*mm, 8*mm, C_NAVY)
    fill(cv, C_SKY); font(cv, False, 5.5)
    cv.drawCentredString(BX+BW/2, 7.5*mm,
        'Valid for one journey only  |  Helpline: 155370  |  www.delhimetrorail.com')

    cv.save()
    print(f'Premium ticket created: {output_path}')
    return output_path

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        with open(sys.argv[1]) as f: td = json.load(f)
        create_metro_ticket_pdf(td, sys.argv[2])
    else:
        print('Usage: python3 ticket_pdf_generator.py <data.json> <output.pdf>')