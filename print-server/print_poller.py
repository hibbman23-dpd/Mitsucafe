"""
print_poller.py — Mac Mini polling GAS cho receipt print jobs.

Kiến trúc: Mac Mini tự poll GAS mỗi vài giây qua HTTPS (GAS không thể push
về LAN vì chạy trên Google Cloud).

Flow:
  1. GET {GAS_URL}?action=pending_print  → danh sách đơn DELIVERED chưa in
  2. Với mỗi đơn: build ESC/POS receipt → POST localhost:5001/print/receipt
  3. GET {GAS_URL}?action=mark_printed&order_id=...  → đánh dấu đã in

Chế độ in:
  RASTER (mặc định): render PIL image → GS v 0 bitmap.
    + Tiếng Việt đầy đủ dấu (dùng Arial Unicode font có sẵn trên macOS).
    + Không phụ thuộc font ROM máy in.
  TEXT (fallback): ESC/POS text mode với CP1258.

ENV vars:
  GAS_WEBAPP_URL      URL GAS Web App (bắt buộc)
  PRINT_SERVER_URL    URL Flask print server (default: http://127.0.0.1:5001)
  POLL_INTERVAL       Giây giữa 2 lần poll (default: 3)
  RECEIPT_MODE        raster | text  (default: raster)
  RASTER_FONT         Đường dẫn tới file .ttf (default: auto-detect)
  RASTER_DOTS_WIDTH   Dot width của máy in (default: 384)
"""

import logging
import os
import ssl
import time
import json
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
GAS_WEBAPP_URL    = os.getenv("GAS_WEBAPP_URL", "")
PRINT_SERVER_URL  = os.getenv("PRINT_SERVER_URL", "http://127.0.0.1:5001")
POLL_INTERVAL     = float(os.getenv("POLL_INTERVAL", "3"))
RECEIPT_MODE      = os.getenv("RECEIPT_MODE", "raster")   # raster | text
RASTER_FONT_ENV   = os.getenv("RASTER_FONT", "")
RASTER_DOTS_WIDTH = int(os.getenv("RASTER_DOTS_WIDTH", "384"))
LABEL_DOTS_WIDTH  = int(os.getenv("LABEL_DOTS_WIDTH",  "400"))  # 50mm × 8dots/mm
LABEL_DOTS_HEIGHT = int(os.getenv("LABEL_DOTS_HEIGHT", "240"))  # 30mm × 8dots/mm

_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("print-poller")


# ── macOS SSL fix ─────────────────────────────────────────────────────────────
def _ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


