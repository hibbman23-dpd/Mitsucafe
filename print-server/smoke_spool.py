"""smoke_spool.py — self-contained live smoke test of the spool print path.

Runs a REAL HTTP server on a temp port against a THROWAWAY database (never touches
the production outbox.db), posts the same orders the shop rollout uses, and prints
PASS/FAIL for each. Needs no printer, no launchd, no GAS.

Run:  cd print-server && python3 smoke_spool.py
Pass: every line shows PASS and it exits 0.
"""
import os, sys, tempfile, threading, time, json, urllib.request, socket

os.environ.setdefault("GAS_WEBAPP_URL", "http://gas.invalid")   # never called (fake_reserve below)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import print_server
from gateway import Gateway
from print_spool import PrintSpool

# --- bind to a throwaway DB; NEVER the real outbox.db ---
DB = tempfile.mktemp(suffix=".smoke.db")
def _fake_reserve(dtype, n):
    return {"letter": "Q", "date": "20260723", "from": 1, "to": n}
print_server.GATEWAY = Gateway(DB, "http://gas", "tok", reserve_fn=_fake_reserve, today="20260723")
print_server.SPOOL = PrintSpool(print_server.GATEWAY._conn, print_server.GATEWAY._lock)
print_server._gas_post = lambda payload, timeout=8: {"ok": True}   # no network
os.environ["PRINT_ENGINE"] = "spool"     # routes read this dynamically; import-time was legacy so NO worker threads run

SPOOL = print_server.SPOOL

def _free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p

PORT = _free_port()
BASE = f"http://127.0.0.1:{PORT}"

def _serve():
    from werkzeug.serving import make_server
    global _srv
    _srv = make_server("127.0.0.1", PORT, print_server.app)
    _srv.serve_forever()

def _post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())

def _labels(order_id):
    return SPOOL._conn.execute(
        "SELECT idempotency_key FROM print_spool WHERE order_id=? AND kind='label' ORDER BY seq_in_order",
        (order_id,)).fetchall()

def _receipts(order_id):
    return SPOOL._conn.execute(
        "SELECT idempotency_key, order_id, payload_json FROM print_spool WHERE order_id=? AND kind='receipt'",
        (order_id,)).fetchall()

_fail = 0
def check(name, cond, detail=""):
    global _fail
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        _fail += 1

def main():
    t = threading.Thread(target=_serve, daemon=True); t.start()
    # wait for server up
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + "/health", timeout=1); break
        except Exception:
            time.sleep(0.1)

    print("1) Order with 2 cups -> 2 label jobs")
    d = _post("/order", {"items": [{"name": "Bac xiu", "qty": 2, "price": 30000,
              "modifiers": {"size": "M", "sugar": "50%", "ice": "less"}}],
              "metadata": {"delivery_type": "dine_in"}, "table_id": "02", "idempotency_key": "s1"})
    oid1 = d.get("order_id", "")
    rows = _labels(oid1)
    check("response ok + order_id", d.get("ok") and oid1.startswith("ORD-"), str(d))
    check("exactly 2 label jobs", len(rows) == 2, f"got {len(rows)}")
    check("keys ORD:label:1,2", [r["idempotency_key"] for r in rows] == [f"{oid1}:label:1", f"{oid1}:label:2"])

    print("2) Order with 10 cups -> 10 label jobs (no missing cup)")
    d = _post("/order", {"items": [{"name": "Tra sua", "qty": 10, "price": 35000, "modifiers": {"size": "L"}}],
              "metadata": {"delivery_type": "dine_in"}, "table_id": "05", "idempotency_key": "s10"})
    check("exactly 10 label jobs", len(_labels(d["order_id"])) == 10, f"got {len(_labels(d['order_id']))}")

    print("3) Five back-to-back orders -> none dropped")
    ids = []
    for i in range(1, 6):
        d = _post("/order", {"items": [{"name": "Ca phe", "qty": 1, "price": 25000, "modifiers": {}}],
                  "metadata": {"delivery_type": "dine_in"}, "table_id": f"0{i}", "idempotency_key": f"sb{i}"})
        ids.append(d["order_id"])
    check("5 distinct orders each with 1 label", all(len(_labels(o)) == 1 for o in ids) and len(set(ids)) == 5)

    print("4) Cash mark_paid -> 1 receipt job with REAL order_id + is_cash (the bug that was fixed)")
    d = _post("/order", {"items": [{"name": "Combo", "qty": 1, "price": 50000, "modifiers": {}}],
              "metadata": {"delivery_type": "dine_in"}, "table_id": "08", "idempotency_key": "spay"})
    oid = d["order_id"]
    _post("/order/mark_paid", {"order_id": oid, "payment_method": "cash"})
    rec = _receipts(oid)
    check("exactly 1 receipt job", len(rec) == 1, f"got {len(rec)}")
    check("receipt key uses real order_id (not ':receipt:0')",
          len(rec) == 1 and rec[0]["idempotency_key"] == f"{oid}:receipt:0" and rec[0]["order_id"] == oid)
    check("is_cash true -> drawer will kick", len(rec) == 1 and json.loads(rec[0]["payload_json"])["is_cash"] is True)

    print("5) Two receipts in a row -> BOTH enqueue (regression: before fix, 2nd was dropped)")
    o2 = _post("/order", {"items": [{"name": "Tra", "qty": 1, "price": 20000, "modifiers": {}}],
               "metadata": {"delivery_type": "dine_in"}, "table_id": "09", "idempotency_key": "spay2"})["order_id"]
    _post("/order/mark_paid", {"order_id": o2, "payment_method": "vietqr"})
    total_receipts = SPOOL._conn.execute("SELECT COUNT(*) FROM print_spool WHERE kind='receipt'").fetchone()[0]
    check("2 separate receipts both present", total_receipts == 2, f"got {total_receipts}")
    check("vietqr receipt is_cash false -> no drawer",
          json.loads(_receipts(o2)[0]["payload_json"])["is_cash"] is False)

    print()
    if _fail == 0:
        print("SMOKE RESULT: ALL PASS — spool /order + mark_paid path works end-to-end.")
    else:
        print(f"SMOKE RESULT: {_fail} CHECK(S) FAILED.")
    try:
        _srv.shutdown()
    except Exception:
        pass
    if os.path.exists(DB):
        os.remove(DB)
    sys.exit(1 if _fail else 0)

if __name__ == "__main__":
    main()
