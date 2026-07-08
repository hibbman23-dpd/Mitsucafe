# -*- coding: utf-8 -*-
"""memory_store.py — Quản lý staged memory quarantine/confirmed bằng file JSONL và Git."""
import os
import json
import hashlib
import datetime
import unicodedata
import subprocess
from common import LOCAL

MEMORY_DIR = os.path.join(LOCAL, "memory")

def ensure_memory_env():
    """Đảm bảo thư mục memory tồn tại và là Git repo."""
    os.makedirs(MEMORY_DIR, exist_ok=True)
    git_dir = os.path.join(MEMORY_DIR, ".git")
    if not os.path.exists(git_dir):
        try:
            subprocess.run(["git", "init"], cwd=MEMORY_DIR, check=True, capture_output=True)
            # Tạo gitignore nội bộ
            with open(os.path.join(MEMORY_DIR, ".gitignore"), "w") as f:
                f.write("")
            subprocess.run(["git", "add", ".gitignore"], cwd=MEMORY_DIR, check=True, capture_output=True)
            subprocess.run(["git", "-c", "user.name=Hermes", "-c", "user.email=hermes@local", "commit", "-m", "initial commit"], cwd=MEMORY_DIR, check=True, capture_output=True)
            print("Initialized git repo inside local/memory/")
        except Exception as e:
            print(f"[warning] Git init in memory/ failed: {e}")

def normalize_text(text):
    """Chuẩn hóa văn bản tiếng Việt NFC, bỏ khoảng trắng thừa, viết thường."""
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    return " ".join(text.lower().strip().split())

def make_id(kind, text):
    """Tạo sha1 ID duy nhất từ kind và normalized text (12 ký tự)."""
    norm = normalize_text(text)
    h = hashlib.sha1(f"{kind}:{norm}".encode("utf-8")).hexdigest()
    return h[:12]

def read_jsonl(filename):
    path = os.path.join(MEMORY_DIR, filename)
    if not os.path.exists(path):
        return []
    items = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except:
                pass
    return items

