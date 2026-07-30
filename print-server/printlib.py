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

_SZ_SUPER   = 56
_SZ_HEADER  = 30
_SZ_TITLE   = 34
_SZ_LOGO    = 22
_SZ_ADDR    = 14
_SZ_NORMAL  = 22
_SZ_SMALL   = 26
_SZ_TOTAL   = 26
_SZ_ITEM    = 44
_SZ_MOD_PREP = 38   # tuỳ chọn (vừa/ngọt/ít đá/ghi chú) IN TO trên PHIẾU PHA CHẾ cho bếp dễ đọc; bill vẫn dùng _SZ_SMALL
_SZ_TABLE    = 50   # số bàn — riêng 1 dòng, to gần bằng STT ĐƠN để bưng đúng bàn không cần nhìn kỹ


def _get_daily_sequence(order: dict) -> str:
    meta = order.get("metadata") or {}
    seq = meta.get("daily_seq") or order.get("daily_seq") or order.get("seq")
    if seq is not None and str(seq).strip() != "":
        try:
            return f"#{int(seq):02d}"
        except (ValueError, TypeError):
            return f"#{seq}"

    short_code = str(meta.get("short_code") or order.get("short_code") or "").replace("#", "").strip()
    import re
    digits = re.findall(r"\d+", short_code)
    if digits:
        return f"#{int(digits[0]):02d}"

    oid_digits = re.findall(r"\d+", str(order.get("order_id", "")))
    if oid_digits:
        raw_val = oid_digits[-1]
        val = int(raw_val[-3:]) if len(raw_val) >= 3 else int(raw_val)
        return f"#{val:02d}"

    return "#01"

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


def _format_amount_short(n) -> str:
    """18000 -> '18k' — dùng cho giá nhỏ từng món trên tem/bill, KHÔNG dùng cho Tổng tiền."""
    try:
        k = float(n) / 1000
    except Exception:
        return str(n)
    if k == int(k):
        return f"{int(k)}k"
    return f"{round(k, 1)}k"


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


_SKU_SUBCAT_MAP = None

def _load_sku_subcat_map() -> dict:
    """sku -> subcategory, đọc từ seed/menu_items.json (giống _load_menu_map ở gateway.py)."""
    global _SKU_SUBCAT_MAP
    if _SKU_SUBCAT_MAP is not None:
        return _SKU_SUBCAT_MAP
    _SKU_SUBCAT_MAP = {}
    menu_file = os.path.join(os.path.dirname(__file__), "..", "seed", "menu_items.json")
    if os.path.exists(menu_file):
        try:
            import json
            with open(menu_file, "r", encoding="utf-8") as f:
                for it in json.load(f):
                    if it.get("sku") and it.get("subcategory"):
                        _SKU_SUBCAT_MAP[it["sku"]] = it["subcategory"]
        except Exception:
            pass
    return _SKU_SUBCAT_MAP


# Món pha nóng được (cà phê/trà nóng/latte/trà sữa/trà trái cây) -> "none" đá gọi là "Nóng".
# Coldbrew (pha lạnh) và sữa chua (uống lạnh) giữ nguyên "Không đá" — gọi "Nóng" sẽ sai nghĩa.
_HOT_ELIGIBLE_SUBCATS = {"coffee", "hot_drinks", "latte", "milk_tea", "fruit_tea"}


def _ice_label_for(value: str, sku: str = None) -> str:
    ice_map = {
        "full": "Nhiều đá", "less": "Ít đá",
        "none": "Không đá", "blended": "Xay",
    }
    if value != "none":
        return ice_map.get(value, value)
    subcat = _load_sku_subcat_map().get(sku)
    return "Nóng" if subcat in _HOT_ELIGIBLE_SUBCATS else "Không đá"


