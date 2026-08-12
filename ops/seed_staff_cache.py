#!/usr/bin/env python3
"""seed_staff_cache.py — nạp tay danh sách nhân viên cho app chấm công.

Dùng khi chưa deploy Apps Script (worker chưa lấy được STAFF về), hoặc khi
mạng chết mà vẫn cần chấm công ngay.

    cd ~/Projects/lamha-kissaten
    python3 ops/seed_staff_cache.py

PHẢI chạy trong Terminal thật (bàn phím). PIN gõ ẩn, không hiện lên màn hình,
được băm SHA-256 + salt trước khi ghi xuống đĩa — file cache không bao giờ
chứa PIN dạng thô.

Sau khi chạy xong PHẢI restart print_server, vì tiến trình đang chạy giữ bản
cache trong bộ nhớ từ lúc khởi động và không tự đọc lại file:

    launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver

Khi deploy Apps Script xong, worker sẽ tự ghi đè file này bằng dữ liệu từ
sheet STAFF (mỗi 10 phút). Lúc đó không cần chạy script này nữa.
"""
import getpass
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "print-server"))

from attendance_auth import StaffCache          # noqa: E402

CACHE = os.path.join(HERE, "..", "print-server", "staff_cache.json")


def ask(prompt, default=None, required=True):
    while True:
        v = input(prompt).strip()
        if not v and default is not None:
            return default
        if v or not required:
            return v
        print("   → không được để trống.")


def main():
    if not sys.stdin.isatty():
        sys.exit("Phải chạy trong Terminal thật — script cần bàn phím để nhập PIN.\n"
                 "Mở Terminal, cd ~/Projects/lamha-kissaten, rồi chạy lại.")

    print("Nạp danh sách nhân viên cho app chấm công.")
    print("Bỏ trống ô Tên để kết thúc.\n")

    rows = []
    while True:
        name = ask("Tên (bỏ trống để xong): ", default="", required=False)
        if not name:
            break
        staff_id = ask("   Mã nhân viên (vd S001): ")
        role = ask("   Vai trò [barista/owner] (Enter = barista): ",
                   default="barista").lower()
        while True:
            pin = getpass.getpass("   PIN 4 số (gõ không hiện): ")
            if pin.isdigit() and len(pin) == 4:
                break
            print("   → PIN phải đúng 4 chữ số.")
        rows.append({"staff_id": staff_id, "name": name, "role": role,
                     "active": True, "pin": pin})
        print(f"   ✓ {name} ({staff_id}, {role})\n")

    if not rows:
        sys.exit("Không nhập ai. Không ghi gì cả.")

    if not any(r["role"] == "owner" for r in rows):
        print("\n⚠️  Không có ai vai trò 'owner' — sẽ KHÔNG mở được Bảng công.")
        if ask("Vẫn ghi? [y/N]: ", default="n").lower() != "y":
            sys.exit("Đã huỷ, không ghi gì.")

    StaffCache(os.path.abspath(CACHE)).replace(rows)

    print(f"\n✓ Đã ghi {len(rows)} người vào {os.path.abspath(CACHE)}")
    print("  PIN đã băm, file để quyền 600, không chứa PIN dạng thô.\n")
    print("Bước cuối — restart print_server để nó đọc bản mới:")
    print("  launchctl kickstart -k gui/$(id -u)/com.lamha.kissaten.printserver")


if __name__ == "__main__":
    main()
