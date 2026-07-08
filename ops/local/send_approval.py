# -*- coding: utf-8 -*-
"""send_approval.py — Gửi các đề xuất hành động từ quarantine lên Telegram với nút bấm duyệt."""
import os
import sys
import json
import urllib.request
from common import LOCAL, quan, config_value, tg_send

def load_quarantine():
    q_path = os.path.join(LOCAL, "memory", "quarantine.jsonl")
    if not os.path.exists(q_path):
        return []
    items = []
    with open(q_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                try:
                    items.append(json.loads(line))
                except:
                    pass
    return items

def save_quarantine(items):
    q_path = os.path.join(LOCAL, "memory", "quarantine.jsonl")
    with open(q_path, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")

def main():
    q = quan()
    items = load_quarantine()
    
    # Lọc các mục là hành động đề xuất chưa được gửi đi
    actions_to_send = [it for it in items if it.get("kind") == "action" and not it.get("sent_to_tg")]
    
    if not actions_to_send:
        print("Không có hành động đề xuất mới trong quarantine cần gửi duyệt.")
        return
        
    # Giới hạn tối đa 3 đề xuất gửi đi mỗi ngày để tránh spam
    limit = min(3, len(actions_to_send))
    sent_count = 0
    
    for it in actions_to_send[:limit]:
        qid = it["id"]
        text = it["text"]
        
        # Định nghĩa bàn phím inline duyệt Telegram
        reply_markup = {
            "inline_keyboard": [
                [
                    {"text": "👍 Đồng ý", "callback_data": f"ok:{qid}"},
                    {"text": "👎 Từ chối", "callback_data": f"no:{qid}"}
                ]
            ]
        }
        
        message_text = f"❓ <b>[ĐỀ XUẤT HÀNH ĐỘNG]</b>\nHệ thống quan sát thấy tín hiệu và đề xuất hành động sau:\n\n👉 <i>{text}</i>\n\nBạn có đồng ý thực hiện không?"
        
        try:
            tg_send(message_text, reply_markup=reply_markup)
            # Đánh dấu đã gửi
            for item in items:
                if item["id"] == qid:
                    item["sent_to_tg"] = True
            sent_count += 1
            print(f"Sent approval request for ID: {qid}")
        except Exception as e:
            print(f"Error sending approval to Telegram: {e}", file=sys.stderr)
            
    if sent_count > 0:
        save_quarantine(items)
        print(f"Đã gửi {sent_count} đề xuất duyệt lên Telegram.")

if __name__ == "__main__":
    main()