def _mods_line(modifiers: dict, sku: str = None) -> str:
    if not modifiers:
        return ""
    sugar_map = {
        "0%": "Không ngọt", "30%": "Ít ngọt",
        "50%": "Vừa",       "70%": "Ngọt",
        "100%": "Rất ngọt",
    }
    parts = []
    if modifiers.get("size"):     parts.append(modifiers["size"])
    if modifiers.get("sugar"):    parts.append(sugar_map.get(modifiers["sugar"], modifiers["sugar"]))
    if modifiers.get("ice"):      parts.append(_ice_label_for(modifiers["ice"], sku))
    if modifiers.get("toppings"): parts.append(modifiers["toppings"])
    if modifiers.get("note"):     parts.append(f"Ghi chú: {modifiers['note']}")
    if modifiers.get("swap_from"): parts.append(f"Thay cho: {modifiers['swap_from']}")
    return " / ".join(parts)


def _wrap_text_to_lines(text: str, max_chars: int) -> list:
    """Tách văn bản thành các dòng không quá max_chars ký tự mà không cắt xén chữ."""
    if not text:
        return []
    words = str(text).split()
    lines = []
    curr = ""
    for word in words:
        while len(word) > max_chars:
            part = word[:max_chars]
            word = word[max_chars:]
            if curr:
                lines.append(curr)
                curr = ""
            lines.append(part)
        if not word:
            continue
        if not curr:
            curr = word
        elif len(curr) + 1 + len(word) <= max_chars:
            curr += " " + word
        else:
            lines.append(curr)
            curr = word
    if curr:
        lines.append(curr)
    return lines


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
    """Chuyển PIL Image → packed bit rows cho ESC/POS GS v 0.
    ESC/POS: bit 1 = điểm đen nhiệt (đốt nhiệt), bit 0 = giấy trắng.
    PIL convert('1'): 0 = đen, 255 = trắng. Do đó CẦN ĐẢO BIT (b ^ 0xFF).
    """
    raw = img.convert("1", dither=False).tobytes()
    return bytes(b ^ 0xFF for b in raw)


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
def build_receipt_raster(order: dict, is_cash: bool = False, show_total: bool = False) -> bytes:
    from PIL import Image, ImageDraw

    W, PAD, CW = _W, _PAD, _CW

    f_super  = _load_font(_SZ_SUPER)
    f_title  = _load_font(_SZ_TITLE)
    f_header = _load_font(_SZ_HEADER)
    f_addr   = _load_font(_SZ_ADDR)
    f_norm   = _load_font(_SZ_NORMAL)
    f_small  = _load_font(_SZ_SMALL)
    f_total  = _load_font(_SZ_TOTAL)
    f_item   = _load_font(_SZ_ITEM)
    f_table  = _load_font(_SZ_TABLE)
    # Phiếu pha chế (show_total=False): modifier + ghi chú in TO cho bếp. Bill (show_total=True): giữ nhỏ.
    f_mod    = f_small if show_total else _load_font(_SZ_MOD_PREP)

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

    meta          = order.get("metadata") or {}
    ts            = _format_timestamp(str(order.get("timestamp", "")))
    short_code    = str(meta.get("short_code") or order.get("short_code") or "").replace("#", "").strip()
    daily_seq_str = _get_daily_sequence(order)
    table_label   = _loc_label(order)

    # Logo Mitsu cách điệu (assets/receipt-logo.png) ở đầu — chỉ HÓA ĐƠN (khách),
    # PHIẾU PHA CHẾ bỏ logo cho gọn/nhanh (bếp chỉ cần thông tin món).
    if show_total:
        add_logo()
        add_gap(4)
    add_text("=== HÓA ĐƠN ===" if show_total else "=== PHIẾU PHA CHẾ ===", f_header, "center")
    add_text(f"STT ĐƠN: {daily_seq_str}", f_super, "center")

    # Số bàn riêng 1 dòng, to — bưng đúng bàn không cần nhìn kỹ.
    if table_label:
        add_text(table_label.upper(), f_table, "center")

    if short_code:
        add_text(f"Mã: #{short_code}", f_title, "center")

    copy_num = order.get("copy_num", 0)
    if copy_num == 1:
        add_text("*** LIÊN 1: KHÁCH HÀNG ***", f_norm, "center")
    elif copy_num == 2:
        add_text("*** LIÊN 2: ĐỐI SOÁT QUẦY ***", f_norm, "center")

    if order.get("is_reprint"):
        add_text("*** BẢN IN LẠI ***", f_norm, "center")

    add_text(f"Thời gian: {ts}", f_norm, "center")

    customer_name = order.get("customer_name", "")
    customer_id   = str(order.get("customer_id", ""))
    if customer_name:
        add_text(f"{customer_name}  {customer_id}", f_norm)
    elif customer_id and customer_id not in ("0000000000", ""):
        add_text(customer_id, f_norm)

    add_hline(thick=2, gap_before=4, gap_after=4)

    for idx, it in enumerate(order.get("items") or [], start=1):
        name = f"{idx}. " + it.get("name", "?")
        size = (it.get("modifiers") or {}).get("size", "")
        if size:
            name += f" ({size})"
        qty   = it.get("qty", 1)
        price = it.get("price", 0)

        right_str = f"x{qty}"
        right_w   = tw(right_str, f_item)
        max_name_w = CW - right_w - 6

        words = name.split()
        name_lines = []
        curr = ""
        for word in words:
            test = (curr + " " + word).strip()
            if tw(test, f_item) <= max_name_w:
                curr = test
            else:
                if curr:
                    name_lines.append(curr)
                curr = word
        if curr:
            name_lines.append(curr)
        if not name_lines:
            name_lines = [name]

        name_x  = PAD
        price_x = W - PAD - right_w
        cmds.append(("text", name_x,  y, name_lines[0], f_item))
        cmds.append(("text", price_x, y, right_str,     f_item))
        y += lh(f_item)

        for extra_l in name_lines[1:]:
            cmds.append(("text", name_x, y, extra_l, f_item))
            y += lh(f_item)

        # Bill (show_total): giá nhỏ từng món ngay dưới tên — tổng tiền chỉ hiện 1 lần ở cuối.
        if show_total:
            add_text(_format_amount_short(qty * price), f_mod, "right")

        mods = _mods_line(
            {k: v for k, v in (it.get("modifiers") or {}).items() if k != "size"},
            it.get("sku"),
        )
        if mods:
            mod_words = f"→ {mods}".split()
            mod_lines, curr_m = [], ""
            for mw in mod_words:
                test_m = (curr_m + " " + mw).strip()
                if tw(test_m, f_mod) <= CW - 16:
                    curr_m = test_m
                else:
                    if curr_m: mod_lines.append(curr_m)
                    curr_m = mw
            if curr_m: mod_lines.append(curr_m)
            for ml in (mod_lines or [f"→ {mods}"]):
                add_text(ml, f_mod, indent=8)

    notes = meta.get("notes", "")
    if notes:
        note_words = f"Ghi chú: {notes}".split()
        note_lines, curr_n = [], ""
        for nw_word in note_words:
            test_n = (curr_n + " " + nw_word).strip()
            if tw(test_n, f_mod) <= CW - 12:
                curr_n = test_n
            else:
                if curr_n: note_lines.append(curr_n)
                curr_n = nw_word
        if curr_n: note_lines.append(curr_n)
        for nl in (note_lines or [f"Ghi chú: {notes}"]):
            add_text(nl, f_mod, indent=0)

    # HÓA ĐƠN (show_total=True): tổng tiền + phương thức + cảm ơn. PHIẾU PHA CHẾ bỏ qua.
    if show_total:
        add_hline(thick=1, gap_before=3, gap_after=3)
        total_str = f"Tổng:  {_format_amount(order.get('total', 0))}đ"
        pmt_str   = f"TT:  {_payment_label((order.get('payment') or {}).get('method', ''))}"
        add_text(total_str, f_total, "right")
        add_text(pmt_str,   f_norm,  "right")
        add_hline(thick=2, gap_before=4, gap_after=4)
        add_text("Cảm ơn! Hẹn gặp lại nhé!", f_norm, "center")
        add_text("mitsu.cafe",               f_addr,  "center")

    add_hline(thick=3, gap_before=6, gap_after=12)

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

    # Cold-start garble fix: POS-58L ngủ giữa các đơn; byte đầu tiên gửi tới thường bị
    # nuốt lúc máy in thức dậy → ESC @ hỏng một phần → in ra ký tự rác ở đầu bill. Chèn
    # padding NUL (0x00 = no-op trong ESC/POS, không in ra) để máy in nuốt padding thay
    # vì nuốt lệnh init thật. Số NUL chỉnh qua RECEIPT_WAKE_NULS (mặc định 64).
    WAKE = b"\x00" * int(os.getenv("RECEIPT_WAKE_NULS", "64"))
    INIT = (
        WAKE
        + ESC + b"@"               # ESC @: Initialize printer
        + ESC + b"2"               # ESC 2: Default line spacing (1/6 inch)
        + ESC + b"t\x00"           # ESC t 0: Character code table PC437
    )
    KICK = (
        ESC + b"p\x00\x19\xfa"     # Cash drawer 1 kick
        + ESC + b"p\x01\x19\xfa\n" # Cash drawer 2 kick
    ) if is_cash else b""
    DRAWER_KICK = INIT + KICK

    CHUNK_H = 48
    bytes_per_row = (W + 7) // 8
    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF

    parts = [DRAWER_KICK]
    for y_offset in range(0, height, CHUNK_H):
        chunk_h = min(CHUNK_H, height - y_offset)
        slice_img = img.crop((0, y_offset, W, y_offset + chunk_h))
        slice_bytes = _img_to_raster_bytes(slice_img)

        yL = chunk_h & 0xFF
        yH = (chunk_h >> 8) & 0xFF

        parts.append(GS + b"v0\x00" + bytes([xL, xH, yL, yH]) + slice_bytes + b"\n")

    parts.append(b"\n\n\n\n" + GS + b"V\x42\x00")
    return b"".join(parts)


