"""
generate_qr.py — Tạo QR sticker cho từng bàn + các kênh đặt hàng.

Mỗi QR encode URL tới ordering PWA với table param:
  https://hibbman23.github.io/kaerukaphe/?t=01

Output:  qr/labels/table_XX.png  (1 file per bàn)

Usage:
    pip install qrcode[pil]
    python3 generate_qr.py
    python3 generate_qr.py --base-url https://... --tables 12
"""
import argparse
from pathlib import Path

import qrcode
from qrcode.constants import ERROR_CORRECT_H

DEFAULT_BASE_URL = "https://hibbman23.github.io/kaerukaphe/"
OUT_DIR = Path(__file__).parent / "labels"


def make_qr(url: str, out_path: Path) -> None:
    qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(out_path)
    print(f"  ✓ {out_path.name}  →  {url}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--tables", type=int, default=12)
    args = parser.parse_args()

    base = args.base_url.rstrip("/") + "/"
    OUT_DIR.mkdir(exist_ok=True)

    print(f"Generating {args.tables} table QRs into {OUT_DIR}/")
    for i in range(1, args.tables + 1):
        url = f"{base}?t={i:02d}"
        make_qr(url, OUT_DIR / f"table_{i:02d}.png")

    print(f"\nGenerating takeaway QR (no table param)")
    make_qr(base, OUT_DIR / "takeaway.png")

    print(f"\nDone — {args.tables + 1} files. In + ép nhựa → dán mỗi bàn 1 QR.")


if __name__ == "__main__":
    main()