# ── Font discovery ────────────────────────────────────────────────────────────
_FONT_CANDIDATES = [
    # Người dùng chỉ định
    RASTER_FONT_ENV,
    # Arial Unicode — đủ ký tự tiếng Việt, có sẵn trên macOS
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    # San Francisco (macOS system font)
    "/System/Library/Fonts/SFNS.ttf",
    # Fallback
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


# ── Raster receipt builder ────────────────────────────────────────────────────
_W   = RASTER_DOTS_WIDTH   # dot width của máy in (384 = 58mm @ 203dpi)
_PAD = 10                  # padding trái/phải (dots)
_CW  = _W - 2 * _PAD      # content width

# Font sizes — receipt (58mm)
_SZ_HEADER  = 26   # tên quán
_SZ_LOGO    = 22   # logo frog
_SZ_ADDR    = 13   # địa chỉ
_SZ_NORMAL  = 15   # nội dung chính
_SZ_SMALL   = 13   # modifier, ghi chú
_SZ_TOTAL   = 17   # tổng tiền

# Font sizes — label (50×30mm)
_SZ_LBL_HDR  = 18  # header: short_code + location + [cup/total]
_SZ_LBL_ITEM = 30  # tên món (lớn, dễ đọc)
_SZ_LBL_MOD  = 15  # modifier
_SZ_LBL_TIME = 13  # giờ


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
    pixels = img_gray.tobytes()    # 1 byte/pixel, row-major (L mode)
    result = bytearray(bytes_per_row * h)
    for y in range(h):
        row_start = y * w
        for x in range(w):
            if pixels[row_start + x] < 128:   # pixel tối → in dot
                result[y * bytes_per_row + x // 8] |= (0x80 >> (x % 8))
    return bytes(result)


def build_receipt_raster(order: dict) -> bytes:
    """Render hoá đơn dưới dạng PIL image, xuất ESC/POS raster bytes.

    Hỗ trợ đầy đủ tiếng Việt dấu via Arial Unicode font.
    Không phụ thuộc font ROM của máy in.
    """
    from PIL import Image, ImageDraw

    W, PAD, CW = _W, _PAD, _CW

    f_logo   = _load_font(_SZ_LOGO)
    f_header = _load_font(_SZ_HEADER)
    f_addr   = _load_font(_SZ_ADDR)
    f_norm   = _load_font(_SZ_NORMAL)
    f_small  = _load_font(_SZ_SMALL)
    f_total  = _load_font(_SZ_TOTAL)

    def tw(text, font):
        bb = font.getbbox(text)
        return bb[2] - bb[0]

    def lh(font, extra=4):
        bb = font.getbbox("Agypjq")
        return bb[3] - bb[1] + extra

    # ── Collect drawing commands ──────────────────────────────────────────────
    # Each cmd: ("text", x, y, text, font) | ("hline", y, thick)
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

    # ── Header ────────────────────────────────────────────────────────────────
    add_text(">(^_^)<",          f_logo,   "center")
    add_gap(2)
    add_text("KaeruKàphê",       f_header, "center")
    add_gap(1)
    add_text("Lâm Hà, Lâm Đồng", f_addr,  "center")
    add_hline(thick=2, gap_before=4, gap_after=4)

    # ── Thời gian + mã đơn ────────────────────────────────────────────────────
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

    # ── Items ─────────────────────────────────────────────────────────────────
    for it in (order.get("items") or []):
        name = it.get("name", "?")
        size = (it.get("modifiers") or {}).get("size", "")
        if size:
            name += f" ({size})"
        qty   = it.get("qty", 1)
        price = it.get("price", 0)

        right_str = f"x{qty}  {_format_amount(price)}"
        right_w   = tw(right_str, f_norm)
        max_name_w = CW - right_w - 6

        # Truncate name nếu quá dài
        while len(name) > 1 and tw(name, f_norm) > max_name_w:
            name = name[:-1]

        # Vẽ tên (trái) + giá (phải) trên cùng 1 hàng
        name_x  = PAD
        price_x = W - PAD - right_w
        cmds.append(("text", name_x,  y, name,       f_norm))
        cmds.append(("text", price_x, y, right_str,  f_norm))
        y += lh(f_norm)

        mods = _mods_line(
            {k: v for k, v in (it.get("modifiers") or {}).items() if k != "size"}
        )
        if mods:
            add_text(mods, f_small, indent=12)

    notes = meta.get("notes", "")
    if notes:
        add_text(f"Ghi chú: {notes}", f_small, indent=0)

    add_hline(thick=1, gap_before=3, gap_after=3)

    # ── Tổng tiền ─────────────────────────────────────────────────────────────
    total_str = f"Tổng:  {_format_amount(order.get('total', 0))}đ"
    pmt_str   = f"TT:  {_payment_label((order.get('payment') or {}).get('method', ''))}"

    add_text(total_str, f_total, "right")
    add_text(pmt_str,   f_norm,  "right")
    add_hline(thick=2, gap_before=4, gap_after=4)

    # ── Footer ────────────────────────────────────────────────────────────────
    add_text("Cảm ơn! Hẹn gặp lại nhé!", f_norm, "center")
    add_text("KaeruKàphê",               f_addr,  "center")
    add_hline(thick=1, gap_before=3, gap_after=6)

    # ── Render to PIL Image ───────────────────────────────────────────────────
    height = y + 8
    img = Image.new("L", (W, height), 255)   # white background
    draw = ImageDraw.Draw(img)

    for cmd in cmds:
        if cmd[0] == "text":
            _, x, cy, text, font = cmd
            draw.text((x, cy), text, font=font, fill=0)
        elif cmd[0] == "hline":
            _, cy, thick = cmd
            draw.line([(PAD, cy), (W - PAD, cy)], fill=0, width=thick)

    # ── Raster → ESC/POS bytes ────────────────────────────────────────────────
    ESC = b"\x1b"
    GS  = b"\x1d"

    raster_data  = _img_to_raster_bytes(img)
    bytes_per_row = (W + 7) // 8   # 48 for 384-dot printer
    num_rows      = height

    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = num_rows & 0xFF
    yH = (num_rows >> 8) & 0xFF

    return (
        ESC + b"@"                              # reset
        + GS + b"v0\x00"                        # GS v 0, mode=normal
        + bytes([xL, xH, yL, yH])
        + raster_data
        + b"\n\n\n\n"                           # paper feed
        + GS + b"V\x42\x00"                    # full cut
    )


# ── Text-mode fallback (CP1258) ───────────────────────────────────────────────
import unicodedata

def _viet_cp1258(s: str) -> str:
    """Chuẩn hoá về CP1258: giữ accent base khi không encode được tone phức."""
    s = s.replace("Đ", "D").replace("đ", "d")
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
    """Fallback: ESC/POS text mode (CP1258). Dùng nếu Pillow không có."""
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
        ESC + b"t\x20",           # CP1258
        ESC + b"a\x01",           # center
        ESC + b"!\x00",
        enc(">(^_^)<\n"),
        ESC + b"!\x38",
        enc("KaeruKaphê\n"),
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
    parts.append(enc(rjust("Tông: " + _format_amount(order.get("total", 0)) + "d", W) + "\n"))
    parts.append(ESC + b"!\x00")
    pmt = (order.get("payment") or {}).get("method", "")
    parts.append(enc(rjust("TT: " + _payment_label(pmt), W) + "\n"))
    parts.append(enc("=" * W + "\n"))
    parts.append(ESC + b"a\x01")
    parts.append(enc("Cam ơn! Hen gap lai nhé!\n"))
    parts.append(enc("KaeruKàphê\n"))
    parts.append(ESC + b"a\x00")
    parts.append(enc("=" * W + "\n"))
    parts.append(b"\n\n\n\n")
    parts.append(GS + b"V\x42\x00")
    return b"".join(parts)


def build_receipt(order: dict) -> bytes:
    """Chọn raster hoặc text mode tùy config."""
    if RECEIPT_MODE == "text":
        return build_receipt_text(order)
    try:
        return build_receipt_raster(order)
    except Exception as exc:
        log.warning("Raster build failed (%s), fallback to text mode", exc)
        return build_receipt_text(order)


# ── Label builder (50×30mm — XP-365B) ────────────────────────────────────────
def _strip_viet(s: str) -> str:
    """Chuyển tiếng Việt → ASCII CAPS (Bạc xỉu → BAC XIU) cho TSPL TEXT command."""
    import unicodedata
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
    """Render 1 tem 50×30mm cho 1 item, xuất ESC/POS raster bytes.

    Layout (400×240 dots):
      Header:  #short_code  vị_trí           [cup/total]
      ════════════════════════════════════════════════
               TÊN MÓN (lớn, căn giữa)
               modifier1 / modifier2
      ────────────────────────────────────────────────
                       HH:MM
    """
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

    # ── Header: short_code + location  ·  [cup/total] ────────────────────────
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

    # ── Tên món (căn giữa, chữ lớn) ──────────────────────────────────────────
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

    # ── Modifier (căn giữa) ───────────────────────────────────────────────────
    mods = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"})
    if mods:
        while len(mods) > 2 and tw(mods, f_mod) > max_w:
            mods = mods[:-1]
        mw = tw(mods, f_mod)
        cmds.append(("text", max(PAD, (W - mw) // 2), y, mods, f_mod))
        y += lh(f_mod)

    # Ghi chú chung của đơn (nếu có)
    notes = meta.get("notes", "")
    if notes:
        note_str = "GC: " + notes
        while len(note_str) > 4 and tw(note_str, f_mod) > max_w:
            note_str = note_str[:-1]
        nw2 = tw(note_str, f_mod)
        cmds.append(("text", max(PAD, (W - nw2) // 2), y, note_str, f_mod))
        y += lh(f_mod)

    # ── Giờ đặt (căn giữa, nhỏ) ──────────────────────────────────────────────
    add_hline(thick=1)
    time_str = _format_time_only(str(order.get("timestamp", "")))
    tw_t = tw(time_str, f_time)
    cmds.append(("text", max(PAD, (W - tw_t) // 2), y, time_str, f_time))
    y += lh(f_time)

    # ── Render ────────────────────────────────────────────────────────────────
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

    # ── ESC/POS raster bytes ──────────────────────────────────────────────────
    ESC = b"\x1b"
    GS  = b"\x1d"

    raster_data   = _img_to_raster_bytes(img)
    bytes_per_row = (W + 7) // 8   # 50 bytes cho 400-dot printer

    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = H & 0xFF
    yH = (H >> 8) & 0xFF

    return (
        ESC + b"@"                              # reset
        + GS + b"v0\x00"                        # GS v 0, mode=normal (raster)
        + bytes([xL, xH, yL, yH])
        + raster_data
        + GS + b"V\x42\x00"                    # full cut
    )


# ── TSPL label builder (XP-365B) — TEXT commands ────────────────────────────
def build_label_tspl(order: dict, item: dict, cup_num: int, total_cups: int) -> bytes:
    """TSPL TEXT commands cho XP-365B tem 50×30mm — tiếng Việt đầy đủ.

    XP-365B portrait mode: x=0..239 (head=30mm), y=0..399 (feed=50mm)
    rotation=90 → text đọc left-to-right trên tem landscape vật lý.
    Mapping: physical_lx = 399−py, physical_ly = px
    Để đặt tại landscape (lx, ly): portrait px=ly, py=399−lx

    Layout landscape (50mm × 30mm):
      ly=5:  #code  vị_trí                  [cup/total]
      ly=27: ══════════════════════════════════════════ (dày 3)
      ly=32: TÊN MÓN (font lớn)
      ly=90: modifier / modifier
      ly=107: GC: ghi_chú  (nếu có)
      ly=125: ─────────────────────────────────────────
      ly=130: HH:MM (giữa label)
    """
    def T(px, py, text_str, font="4", sx=1, sy=1):
        s = _strip_viet(text_str)
        return f'TEXT {px},{py},"{font}",90,{sx},{sy},"{s}"\r\n'.encode("ascii")

    meta       = order.get("metadata") or {}
    short_code = ("#" + str(meta.get("short_code", ""))) if meta.get("short_code") \
                 else ("#" + order.get("order_id", "????")[-4:])
    loc        = _loc_label(order)
    name       = item.get("name", "?")
    size       = (item.get("modifiers") or {}).get("size", "")
    if size:
        name += f" ({size})"
    mods     = _mods_line({k: v for k, v in (item.get("modifiers") or {}).items() if k != "size"})
    notes    = (meta.get("notes") or "").strip()
    time_str = _format_time_only(str(order.get("timestamp", "")))

    cmd = [
        b"SIZE 50 mm,30 mm\r\n",
        b"GAP 3 mm,0\r\n",
        b"CLS\r\n",
        T(5, 389, f"{short_code}  {loc}"),          # Header trái: lx=10, ly=5
        T(5, 79,  f"[{cup_num}/{total_cups}]"),      # Cup counter: lx=320, ly=5
        b"BAR 27,0,3,400\r\n",                       # Kẻ dày tại landscape ly=27
        T(32, 389, name, sy=2),                      # Tên món lớn: lx=10, ly=32
    ]
    if mods:
        cmd.append(T(90, 389, mods, font="3"))       # Modifier: lx=10, ly=90
    if notes:
        py_note = 107 if mods else 90
        cmd.append(T(py_note, 389, f"GC: {notes[:28]}", font="3"))
    cmd += [
        b"BAR 125,0,1,400\r\n",                     # Kẻ mỏng tại landscape ly=125
        T(130, 199, time_str, font="3"),             # Giờ giữa: lx=200, ly=130
        b"PRINT 1\r\n",
    ]
    return b"".join(cmd)


# ── HTTP helpers ──────────────────────────────────────────────────────────────
def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "PrintPoller/1.0"})
    with urllib.request.urlopen(req, timeout=10, context=_ssl_ctx()) as resp:
        return json.loads(resp.read().decode())


def _post_bytes(url: str, data: bytes) -> dict:
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/octet-stream", "User-Agent": "PrintPoller/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


# ── Poll loops ───────────────────────────────────────────────────────────────
def poll_labels_once():
    """Poll GAS lấy đơn cần in tem, in từng tem cho từng ly."""
    url = GAS_WEBAPP_URL + "?action=pending_labels"
    try:
        result = _get_json(url)
    except Exception as exc:
        log.warning("GAS pending_labels error: %s", exc)
        return

    orders = result.get("orders") or []
    if not orders:
        log.debug("No pending label orders")
        return

    log.info("Found %d order(s) for labels", len(orders))

    for order in orders:
        order_id = order.get("order_id", "?")
        items    = order.get("items") or []

        # Expand items by qty → danh sách ly
        cups = []
        for it in items:
            qty = max(1, int(it.get("qty", 1)))
            for _ in range(qty):
                cups.append(it)
        total = len(cups)

        if total == 0:
            log.warning("Order %s: no items, skip labels", order_id)
            continue

        all_ok = True
        for i, item in enumerate(cups, start=1):
            try:
                label_data = build_label_tspl(order, item, i, total)
                resp = _post_bytes(PRINT_SERVER_URL + "/print/label", label_data)
                if not resp.get("ok"):
                    raise RuntimeError(f"Print server: {resp}")
                log.info("Label %d/%d  %s — %s (%d bytes)",
                         i, total, order_id, item.get("name", "?"), resp.get("bytes", 0))
            except Exception as exc:
                log.error("Label %d/%d failed  %s: %s", i, total, order_id, exc)
                all_ok = False

        if all_ok:
            try:
                mark_url = GAS_WEBAPP_URL + f"?action=mark_labels_printed&order_id={order_id}"
                _get_json(mark_url)
                log.info("Labels marked: %s (%d cup(s))", order_id, total)
            except Exception as exc:
                log.warning("mark_labels_printed failed  %s: %s", order_id, exc)


def poll_once():
    url = GAS_WEBAPP_URL + "?action=pending_print"
    try:
        result = _get_json(url)
    except Exception as exc:
        log.warning("GAS pending_print error: %s", exc)
        return

    orders = result.get("orders") or []
    if not orders:
        log.debug("No pending print orders")
        return

    log.info("Found %d order(s) to print", len(orders))

    for order in orders:
        order_id = order.get("order_id", "?")
        try:
            esc = build_receipt(order)
            resp = _post_bytes(PRINT_SERVER_URL + "/print/receipt", esc)
            if not resp.get("ok"):
                raise RuntimeError(f"Print server error: {resp}")
            log.info("Printed receipt for %s (%d bytes, mode=%s)",
                     order_id, resp.get("bytes", 0), RECEIPT_MODE)

            mark_url = GAS_WEBAPP_URL + f"?action=mark_printed&order_id={order_id}"
            _get_json(mark_url)
            log.info("Marked printed: %s", order_id)

        except Exception as exc:
            log.error("Failed to print %s: %s", order_id, exc)


def main():
    if not GAS_WEBAPP_URL:
        log.error("GAS_WEBAPP_URL is not set. Set the env var and restart.")
        return

    log.info(
        "Print poller started | GAS=%s... | server=%s | interval=%.1fs | receipt=%s | label=%dx%d",
        GAS_WEBAPP_URL[:60],
        PRINT_SERVER_URL,
        POLL_INTERVAL,
        RECEIPT_MODE,
        LABEL_DOTS_WIDTH,
        LABEL_DOTS_HEIGHT,
    )

    while True:
        try:
            poll_labels_once()   # tem dán ly — ưu tiên trước (time-sensitive)
        except Exception as exc:
            log.error("poll_labels_once unhandled: %s", exc)
        try:
            poll_once()          # hoá đơn nhiệt
        except Exception as exc:
            log.error("poll_once unhandled: %s", exc)
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