def _viet_ascii(s: str) -> str:
    s = s.replace('đ', 'd').replace('Đ', 'D')
    nfd = unicodedata.normalize('NFD', s)
    return ''.join(c for c in nfd if unicodedata.category(c) != 'Mn')


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


def build_receipt_text(order: dict, is_cash: bool = False, show_total: bool = False) -> bytes:
    ESC = b"\x1b"
    GS  = b"\x1d"
    W   = 32

    def enc(s):
        return _viet_ascii(s).encode("ascii", errors="replace")

    def rjust(s, w):
        return s.rjust(w) if len(s) < w else s

    meta = order.get("metadata") or {}
    parts = [
        ESC + b"@",
        ESC + b"t\x00",
        ESC + b"a\x01",
        GS + b"!\x11",
        enc("Mitsu Cafe - PHIEU PHA CHE\n"),
        GS + b"!\x00",
        (enc("*** LIEN 1: KHACH HANG ***\n") if order.get("copy_num") == 1 else (enc("*** LIEN 2: DOI SOAT QUAY ***\n") if order.get("copy_num") == 2 else b"")),
        ESC + b"a\x00",
        enc("=" * W + "\n"),
    ]
    ts            = _format_timestamp(str(order.get("timestamp", "")))
    short_code    = str(meta.get("short_code") or order.get("short_code") or "").replace("#", "").strip()
    daily_seq_str = _get_daily_sequence(order)
    table_label   = _loc_label(order)

    parts.append(GS + b"!\x11")
    parts.append(enc("STT DON: " + daily_seq_str + "\n"))
    parts.append(GS + b"!\x00")

    code_sub  = f"Ma: #{short_code}" if short_code else ""
    meta_line = "  /  ".join(filter(None, [code_sub, table_label]))
    if meta_line:
        parts.append(enc("  " + meta_line + "\n"))
    parts.append(enc("Thoi gian: " + ts + "\n"))
    customer_name = order.get("customer_name", "")
    customer_id   = str(order.get("customer_id", ""))
    if customer_name:
        parts.append(enc("  " + customer_name + "  " + customer_id + "\n"))
    elif customer_id and customer_id not in ("0000000000", ""):
        parts.append(enc("  " + customer_id + "\n"))
    parts.append(enc("-" * W + "\n"))
    for idx, it in enumerate(order.get("items") or [], start=1):
        name = f"{idx}. " + it.get("name", "?")
        size = (it.get("modifiers") or {}).get("size", "")
        if size:
            name += f" ({size})"
        right = f"x{it.get('qty',1)}"
        max_n = max(8, W - len(right) - 1)
        name_lines = _wrap_text_to_lines(name, max_n)
        if not name_lines:
            name_lines = [name]

        first_line = name_lines[0] + " " * max(1, W - len(name_lines[0]) - len(right)) + right
        parts.append(ESC + b"!\x20")
        parts.append(enc(first_line + "\n"))
        for extra_l in name_lines[1:]:
            parts.append(enc("  " + extra_l + "\n"))
        parts.append(ESC + b"!\x00")

        # Bill (show_total): giá nhỏ từng món ngay dưới tên — tổng tiền chỉ hiện 1 lần ở cuối.
        if show_total:
            price_str = _format_amount_short(int(it.get("qty", 1)) * it.get("price", 0))
            parts.append(enc(rjust(price_str, W) + "\n"))

        mods = _mods_line({k: v for k, v in (it.get("modifiers") or {}).items() if k != "size"}, it.get("sku"))
        if mods:
            mod_lines = _wrap_text_to_lines("-> " + mods, W - 4)
            # PHIẾU PHA CHẾ (show_total=False): tuỳ chọn IN TO (cao gấp đôi + đậm) cho bếp dễ đọc.
            # HÓA ĐƠN (show_total=True): giữ thường.
            if not show_total:
                parts.append(ESC + b"!\x18")
            for ml in mod_lines:
                parts.append(enc("  " + ml + "\n"))
            if not show_total:
                parts.append(ESC + b"!\x00")

    notes = meta.get("notes", "")
    if notes:
        note_lines = _wrap_text_to_lines("Ghi chú: " + notes, W - 2)
        if not show_total:
            parts.append(ESC + b"!\x18")   # ghi chú cũng IN TO trên phiếu pha chế
        for nl in note_lines:
            parts.append(enc("  " + nl + "\n"))
        if not show_total:
            parts.append(ESC + b"!\x00")
    parts.append(enc("-" * W + "\n"))
    # HÓA ĐƠN (show_total=True): tổng tiền + phương thức + cảm ơn. PHIẾU PHA CHẾ bỏ qua (vé bếp sạch).
    if show_total:
        parts.append(ESC + b"!\x08")
        parts.append(enc(rjust("Tong: " + _format_amount(order.get("total", 0)) + "d", W) + "\n"))
        parts.append(ESC + b"!\x00")
        pmt = (order.get("payment") or {}).get("method", "")
        parts.append(enc(rjust("TT: " + _payment_label(pmt), W) + "\n"))
        parts.append(enc("=" * W + "\n"))
        parts.append(ESC + b"a\x01")
        parts.append(enc("Cam on! Hen gap lai nhe!\n"))
        parts.append(enc("mitsu.cafe\n"))
        parts.append(ESC + b"a\x00")
    parts.append(enc("=" * W + "\n"))
    parts.append(b"\n\n\n")
    if is_cash:
        parts.append(ESC + b"p\x00\x19\xfa")
        parts.append(ESC + b"p\x01\x19\xfa")
    parts.append(b"\n\n")
    parts.append(GS + b"V\x42\x00")
    return b"".join(parts)


