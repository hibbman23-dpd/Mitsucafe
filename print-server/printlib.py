"""
printlib.py — Thư viện render tem/receipt (ESC/POS & TSPL bytes).
Tách từ print_poller.py để dùng chung cho print_poller, print_server và test.
"""

import logging
import os
import unicodedata

log = logging.getLogger("printlib")

# ── Config / Hằng số ──────────────────────────────────────────────────────────
RASTER_FONT_ENV   = os.getenv("RASTER_FONT", "")
RASTER_DOTS_WIDTH = int(os.getenv("RASTER_DOTS_WIDTH", "384"))  # K58 (58mm @ 203dpi = 384 dots)
LABEL_DOTS_WIDTH  = int(os.getenv("LABEL_DOTS_WIDTH",  "400"))  # 50mm × 8dots/mm
LABEL_DOTS_HEIGHT = int(os.getenv("LABEL_DOTS_HEIGHT", "240"))  # 30mm × 8dots/mm

RECEIPT_MODE      = os.getenv("RECEIPT_MODE", "raster")   # raster | text

# ── Font discovery ────────────────────────────────────────────────────────────
_FONT_CANDIDATES = [
    RASTER_FONT_ENV,
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Verdana.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
]

def _load_font(size: int):
    """Trả về ImageFont với font Vietnamese-capable đầu tiên tìm được."""
    from PIL import ImageFont
    for path in _FONT_CANDIDATES:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    log.warning("Không tìm thấy font TTF, dùng default bitmap font")
    return ImageFont.load_default()


# ── Font sizes ────────────────────────────────────────────────────────────────
_W   = RASTER_DOTS_WIDTH
_PAD = 8
_CW  = _W - 2 * _PAD

_SZ_HEADER  = 28
_SZ_LOGO    = 22
_SZ_ADDR    = 14
_SZ_NORMAL  = 18
_SZ_SMALL   = 14
_SZ_TOTAL   = 22
_SZ_ITEM    = 18

_SZ_LBL_HDR  = 18
_SZ_LBL_ITEM = 30
_SZ_LBL_MOD  = 15
_SZ_LBL_TIME = 13


# ── Format helpers ────────────────────────────────────────────────────────────
def _format_amount(n) -> str:
    try:
        return "{:,.0f}".format(float(n)).replace(",", ".")
    except Exception:
        return str(n)


def _format_timestamp(ts_str: str) -> str:
    try:
        from datetime import datetime, timezone, timedelta
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        vn = dt.astimezone(timezone(timedelta(hours=7)))
        return vn.strftime("%H:%M  %d/%m/%Y")
    except Exception:
        return ts_str


def _payment_label(method: str) -> str:
    return {
        "bank_transfer": "Chuyển khoản",
        "vietqr":        "VietQR",
        "cash":          "Tiền mặt",
        "momo":          "MoMo",
        "zalopay":       "ZaloPay",
        "vnpay":         "VNPay",
    }.get(method or "", "Thanh toán")


def _mods_line(modifiers: dict) -> str:
    if not modifiers:
        return ""
    sugar_map = {
        "0%": "Không ngọt", "30%": "Ít ngọt",
        "50%": "Vừa",       "70%": "Ngọt",
        "100%": "Rất ngọt",
    }
    ice_map = {
        "full": "Nhiều đá", "less": "Ít đá",
        "none": "Không đá", "blended": "Xay",
    }
    parts = []
    if modifiers.get("size"):     parts.append(modifiers["size"])
    if modifiers.get("sugar"):    parts.append(sugar_map.get(modifiers["sugar"], modifiers["sugar"]))
    if modifiers.get("ice"):      parts.append(ice_map.get(modifiers["ice"], modifiers["ice"]))
    if modifiers.get("toppings"): parts.append(modifiers["toppings"])
    return " / ".join(parts)


def _loc_label(order: dict) -> str:
    dt = (order.get("metadata") or {}).get("delivery_type", "")
    if dt == "delivery":
        addr = (order.get("metadata") or {}).get("delivery_address", "")
        return "Giao hàng" + (f": {addr[:20]}" if addr else "")
    table = order.get("table_id", "")
    if table:
        return "Bàn " + str(table).upper().replace("TABLE_", "")
    return "Mang đi"


