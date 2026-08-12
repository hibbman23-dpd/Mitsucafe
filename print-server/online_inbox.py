"""online_inbox.py — kéo đơn mitsu.cafe từ GAS mailbox và NHẬP THẲNG vào
OrderStore. Không còn hộp chờ duyệt: đơn tự lên KDS, nhân viên chặn bằng nút
Từ chối (mô hình "đơn tự chạy, chặn là ngoại lệ" — tem đã in trước khi có ai
bấm gì nên "chờ duyệt" là trạng thái giả).

Giữ nguyên order_id + short_code do GAS cấp: tem trong tay khách mang mã đó,
mint mã mới là màn bếp một mã, tem một mã, và doanh thu bị nhân đôi.

Dedupe hai lớp: store.get() ở đây, và confirmed_at bên GAS làm đơn rớt khỏi
mailbox. Đứt đường nào cũng không nhân đôi.
"""
import logging
import threading

log = logging.getLogger("online-inbox")


class InboxActionError(Exception):
    """GAS với tới được nhưng action hỏng (sai token, thiếu action, lỗi handler).

    Tách khỏi lỗi transport vì cờ `online` còn nuôi badge cloud trên KDS: gộp
    hai loại lỗi là nhân viên thấy "Offline (local)" trong khi GAS vẫn sống.
    """


class OnlineInbox:
    def __init__(self, store, fetch_fn, on_import=None):
        self.store = store
        self.fetch_fn = fetch_fn
        self.on_import = on_import      # callback(order_id) — đẩy CONFIRMED lên GAS
        self._online = False
        self._error = ""
        self._lock = threading.Lock()

    def poll(self):
        try:
            payloads = self.fetch_fn() or []
        except InboxActionError as exc:
            log.error("inbox action failed (GAS reachable): %s", exc)
            self._set(online=True, error=str(exc))
            return self.status()
        except Exception as exc:
            log.error("inbox fetch failed (transport): %s", exc)
            self._set(online=False, error=str(exc))
            return self.status()

        self._set(online=True, error="")
        for p in payloads:
            try:
                self._import_one(p)
            except Exception as exc:
                log.error("inbox import failed for %s: %s", p.get("order_id"), exc)
        return self.status()

    def _import_one(self, p):
        """Trả True nếu vừa nhập mới. Giữ self._lock suốt cả chuỗi check-rồi-nhập:
        store.get() và store có lock riêng của nó (self.store.lock) — khác khoá,
        không lồng nhau, không có nguy cơ deadlock hay re-entrant.

        Novelty check không chỉ hỏi "đã có row chưa" mà hỏi "đã XONG chưa": nếu
        row tồn tại nhưng status vẫn "NEW" nghĩa là lần nhập trước đã chết nửa
        chừng (crash giữa upsert_create và apply_status) — phải nhập tiếp chứ
        không được coi là "đã nhập rồi" rồi bỏ qua vĩnh viễn.

        Thứ tự cố ý: upsert_create → on_import (ghi outbox) → apply_status
        CONFIRMED cuối cùng. on_import ghi outbox bằng INSERT OR IGNORE trên
        idempotency_key cố định (xem Gateway.enqueue) nên gọi lại vô hại; còn
        status="NEW" ở local chính là cái đánh dấu "chưa xong" để lần poll sau
        tự retry — nếu apply_status chạy trước on_import mà on_import rồi lỗi,
        status đã là CONFIRMED thì novelty check sẽ bỏ qua đơn đó mãi mãi.

        Novelty check phải khoanh vùng đúng đơn của module này: order_id dạng
        ORD-YYYYMMDD-XXXX trùng khuôn với id Gateway._gen_order_id() mint cho
        đơn khách tại quầy (gateway.py) — random 4 số nên có xác suất đụng độ
        dù nhỏ. Nếu chỉ xét status=="NEW" mà bỏ qua nguồn gốc, một đơn tại
        quầy đang dở dang (status NEW, source="staff") trùng id với đơn web
        mới tới sẽ bị apply_status CONFIRMED và on_import bắn nhầm — đơn thật
        của khách bị đè trạng thái. Phải đúng CẢ status=="NEW" LẪN
        source=="online" (source do chính _import_one ghi khi upsert_create)
        mới coi là "nhập dở, tiếp tục nhập"; ngoài ra không phải đơn của
        module này — bỏ qua hoàn toàn, không on_import, không apply_status.

        Cửa sổ đua THỨ HAI (khác vụ ở trên, nơi đơn đối thủ đã nằm sẵn TRƯỚC
        khi poll chạy): self._lock chỉ khoá các luồng đi qua instance này.
        print_server.py tạo đơn tại quầy bằng STORE.upsert_create(...) thẳng
        vào store dùng chung, không biết gì tới lock này. Nếu một đơn tại
        quầy trùng order_id được ghi đúng NGAY TRONG khoảng giữa bước đọc
        existing (existing=None, chưa có gì) và bước upsert_create ở dưới,
        thì INSERT OR IGNORE ở dưới no-op vào row của đơn quầy — bước đọc đã
        qua rồi nên không biết. Phải đọc lại store SAU KHI upsert_create và
        xác nhận đúng source=="online" mới được đi tiếp; nếu không, đơn vừa
        chạy vào là của luồng khác — dừng, không on_import, không
        apply_status, chỉ log cảnh báo nêu order_id để lộ ra trong log."""
        oid = p.get("order_id")
        if not oid:
            return False
        # Giữ lock suốt cả chuỗi check-rồi-nhập lẫn gọi on_import: on_import
        # (callback đẩy CONFIRMED lên GAS) chạy TRONG lock này. self._lock
        # không tái nhập (non-reentrant) — on_import tương lai KHÔNG được gọi
        # ngược vào bất kỳ method nào của OnlineInbox instance này, sẽ deadlock.
        with self._lock:
            existing = self.store.get(oid)
            if existing and not (existing["status"] == "NEW" and existing.get("source") == "online"):
                return False
            if not existing:
                self.store.upsert_create({
                    "order_id": oid,
                    "short_code": p.get("short_code", ""),
                    "delivery_type": p.get("delivery_type", "pickup"),
                    "table_id": p.get("table_id", ""),
                    "source": "online",
                    "items": p.get("items", []),
                    "customer_note": p.get("notes", ""),
                    "total": p.get("total"),
                    "bill_meta": {
                        "customer_name":    p.get("customer_name", ""),
                        "customer_id":      p.get("customer_id", ""),
                        "created_at":       p.get("created_at", ""),
                        "label_printed_at": p.get("label_printed_at", ""),
                        "payment_status":   p.get("payment_status", "PENDING"),
                    },
                })
                # Cửa sổ đua thứ hai: đọc lại ngay sau upsert_create để biết
                # INSERT OR IGNORE vừa rồi có thật sự ghi được row của MÌNH
                # hay đã no-op vào row một luồng khác vừa chèn trong lúc ta
                # chưa kịp gọi upsert_create. .get() để row thiếu field không
                # raise — coi như "không phải của mình", an toàn hơn KeyError.
                after = self.store.get(oid)
                if not after or after.get("source") != "online":
                    log.warning(
                        "inbox import collision: %s bị luồng khác chiếm mất "
                        "trong cửa sổ đua — bỏ qua, không on_import/apply_status", oid)
                    return False
            if self.on_import:
                self.on_import(oid)
            self.store.apply_status(oid, "CONFIRMED")
            return True

    def _set(self, online, error):
        with self._lock:
            self._online = online
            self._error = error

    def status(self):
        with self._lock:
            return {"online": self._online, "inbox_error": self._error}