def build_receipt(order: dict, is_cash: bool = False, show_total: bool = False,
                  prefer_raster: bool = False) -> bytes:
    # HÓA ĐƠN (prefer_raster=True): render raster để có logo Mitsu cách điệu + tổng tiền.
    # PHIẾU PHA CHẾ: theo RECEIPT_FORMAT (mặc định text, nhanh, không logo).
    fmt = os.getenv("RECEIPT_FORMAT", "text").lower()
    if fmt == "raster" or prefer_raster:
        try:
            return build_receipt_raster(order, is_cash, show_total=show_total)
        except Exception as exc:
            log.warning("Raster build failed (%s), fallback to text mode", exc)
    return build_receipt_text(order, is_cash, show_total=show_total)


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

    def wrap_font_lines(text_str, font, max_px):
        words = str(text_str).split()
        lines = []
        curr = ""
        for word in words:
            test = (curr + " " + word).strip()
            if tw(test, font) <= max_px:
                curr = test
            else:
                if curr:
                    lines.append(curr)
                curr = word
        if curr:
            lines.append(curr)
        return lines or [text_str]

    name = item.get("name", "?")
    size = (item.get("modifiers") or {}).get("size", "")
    if size:
        name += f" ({size})"
    max_w = W - 2 * PAD
    name_lines = wrap_font_lines(name, f_item, max_w)
    name_row_y = y
    for nl in name_lines:
        nw = tw(nl, f_item)
        cmds.append(("text", max(PAD, (W - nw) // 2), y, nl, f_item))
        y += lh(f_item)

    # Giá tiền in ngang hàng với dòng đầu tên món, sát lề phải — không chiếm thêm dòng riêng.
    price = item.get("price")
    if price is not None:
        price_str = _format_amount_short(price)
        pw = tw(price_str, f_mod)
        cmds.append(("text", max(PAD, W - PAD - pw), name_row_y, price_str, f_mod))

    mods = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"}, item.get("sku"))
    if mods:
        mods_lines = wrap_font_lines(mods, f_mod, max_w)
        for ml in mods_lines:
            mw = tw(ml, f_mod)
            cmds.append(("text", max(PAD, (W - mw) // 2), y, ml, f_mod))
            y += lh(f_mod)

    notes = meta.get("notes", "")
    if notes:
        note_lines = wrap_font_lines("GC: " + notes, f_mod, max_w)
        for nl in note_lines:
            nw2 = tw(nl, f_mod)
            cmds.append(("text", max(PAD, (W - nw2) // 2), y, nl, f_mod))
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


def build_label_tspl(order: dict, item: dict, cup_num: int, total_cups: int, include_header: bool = True) -> bytes:
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
    mods     = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"}, item.get("sku"))
    notes    = str(meta.get("notes") or "").strip()
    time_str = _format_time_only(str(order.get("timestamp", "")))

    left_str  = f"{short_code}  {loc}"
    right_str = f"[{cup_num}/{total_cups}]"

    cmd = []
    if include_header:
        cmd += [
            b"SIZE 50 mm,30 mm\r\n",
            b"GAP 3 mm,0\r\n",
            b"DIRECTION 0\r\n",
        ]
    cmd += [
        b"CLS\r\n",
        T(10,  10, left_str, font="3"),
        T(300, 10, right_str, font="3"),
        b"BAR 0,38,400,2\r\n",
    ]

    middle_items = []

    # Có giá -> giá chiếm cột riêng bên phải (x=300+), tên phải chừa chỗ, không thì chồng lên nhau.
    price = item.get("price")
    has_price = price is not None
    limit_big  = 10 if has_price else 14
    limit_med  = 16 if has_price else 22
    wrap_w1    = 16 if has_price else 22
    wrap_w2    = 22 if has_price else 30

    name_stripped = _strip_viet(name)
    if len(name_stripped) <= limit_big:
        middle_items.append((name, "4", 1, 2, 42))
    elif len(name_stripped) <= limit_med:
        middle_items.append((name, "3", 1, 2, 34))
    else:
        name_lines = _wrap_text_to_lines(name, wrap_w1)
        font_choice = "3"
        line_h = 28
        if len(name_lines) > 2 or any(len(_strip_viet(l)) > wrap_w1 for l in name_lines):
            name_lines = _wrap_text_to_lines(name, wrap_w2)
            font_choice = "2"
            line_h = 20
        for nl in name_lines:
            middle_items.append((nl, font_choice, 1, 1 if font_choice == "2" else 2, line_h))

    if mods:
        mods_lines = _wrap_text_to_lines(mods, 22)
        if len(mods_lines) > 2 or any(len(_strip_viet(l)) > 22 for l in mods_lines):
            mods_lines = _wrap_text_to_lines(mods, 30)
            for ml in mods_lines:
                middle_items.append((ml, "2", 1, 1, 18))
        else:
            for ml in mods_lines:
                middle_items.append((ml, "3", 1, 1, 22))

    cust_name = str(order.get("customer_name") or "").strip()
    cust_id = str(order.get("customer_id") or "").strip()
    if cust_id in ("0000000000", "0000"):
        cust_id = ""

    cust_parts = [p for p in (cust_name, cust_id) if p]
    if cust_parts:
        cust_str = " - ".join(cust_parts)
        cust_lines = _wrap_text_to_lines(cust_str, 22)
        for cl in cust_lines:
            middle_items.append((cl, "3", 1, 1, 20))

    if notes:
        note_str = f"GC: {notes}"
        note_lines = _wrap_text_to_lines(note_str, 22)
        if len(note_lines) > 2 or any(len(_strip_viet(l)) > 22 for l in note_lines):
            note_lines = _wrap_text_to_lines(note_str, 30)
            for nl in note_lines:
                middle_items.append((nl, "2", 1, 1, 18))
        else:
            for nl in note_lines:
                middle_items.append((nl, "3", 1, 1, 20))

    total_height = sum(item[4] for item in middle_items)
    if total_height > 155:
        scaled_items = []
        for text_str, font, sx, sy, h in middle_items:
            if font == "4":
                scaled_items.append((text_str, "3", 1, 2, 32))
            elif font == "3" and sy == 2:
                scaled_items.append((text_str, "3", 1, 1, 22))
            elif font == "3" and sy == 1:
                scaled_items.append((text_str, "2", 1, 1, 18))
            else:
                scaled_items.append((text_str, font, sx, sy, max(14, h - 4)))
        middle_items = scaled_items
        total_height = sum(item[4] for item in middle_items)

    remaining = max(0, 160 - total_height)
    gap = max(1, remaining // (len(middle_items) + 1))

    y_ptr = 40 + gap
    name_row_y = y_ptr
    for text_str, font, sx, sy, h in middle_items:
        cmd.append(T(10, y_ptr, text_str, font=font, sx=sx, sy=sy))
        y_ptr += h + gap

    # Giá tiền in ngang hàng, bên phải tên món (dòng đầu) — không chiếm thêm dòng riêng.
    if price is not None:
        cmd.append(T(300, name_row_y, _format_amount_short(price), font="3", sx=1, sy=1))

    cmd += [
        b"BAR 0,202,400,2\r\n",
        T(160, 208, time_str, font="3"),
        b"PRINT 1,1\r\n",
    ]
    return b"".join(cmd)


def label_setup_preamble() -> bytes:
    """Preamble TSPL (SIZE/GAP/SPEED/DENSITY/DIRECTION) gửi 1 LẦN DUY NHẤT ở đầu chuỗi tem."""
    return b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n"


def build_order_labels_tspl(order: dict, cups: list) -> bytes:
    """Xây dựng 1 chuỗi TSPL duy nhất cho tất cả các ly trong đơn.
    SIZE, GAP, SPEED, DENSITY được gửi 1 LẦN DUY NHẤT ở đầu chuỗi kèm preamble flush bytes.
    """
    if not cups:
        return b""
    header = b"\r\n\r\nSIZE 50 mm,30 mm\r\nGAP 3 mm,0\r\nSPEED 4\r\nDENSITY 8\r\nDIRECTION 0\r\n"
    body = b"".join(build_label_tspl(order, item, i, len(cups), include_header=False)
                    for i, item in enumerate(cups, start=1))
    return header + body