def _img_to_raster_bytes(img) -> bytes:
    """Chuyển PIL Image → packed bit rows cho ESC/POS GS v 0."""
    img_gray = img.convert("L")
    w, h = img_gray.size
    bytes_per_row = (w + 7) // 8
    pixels = img_gray.tobytes()
    result = bytearray(bytes_per_row * h)
    for y in range(h):
        row_start = y * w
        for x in range(w):
            if pixels[row_start + x] < 128:
                result[y * bytes_per_row + x // 8] |= (0x80 >> (x % 8))
    return bytes(result)


# ── Logo asset ────────────────────────────────────────────────────────────────
_LOGO_PATH = os.path.join(os.path.dirname(__file__), "assets", "receipt-logo.png")
_logo_cache = {}


def _get_logo(target_w: int):
    if target_w in _logo_cache:
        return _logo_cache[target_w]
    img = None
    try:
        if os.path.exists(_LOGO_PATH):
            from PIL import Image
            src = Image.open(_LOGO_PATH).convert("L")
            if src.width != target_w:
                h = max(1, round(src.height * target_w / src.width))
                src = src.resize((target_w, h), Image.LANCZOS).point(lambda p: 0 if p < 128 else 255)
            img = src
    except Exception as exc:
        log.warning("Logo load failed (%s) → fallback _draw_bee", exc)
        img = None
    _logo_cache[target_w] = img
    return img


def _bee_height(s: float = 1.1) -> int:
    def S(v):
        return int(round(v * s))
    return S(14) + S(30) + S(8)


def _draw_bee(draw, cx: int, top: int, s: float = 1.1) -> int:
    def S(v):
        return int(round(v * s))
    bw, bh = S(50), S(30)
    by = top + S(14)
    bx0 = cx - bw // 2 + S(6)
    bx1, by1 = bx0 + bw, by + bh
    cym = by + bh // 2
    draw.ellipse([cx - S(4), by - S(13), cx + S(14), by - S(1)], outline=0, width=S(2))
    draw.ellipse([cx + S(8), by - S(15), cx + S(26), by - S(3)], outline=0, width=S(2))
    draw.ellipse([bx0, by, bx1, by1], outline=0, width=S(3), fill=255)
    band = S(7)
    for i in range(4):
        sx = bx0 + S(7) + i * S(11)
        if sx + band > bx1 - S(4):
            break
        draw.rectangle([sx, by + S(4), sx + band, by1 - S(4)], fill=0)
    hr = S(10)
    hcx, hcy = bx0 + S(1), cym
    draw.ellipse([hcx - hr, hcy - hr, hcx + hr, hcy + hr], fill=0)
    draw.line([(hcx - S(3), hcy - hr + S(2)), (hcx - S(10), hcy - hr - S(9))], fill=0, width=S(2))
    draw.line([(hcx + S(3), hcy - hr + S(2)), (hcx + S(2), hcy - hr - S(11))], fill=0, width=S(2))
    draw.ellipse([hcx - S(13), hcy - hr - S(12), hcx - S(7), hcy - hr - S(6)], fill=0)
    draw.ellipse([hcx - S(1), hcy - hr - S(14), hcx + S(5), hcy - hr - S(8)], fill=0)
    draw.polygon([(bx1 - S(2), cym - S(4)), (bx1 + S(9), cym), (bx1 - S(2), cym + S(4))], fill=0)
    return by1 - top + S(8)


# ── Receipt builder ───────────────────────────────────────────────────────────
def build_receipt_raster(order: dict) -> bytes:
    from PIL import Image, ImageDraw

    W, PAD, CW = _W, _PAD, _CW

    f_header = _load_font(_SZ_HEADER)
    f_addr   = _load_font(_SZ_ADDR)
    f_norm   = _load_font(_SZ_NORMAL)
    f_small  = _load_font(_SZ_SMALL)
    f_total  = _load_font(_SZ_TOTAL)
    f_item   = _load_font(_SZ_ITEM)

    def tw(text, font):
        bb = font.getbbox(text)
        return bb[2] - bb[0]

    def lh(font, extra=4):
        bb = font.getbbox("Agypjq")
        return bb[3] - bb[1] + extra

    cmds = []
    y = 6

    def add_text(text, font, align="left", indent=0):
        nonlocal y
        w_text = tw(text, font)
        if align == "center":
            x = max(0, (W - w_text) // 2)
        elif align == "right":
            x = max(PAD, W - PAD - w_text)
        else:
            x = PAD + indent
        cmds.append(("text", x, y, text, font))
        y += lh(font)

    def add_hline(thick=1, gap_before=2, gap_after=2):
        nonlocal y
        y += gap_before
        cmds.append(("hline", y, thick))
        y += thick + gap_after

    def add_gap(px=4):
        nonlocal y
        y += px

    def add_bee(scale=1.1):
        nonlocal y
        cmds.append(("bee", W // 2, y, scale))
        y += _bee_height(scale)

    def add_logo(target_w=300):
        nonlocal y
        logo = _get_logo(min(target_w, CW))
        if logo is None:
            add_bee(1.1)
            return
        x = max(0, (W - logo.width) // 2)
        cmds.append(("logo", x, y, logo))
        y += logo.height

    add_logo(300)
    add_gap(2)
    add_text("Mitsu Café",       f_header, "center")
    add_gap(1)
    add_text("Lâm Hà, Lâm Đồng", f_addr,  "center")
    add_hline(thick=2, gap_before=4, gap_after=4)

    meta        = order.get("metadata") or {}
    ts          = _format_timestamp(str(order.get("timestamp", "")))
    short_code  = ("#" + str(meta.get("short_code", ""))) if meta.get("short_code") else ""
    table_label = _loc_label(order)
    order_line  = "  /  ".join(filter(None, [short_code, table_label]))

    add_text(ts, f_norm)
    if order_line:
        add_text(order_line, f_norm)

    customer_name = order.get("customer_name", "")
    customer_id   = str(order.get("customer_id", ""))
    if customer_name:
        add_text(f"{customer_name}  {customer_id}", f_norm)
    elif customer_id and customer_id not in ("0000000000", ""):
        add_text(customer_id, f_norm)

    add_hline(thick=1, gap_before=3, gap_after=3)

    for it in (order.get("items") or []):
        name = it.get("name", "?")
        size = (it.get("modifiers") or {}).get("size", "")
        if size:
            name += f" ({size})"
        qty   = it.get("qty", 1)
        price = it.get("price", 0)

        right_str = f"x{qty}  {_format_amount(price)}"
        right_w   = tw(right_str, f_item)
        max_name_w = CW - right_w - 6

        words = name.split()
        line1, line2 = "", ""
        for word in words:
            test_l1 = (line1 + " " + word).strip()
            if tw(test_l1, f_item) <= max_name_w:
                line1 = test_l1
            else:
                line2 = (line2 + " " + word).strip()

        if not line1:
            line1 = name

        name_x  = PAD
        price_x = W - PAD - right_w
        cmds.append(("text", name_x,  y, line1,      f_item))
        cmds.append(("text", price_x, y, right_str,  f_item))
        y += lh(f_item)

        if line2:
            cmds.append(("text", name_x, y, line2, f_item))
            y += lh(f_item)

        mods = _mods_line(
            {k: v for k, v in (it.get("modifiers") or {}).items() if k != "size"}
        )
        if mods:
            add_text(mods, f_small, indent=12)

    notes = meta.get("notes", "")
    if notes:
        add_text(f"Ghi chú: {notes}", f_small, indent=0)

    add_hline(thick=1, gap_before=3, gap_after=3)

    total_str = f"Tổng:  {_format_amount(order.get('total', 0))}đ"
    pmt_str   = f"TT:  {_payment_label((order.get('payment') or {}).get('method', ''))}"

    add_text(total_str, f_total, "right")
    add_text(pmt_str,   f_norm,  "right")
    add_hline(thick=2, gap_before=4, gap_after=4)

    add_text("Cảm ơn! Hẹn gặp lại nhé!", f_norm, "center")
    add_text("mitsu.cafe",               f_addr,  "center")
    add_hline(thick=1, gap_before=3, gap_after=6)

    height = y + 8
    img = Image.new("L", (W, height), 255)
    draw = ImageDraw.Draw(img)

    for cmd in cmds:
        if cmd[0] == "text":
            _, x, cy, text, font = cmd
            draw.text((x, cy), text, font=font, fill=0)
        elif cmd[0] == "hline":
            _, cy, thick = cmd
            draw.line([(PAD, cy), (W - PAD, cy)], fill=0, width=thick)
        elif cmd[0] == "bee":
            _, bcx, bcy, bscale = cmd
            _draw_bee(draw, bcx, bcy, bscale)
        elif cmd[0] == "logo":
            _, lx, ly, limg = cmd
            img.paste(limg, (lx, ly))

    ESC = b"\x1b"
    GS  = b"\x1d"

    raster_data  = _img_to_raster_bytes(img)
    bytes_per_row = (W + 7) // 8
    num_rows      = height

    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = num_rows & 0xFF
    yH = (num_rows >> 8) & 0xFF

    return (
        ESC + b"@"
        + GS + b"v0\x00"
        + bytes([xL, xH, yL, yH])
        + raster_data
        + b"\n\n\n"
        + ESC + b"p\x00\x19\xfa"
        + ESC + b"p\x01\x19\xfa"
        + b"\x10\x14\x01\x00\x05"
        + b"\n\n"
        + GS + b"V\x42\x00"
    )


def _viet_cp1258(s: str) -> str:
    result = []
    for ch in s:
        try:
            ch.encode("cp1258"); result.append(ch); continue
        except UnicodeEncodeError:
            pass
        nfd = unicodedata.normalize("NFD", ch)
        for end in range(len(nfd), 0, -1):
            cand = unicodedata.normalize("NFC", nfd[:end])
            try:
                cand.encode("cp1258"); result.append(cand); break
            except UnicodeEncodeError:
                continue
        else:
            result.append("?")
    return "".join(result)


def build_receipt_text(order: dict) -> bytes:
    ESC = b"\x1b"
    GS  = b"\x1d"
    W   = 32

    def enc(s):
        return _viet_cp1258(s).encode("cp1258", errors="replace")

    def rjust(s, w):
        return s.rjust(w) if len(s) < w else s

    meta = order.get("metadata") or {}
    parts = [
        ESC + b"@",
        ESC + b"p\x00\x19\xfa",
        ESC + b"p\x01\x19\xfa",
        ESC + b"t\x20",
        ESC + b"a\x01",
        ESC + b"!\x00",
        enc(">(|||)<\n"),
        ESC + b"!\x38",
        enc("Mitsu Café\n"),
        ESC + b"!\x00",
        enc("Lâm Hà, Lâm Đồng\n"),
        ESC + b"a\x00",
        enc("=" * W + "\n"),
    ]
    ts = _format_timestamp(str(order.get("timestamp", "")))
    parts.append(enc("  " + ts + "\n"))
    short_code  = ("#" + str(meta.get("short_code", ""))) if meta.get("short_code") else ""
    table_label = _loc_label(order)
    order_line  = "  /  ".join(filter(None, [short_code, table_label]))
    if order_line:
        parts.append(enc("  " + order_line + "\n"))
    customer_name = order.get("customer_name", "")
    customer_id   = str(order.get("customer_id", ""))
    if customer_name:
        parts.append(enc("  " + customer_name + "  " + customer_id + "\n"))
    elif customer_id and customer_id not in ("0000000000", ""):
        parts.append(enc("  " + customer_id + "\n"))
    parts.append(enc("-" * W + "\n"))
    for it in (order.get("items") or []):
        name = it.get("name", "?")
        size = (it.get("modifiers") or {}).get("size", "")
        if size:
            name += f" ({size})"
        right = f"x{it.get('qty',1)}  {_format_amount(it.get('price',0))}"
        max_n = W - len(right) - 1
        name = name[:max_n]
        line  = name + " " * max(1, W - len(name) - len(right)) + right
        parts.append(enc(line + "\n"))
        mods = _mods_line({k: v for k, v in (it.get("modifiers") or {}).items() if k != "size"})
        if mods:
            parts.append(enc(("  " + mods)[:W] + "\n"))
    notes = meta.get("notes", "")
    if notes:
        parts.append(enc(("  Ghi chú: " + notes)[:W] + "\n"))
    parts.append(enc("-" * W + "\n"))
    parts.append(ESC + b"!\x08")
    parts.append(enc(rjust("Tổng: " + _format_amount(order.get("total", 0)) + "đ", W) + "\n"))
    parts.append(ESC + b"!\x00")
    pmt = (order.get("payment") or {}).get("method", "")
    parts.append(enc(rjust("TT: " + _payment_label(pmt), W) + "\n"))
    parts.append(enc("=" * W + "\n"))
    parts.append(ESC + b"a\x01")
    parts.append(enc("Cảm ơn! Hẹn gặp lại nhé!\n"))
    parts.append(enc("mitsu.cafe\n"))
    parts.append(ESC + b"a\x00")
    parts.append(enc("=" * W + "\n"))
    parts.append(b"\n\n\n")
    parts.append(ESC + b"p\x00\x19\xfa")
    parts.append(ESC + b"p\x01\x19\xfa")
    parts.append(b"\x10\x14\x01\x00\x05")
    parts.append(b"\n\n")
    parts.append(GS + b"V\x42\x00")
    return b"".join(parts)


def build_receipt(order: dict) -> bytes:
    if RECEIPT_MODE == "text":
        return build_receipt_text(order)
    try:
        return build_receipt_raster(order)
    except Exception as exc:
        log.warning("Raster build failed (%s), fallback to text mode", exc)
        return build_receipt_text(order)


# ── Label builder ─────────────────────────────────────────────────────────────
def _strip_viet(s: str) -> str:
    s = s.replace('đ', 'd').replace('Đ', 'D')
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn').upper()


def _format_time_only(ts_str: str) -> str:
    try:
        from datetime import datetime, timezone, timedelta
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        vn = dt.astimezone(timezone(timedelta(hours=7)))
        return vn.strftime("%H:%M")
    except Exception:
        return ts_str[:5] if len(ts_str) >= 5 else ts_str


def build_label_raster(order: dict, item: dict, cup_num: int, total_cups: int) -> bytes:
    from PIL import Image, ImageDraw

    W, H = LABEL_DOTS_WIDTH, LABEL_DOTS_HEIGHT
    PAD  = 4

    f_hdr  = _load_font(_SZ_LBL_HDR)
    f_item = _load_font(_SZ_LBL_ITEM)
    f_mod  = _load_font(_SZ_LBL_MOD)
    f_time = _load_font(_SZ_LBL_TIME)

    def tw(text, font):
        bb = font.getbbox(text)
        return bb[2] - bb[0]

    def lh(font, extra=3):
        bb = font.getbbox("Agypjq")
        return bb[3] - bb[1] + extra

    cmds = []
    y    = PAD

    def add_hline(thick=1):
        nonlocal y
        y += 2
        cmds.append(("hline", y, thick))
        y += thick + 2

    meta       = order.get("metadata") or {}
    short_code = ("#" + str(meta.get("short_code", ""))) if meta.get("short_code") else ("#" + order.get("order_id", "????")[-4:])
    loc        = _loc_label(order)
    left_str   = f"{short_code}  {loc}"
    right_str  = f"[{cup_num}/{total_cups}]"

    rw = tw(right_str, f_hdr)
    cmds.append(("text", PAD,          y, left_str,  f_hdr))
    cmds.append(("text", W - PAD - rw, y, right_str, f_hdr))
    y += lh(f_hdr)

    add_hline(thick=2)

    name = item.get("name", "?")
    size = (item.get("modifiers") or {}).get("size", "")
    if size:
        name += f" ({size})"
    max_w = W - 2 * PAD
    while len(name) > 2 and tw(name, f_item) > max_w:
        name = name[:-1]
    nw = tw(name, f_item)
    cmds.append(("text", max(PAD, (W - nw) // 2), y, name, f_item))
    y += lh(f_item)

    mods = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"})
    if mods:
        while len(mods) > 2 and tw(mods, f_mod) > max_w:
            mods = mods[:-1]
        mw = tw(mods, f_mod)
        cmds.append(("text", max(PAD, (W - mw) // 2), y, mods, f_mod))
        y += lh(f_mod)

    notes = meta.get("notes", "")
    if notes:
        note_str = "GC: " + notes
        while len(note_str) > 4 and tw(note_str, f_mod) > max_w:
            note_str = note_str[:-1]
        nw2 = tw(note_str, f_mod)
        cmds.append(("text", max(PAD, (W - nw2) // 2), y, note_str, f_mod))
        y += lh(f_mod)

    add_hline(thick=1)
    time_str = _format_time_only(str(order.get("timestamp", "")))
    tw_t = tw(time_str, f_time)
    cmds.append(("text", max(PAD, (W - tw_t) // 2), y, time_str, f_time))
    y += lh(f_time)

    img  = Image.new("L", (W, H), 255)
    draw = ImageDraw.Draw(img)

    for cmd in cmds:
        if cmd[0] == "text":
            _, x, cy, text, font = cmd
            if 0 <= cy < H:
                draw.text((x, cy), text, font=font, fill=0)
        elif cmd[0] == "hline":
            _, cy, thick = cmd
            if 0 <= cy < H:
                draw.line([(PAD, cy), (W - PAD, cy)], fill=0, width=thick)

    ESC = b"\x1b"
    GS  = b"\x1d"

    raster_data   = _img_to_raster_bytes(img)
    bytes_per_row = (W + 7) // 8

    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = H & 0xFF
    yH = (H >> 8) & 0xFF

    return (
        ESC + b"@"
        + GS + b"v0\x00"
        + bytes([xL, xH, yL, yH])
        + raster_data
        + GS + b"V\x42\x00"
    )


def build_label_tspl(order: dict, item: dict, cup_num: int, total_cups: int) -> bytes:
    def T(px, py, text_str, font="4", sx=1, sy=1):
        s = _strip_viet(text_str)
        return f'TEXT {px},{py},"{font}",0,{sx},{sy},"{s}"\r\n'.encode("ascii")

    meta       = order.get("metadata") or {}
    short_code = ("#" + str(meta.get("short_code", ""))) if meta.get("short_code") \
                 else ("#" + order.get("order_id", "????")[-4:])
    
    loc = _loc_label(order)
    if loc.startswith("Giao hàng"):
        loc = "Giao hàng"

    name       = item.get("name", "?")
    size       = (item.get("modifiers") or {}).get("size", "")
    if size:
        name += f" ({size})"
    mods     = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"})
    notes    = str(meta.get("notes") or "").strip()
    time_str = _format_time_only(str(order.get("timestamp", "")))

    left_str  = f"{short_code}  {loc}"
    right_str = f"[{cup_num}/{total_cups}]"

    cmd = [
        b"SIZE 50 mm,30 mm\r\n",
        b"GAP 3 mm,0\r\n",
        b"DIRECTION 0\r\n",
        b"CODEPAGE UTF-8\r\n",
        b"CLS\r\n",
        T(10,  10, left_str, font="3"),
        T(300, 10, right_str, font="3"),
        b"BAR 0,38,400,2\r\n",
    ]

    middle_items = []
    
    name_stripped = _strip_viet(name)
    if len(name_stripped) > 23:
        name = name[:23]
        name_stripped = name_stripped[:23]
        
    if len(name_stripped) <= 15:
        middle_items.append((name, "4", 1, 2, 64))
    else:
        middle_items.append((name, "3", 1, 2, 48))
        
    if mods:
        if len(mods) > 23:
            mods = mods[:23]
        middle_items.append((mods, "3", 1, 1, 24))
        
    cust_name = str(order.get("customer_name") or "").strip()
    cust_id = str(order.get("customer_id") or "").strip()
    if cust_id == "0000000000":
        cust_id = ""
        
    cust_parts = []
    if cust_name:
        cust_parts.append(cust_name)
    if cust_id:
        cust_parts.append(cust_id)
        
    if cust_parts:
        cust_str = " - ".join(cust_parts)
        if len(cust_str) > 23:
            cust_str = cust_str[:23]
        middle_items.append((cust_str, "3", 1, 1, 24))
        
    if notes:
        note_str = f"GC: {notes}"
        if len(note_str) > 23:
            note_str = note_str[:23]
        middle_items.append((note_str, "3", 1, 1, 24))
        
    total_height = sum(item[4] for item in middle_items)
    remaining = 162 - total_height
    gap = max(2, remaining // (len(middle_items) + 1))
    
    y_ptr = 40 + gap
    for text_str, font, sx, sy, h in middle_items:
        cmd.append(T(10, y_ptr, text_str, font=font, sx=sx, sy=sy))
        y_ptr += h + gap

    cmd += [
        b"BAR 0,202,400,2\r\n",
        T(160, 208, time_str, font="3"),
        b"PRINT 1\r\n",
    ]
    return b"".join(cmd)
