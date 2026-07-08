# -*- coding: utf-8 -*-
"""pull_approvals.py — Định kỳ kéo ý kiến phê duyệt của chủ quán từ Cloudflare Worker về Mac Mini."""
import os
import sys
import json
import urllib.request
import urllib.parse
from common import LOCAL, quan, config_value, ping
import memory_store

def main():
    q = quan()
    worker_url = q["ops"]["worker_url"]
    shop_id = q["shop"]["id"]
    ops_key = config_value("OPS_WORKER_KEY")
    
    # 1. Gọi GET /pull?shop=mitsu-lamha
    url = f"{worker_url}/pull?shop={urllib.parse.quote(shop_id)}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {ops_key}")
    
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            verdicts = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"Error pulling from worker: {e}", file=sys.stderr)
        sys.exit(1)
        
    if not verdicts:
        print("Không có ý kiến phê duyệt mới nào từ Cloudflare Worker.")
        return
        
    print(f"Nhận được {len(verdicts)} ý kiến phê duyệt từ Cloudflare Worker:")
    
    processed_ids = []
    
    # Đọc quarantine để thao tác
    q_items = memory_store.read_jsonl("quarantine.jsonl")
    
    for item in verdicts:
        qid = item["id"]
        verdict = item["verdict"] # "ok" hoặc "no"
        
        # Tìm mục tương ứng trong quarantine
        target = None
        for it in q_items:
            if it["id"] == qid:
                target = it
                break
                
        if not target:
            # Có thể mục này đã được promote ở vòng trước hoặc đã hết hạn, bỏ qua và ack để xóa khỏi KV
            print(f"[Warning] ID {qid} không còn trong quarantine. Sẽ ack để xóa khỏi KV.")
            processed_ids.append(qid)
            continue
            
        if verdict == "ok":
            # Chấp thuận -> promote lên confirmed hoặc decision_log
            success = memory_store.promote(qid)
            if success:
                processed_ids.append(qid)
        elif verdict == "no":
            # Từ chối -> tăng số lần trượt (misses), giữ lại quarantine để tự động trôi/hết hạn
            for it in q_items:
                if it["id"] == qid:
                    it["misses"] = it.get("misses", 0) + 1
                    print(f"Rejected ID {qid}: {it['text']} (tăng misses lên {it['misses']})")
                    break
            processed_ids.append(qid)
            
    # Ghi lại quarantine nếu có cập nhật misses
    memory_store.write_jsonl("quarantine.jsonl", q_items)
    
    # 2. Đồng bộ commit git snapshot memory
    if processed_ids:
        memory_store.snapshot("pull_approvals_processed")
        
        # 3. Gửi POST /ack?shop=mitsu-lamha để xóa các key đã xử lý thành công
        ack_url = f"{worker_url}/ack?shop={urllib.parse.quote(shop_id)}"
        ack_body = json.dumps({"ids": processed_ids}).encode("utf-8")
        
        ack_req = urllib.request.Request(
            ack_url,
            data=ack_body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {ops_key}"},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(ack_req, timeout=15) as ack_r:
                ack_res = json.loads(ack_r.read().decode("utf-8"))
                print(f"Acknowledged processed IDs with Cloudflare: {ack_res}")
        except Exception as e:
            print(f"[Warning] Ack with worker failed: {e}", file=sys.stderr)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    ping("pull_approvals")