def write_jsonl(filename, items):
    path = os.path.join(MEMORY_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")

def add_quarantine(text, kind="pattern", period_days=7):
    """Thêm một pattern/action vào quarantine để chờ phê duyệt hoặc xác nhận."""
    ensure_memory_env()
    items = read_jsonl("quarantine.jsonl")
    
    qid = make_id(kind, text)
    
    # Kiểm tra trùng lặp
    found = False
    for it in items:
        if it["id"] == qid:
            it["hits"] = it.get("hits", 0) + 1
            it["last_seen"] = datetime.date.today().isoformat()
            found = True
            break
            
    if not found:
        # Giới hạn tối đa 30 mục trong quarantine, loại bỏ mục ít hits nhất nếu đầy
        if len(items) >= 30:
            items.sort(key=lambda x: x.get("hits", 1))
            evicted = items.pop(0)
            print(f"Quarantine full, evicted: {evicted['text']}")
            
        today = datetime.date.today()
        # expires = tối đa của 14 ngày hoặc 3 * chu kỳ quan sát
        expires_days = max(14, 3 * period_days)
        expires_date = today + datetime.timedelta(days=expires_days)
        
        items.append({
            "id": qid,
            "text": text,
            "kind": kind,
            "created": today.isoformat(),
            "last_seen": today.isoformat(),
            "period_days": period_days,
            "hits": 1,
            "misses": 0,
            "expires": expires_date.isoformat()
        })
        
    write_jsonl("quarantine.jsonl", items)
    print(f"Quarantined {kind}: {text} (ID: {qid})")
    return qid

def promote(qid):
    """Phê duyệt / Đẩy một mục từ quarantine lên confirmed hoặc decision_log."""
    ensure_memory_env()
    q_items = read_jsonl("quarantine.jsonl")
    
    # Tìm mục cần promote
    target = None
    remaining_q = []
    for it in q_items:
        if it["id"] == qid:
            target = it
        else:
            remaining_q.append(it)
            
    if not target:
        print(f"Error: ID {qid} không tồn tại trong quarantine.")
        return False
        
    today_str = datetime.date.today().isoformat()
    
    if target["kind"] == "pattern":
        # Thêm vào confirmed_patterns (được nạp vào RAG)
        c_items = read_jsonl("confirmed_patterns.jsonl")
        # Tránh trùng lặp trong confirmed
        if not any(it["id"] == qid for it in c_items):
            c_items.append({
                "id": qid,
                "text": target["text"],
                "promoted_at": today_str,
                "misses": 0
            })
            write_jsonl("confirmed_patterns.jsonl", c_items)
            print(f"Promoted pattern to confirmed: {target['text']}")
            
    elif target["kind"] == "action":
        # Thêm vào decision_log (KHÔNG nạp vào RAG)
        d_items = read_jsonl("decision_log.jsonl")
        if not any(it["id"] == qid for it in d_items):
            d_items.append({
                "id": qid,
                "text": target["text"],
                "approved_at": today_str,
                "outcome": None # Sẽ điền sau 14 ngày khi đối soát doanh thu
            })
            write_jsonl("decision_log.jsonl", d_items)
            print(f"Promoted action to decision_log: {target['text']}")
            
    # Lưu lại quarantine mới
    write_jsonl("quarantine.jsonl", remaining_q)
    return True

def decay():
    """Dọn dẹp và giảm tuổi thọ bộ nhớ (chạy định kỳ hàng tuần)."""
    ensure_memory_env()
    today = datetime.date.today()
    today_str = today.isoformat()
    
    # 1. Quét quarantine: nếu quá hạn expires -> chuyển sang archive.jsonl
    q_items = read_jsonl("quarantine.jsonl")
    remaining_q = []
    archived_count = 0
    archive_items = read_jsonl("archive.jsonl")
    
    for it in q_items:
        expires = datetime.date.fromisoformat(it["expires"])
        if today >= expires:
            it["archived_at"] = today_str
            archive_items.append(it)
            archived_count += 1
        else:
            remaining_q.append(it)
            
    if archived_count > 0:
        write_jsonl("quarantine.jsonl", remaining_q)
        write_jsonl("archive.jsonl", archive_items)
        print(f"Decayed {archived_count} items from quarantine to archive.")
        
    # 2. Quét confirmed_patterns: nếu misses >= 2 -> hạ cấp (demote) về lại quarantine
    c_items = read_jsonl("confirmed_patterns.jsonl")
    remaining_c = []
    demoted_count = 0
    q_items = read_jsonl("quarantine.jsonl") # Đọc lại quarantine mới nhất
    
    for it in c_items:
        if it.get("misses", 0) >= 2:
            # Hạ cấp về quarantine
            q_items.append({
                "id": it["id"],
                "text": it["text"],
                "kind": "pattern",
                "created": today_str,
                "last_seen": today_str,
                "period_days": 7,
                "hits": 1,
                "misses": 0,
                "expires": (today + datetime.timedelta(days=14)).isoformat()
            })
            demoted_count += 1
            print(f"Demoted pattern back to quarantine: {it['text']}")
        else:
            remaining_c.append(it)
            
    if demoted_count > 0:
        write_jsonl("confirmed_patterns.jsonl", remaining_c)
        write_jsonl("quarantine.jsonl", q_items)
        print(f"Demoted {demoted_count} pattern(s) from confirmed due to negative feedback.")

def snapshot(label):
    """Tạo Git commit snapshot bộ nhớ tại local/memory/."""
    ensure_memory_env()
    today_str = datetime.date.today().isoformat()
    try:
        subprocess.run(["git", "add", "-A"], cwd=MEMORY_DIR, check=True, capture_output=True)
        # Kiểm tra xem có gì để commit không
        status = subprocess.run(["git", "status", "--porcelain"], cwd=MEMORY_DIR, check=True, capture_output=True, text=True)
        if status.stdout.strip():
            msg = f"snapshot {label} {today_str}"
            subprocess.run([
                "git", 
                "-c", "user.name=Hermes", 
                "-c", "user.email=hermes@local", 
                "commit", "-m", msg
            ], cwd=MEMORY_DIR, check=True, capture_output=True)
            print(f"Git snapshot committed: {msg}")
            return True
        else:
            print("No changes in memory, skipping git commit.")
            return False
    except Exception as e:
        print(f"Error during git snapshot in memory: {e}")
        return False
