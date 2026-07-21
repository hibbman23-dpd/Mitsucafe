#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
local/setup_secrets.py — Script tự động hóa cấu hình mã bảo mật.
Chạy bằng lệnh: python3 local/setup_secrets.py
"""

import os
import secrets

def generate_secret():
    return secrets.token_hex(16)

def update_run_script(camera_secret):
    run_script_path = "ops/run_camera_ai.sh"
    if not os.path.exists(run_script_path):
        print(f"❌ Không tìm thấy tệp {run_script_path}. Bạn đang chạy script từ đúng thư mục gốc dự án chứ?")
        return False
        
    with open(run_script_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    updated = False
    for i, line in enumerate(lines):
        if line.strip().startswith('export CAMERA_AI_SECRET='):
            lines[i] = f'export CAMERA_AI_SECRET="{camera_secret}"\n'
            updated = True
            break
            
    if not updated:
        # Nếu không thấy thì tìm vị trí trước app run để chèn vào
        for i, line in enumerate(lines):
            if "ops/dual_camera_ai.py" in line:
                lines.insert(i, f'export CAMERA_AI_SECRET="{camera_secret}"\n\n')
                updated = True
                break
                
    if updated:
        with open(run_script_path, "w", encoding="utf-8") as f:
            f.writelines(lines)
        print(f"✅ Đã cập nhật tự động CAMERA_AI_SECRET vào tệp: {run_script_path}")
        return True
    else:
        print(f"❌ Không tìm thấy dòng cấu hình thích hợp trong {run_script_path}")
        return False

def main():
    print("=" * 60)
    print(" HỆ THỐNG TỰ ĐỘNG CẤU HÌNH MÃ BẢO MẬT MITSU CAFE")
    print("=" * 60)
    
    # 1. Tạo/Nhập Camera Secret
    print("\n[1/2] CẤU HÌNH CAMERA AI SECRET")
    user_cam = input("Nhập mã CAMERA_AI_SECRET của bạn (Nhấn Enter để hệ thống tự tạo ngẫu nhiên): ").strip()
    camera_secret = user_cam if user_cam else generate_secret()
    
    # 2. Tạo/Nhập Bank Webhook Secret
    print("\n[2/2] CẤU HÌNH BANK WEBHOOK SECRET")
    user_bank = input("Nhập mã BANK_WEBHOOK_SECRET của bạn (Nhấn Enter để hệ thống tự tạo ngẫu nhiên): ").strip()
    bank_secret = user_bank if user_bank else generate_secret()
    
    print("\n" + "-" * 50)
    print("Đang tiến hành cài đặt tự động...")
    print("-" * 50)
    
    # Cập nhật run_camera_ai.sh
    sh_ok = update_run_script(camera_secret)
    
    print("\n" + "=" * 60)
    print(" CÁC BƯỚC BẠN CẦN LÀM TIẾP THEO:")
    print("=" * 60)
    
    print(f"\n👉 BƯỚC 1: Sao chép các mã sau vào tab CONFIG trên Google Sheet:")
    print(f"   - Thêm key: CAMERA_AI_SECRET  -> Giá trị: {camera_secret}")
    print(f"   - Thêm key: BANK_WEBHOOK_SECRET -> Giá trị: {bank_secret}")
    
    print(f"\n👉 BƯỚC 2: Cập nhật MacroDroid trên điện thoại đối soát:")
    print(f"   - Mở HTTP POST action gửi webhook ngân hàng.")
    print(f"   - Thêm vào JSON body trường: \"secret\": \"{bank_secret}\"")
    
    print(f"\n👉 BƯỚC 3: Mở đường link sau trên trình duyệt POS tại quầy:")
    print(f"   https://ops.mitsu.cafe/?camera_secret={camera_secret}")
    print(f"   (Link này sẽ tự động lưu khóa bí mật để kích hoạt giao tiếp Camera AI)")
    
    if sh_ok:
        print(f"\n👉 BƯỚC 4: Khởi chạy Camera AI trên Mac Mini bằng cách chạy lệnh:")
        print(f"   bash ops/run_camera_ai.sh")
        
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
