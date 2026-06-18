#!/usr/bin/env python3
"""
Tuần 1 · Bài 1 — Đếm token của một đơn ORDERS thật.

MỤC TIÊU HỌC (không phải mục tiêu code):
  Cảm nhận bằng SỐ ba sự thật nền tảng của LLM, mà sau này giải thích mọi vụ
  "model câm / cắt ngang / đắt":
    (1) LLM đọc TOKEN, không đọc chữ. 1 từ tiếng Việt thường > 1 token.
    (2) Tiếng Việt tốn token hơn tiếng Anh cho CÙNG một nghĩa.
    (3) Cấu trúc JSON (dấu ngoặc, tên field, lặp lại) cũng ngốn token thật.

Ta đếm bằng 2 "con mắt" khác nhau để thấy tokenizer là thứ riêng của từng model:
  - tiktoken o200k_base  → bộ đếm họ GPT-4o (DÙNG LÀM THAM CHIẾU, xem ghi chú dưới)
  - gemma4:12b của bạn   → hỏi thẳng chính model qua Ollama (prompt_eval_count) = SỐ THẬT

GHI CHÚ THÀNH THẬT: tokenizer chính xác của Claude KHÔNG được Anthropic public.
tiktoken o200k_base là của OpenAI — ta dùng nó như một "thước họ GPT" để so sánh
tương đối với Gemma. Bài học (VN tốn hơn EN, JSON tốn token) đúng với MỌI tokenizer;
con số tuyệt đối thì mỗi model một khác — và đó chính là điều cần thấy.
"""

import json
import urllib.request

import tiktoken


# ── 1. Một đơn ORDERS THẬT theo Event Schema v1.1 ──────────────────────────
# Đơn điển hình của quán: 2 bạc xỉu ít đường ít đá + 1 croffle, có ghi chú VN.
ORDER = {
    "event_id": "EVT-20260612-0A3F9C",
    "event_type": "ORDER_CREATED",
    "timestamp": "2026-06-12T09:14:03+07:00",
    "schema_ver": "1.1",
    "order_id": "ORD-20260612-0042",
    "channel": "zalo",
    "utm_source": "zalo",
    "location_id": "LH01",
    "table_id": "TABLE_07",
    "staff_id": "S003",
    "customer_id": "0901234567",
    "items": [
        {
            "sku": "DR012", "name": "Bạc xỉu", "qty": 2, "price": 35000,
            "on_promo": False, "promo_price": None,
            "modifiers": {"sugar": "30%", "ice": "less"}, "recipe_id": "R012",
        },
        {
            "sku": "BK004", "name": "Croffle phô mai", "qty": 1, "price": 45000,
            "on_promo": False, "promo_price": None,
            "modifiers": {}, "recipe_id": "R104",
        },
    ],
    "status": "NEW",
    "confirmed_at": None, "making_at": None, "ready_at": None,
    "delivering_at": None, "delivered_at": None,
    "payment": {"method": "vietqr", "total": 115000, "status": "PENDING"},
    "label_printed_at": None, "invoice_url": None, "printed_at": None,
    "metadata": {
        "delivery_type": "dine_in", "business_line": "kissaten",
        "category_type": "beverage",
        "notes": "Khách quen, để bạc xỉu riêng ly thuỷ tinh, croffle hâm nóng giúp em",
    },
}


# ── 2. Hai bộ đếm ──────────────────────────────────────────────────────────
def count_gpt(text: str) -> int:
    """Đếm theo thước họ GPT-4o (tiktoken o200k_base)."""
    enc = tiktoken.get_encoding("o200k_base")
    return len(enc.encode(text))


def count_gemma(text: str) -> int:
    """
    Hỏi THẲNG model gemma4:12b trên máy bạn: nó thấy prompt này bao nhiêu token?
    Ollama trả 'prompt_eval_count' = số token của prompt. Đây là số THẬT mà model
    thực sự nạp vào context — đúng thứ bị giới hạn bởi num_ctx.
    """
    req = urllib.request.Request(
        "http://localhost:11434/api/generate",
        data=json.dumps({
            "model": "gemma4:12b",
            "prompt": text,
            "stream": False,
            "options": {"num_predict": 1},  # chỉ cần đếm prompt, sinh 1 token cho nhanh
        }).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["prompt_eval_count"]


def report(label: str, text: str) -> None:
    chars = len(text)
    gpt = count_gpt(text)
    try:
        gem = count_gemma(text)
        gem_s = f"{gem:>4}  ({chars/gem:.2f} ký tự/token)"
    except Exception as e:
        gem_s = f"  --  (Ollama lỗi: {e})"
    print(f"{label:<28} {chars:>5} ký tự | GPT {gpt:>4} ({chars/gpt:.2f} c/tok) | Gemma {gem_s}")


# ── 3. Ba thí nghiệm cho ba bài học ────────────────────────────────────────
if __name__ == "__main__":
    order_json = json.dumps(ORDER, ensure_ascii=False)

    print("\n[A] CẢ ĐƠN ORDERS (JSON đầy đủ) — đây là thứ thật sự đi vào prompt")
    print("-" * 92)
    report("Cả đơn (JSON)", order_json)

    print("\n[B] TIẾNG VIỆT vs TIẾNG ANH — cùng một nghĩa, đếm token")
    print("-" * 92)
    report("VN: ghi chú của khách", ORDER["metadata"]["notes"])
    report("EN: same meaning", "Regular customer, bạc xỉu in a separate glass cup, "
           "please warm up the croffle")  # dịch sát nghĩa
    report("VN: tên 2 món", "Bạc xỉu, Croffle phô mai")
    report("EN: 2 item names", "White coffee, Cheese croffle")

    print("\n[C] CẤU TRÚC JSON ngốn bao nhiêu? So 'cả JSON' với 'chỉ phần chữ người đọc'")
    print("-" * 92)
    human = (f"{ORDER['items'][0]['qty']} {ORDER['items'][0]['name']} "
             f"(đường {ORDER['items'][0]['modifiers']['sugar']}, đá ít), "
             f"{ORDER['items'][1]['qty']} {ORDER['items'][1]['name']}. "
             f"Ghi chú: {ORDER['metadata']['notes']}")
    report("Chỉ phần chữ (người đọc)", human)
    report("Cả JSON (máy đọc)", order_json)
    print("\n→ Chênh lệch đó = 'thuế cấu trúc'. Mỗi field, mỗi dấu {} \" : , đều là token.")
    print("  Đây là lý do nhồi 200 đơn JSON vào context tràn rất nhanh — Tuần 4 sẽ thấy rõ.\n")
