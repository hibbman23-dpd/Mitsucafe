"""attendance_sync.py — đẩy bảng công lên Sheets, làm mới cache STAFF,
job quét ca hở 04:00, và cảnh báo Telegram cuối ngày.

Cảnh báo dựng từ SQLite chứ KHÔNG từ Sheets: Sheets có thể đang chờ sync, báo
cáo dựng từ đó sẽ thiếu giờ của người vừa bấm. Telegram gửi qua GAS relay vì
token nằm ở CONFIG sheet — guardrail CLAUDE.md cấm token trong code.
"""
import logging
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))
log = logging.getLogger("attendance_sync")


def _hhmm(minutes):
    return "%dh%02d" % (minutes // 60, minutes % 60)


class AttendanceSync:
    def __init__(self, store, cache, poster):
        self.store = store
        self.cache = cache
        self.poster = poster

    def push_once(self, limit=50):
        rows = self.store.conn.execute(
            "SELECT * FROM attendance WHERE synced_at IS NULL "
            "ORDER BY created_at LIMIT ?", (limit,)).fetchall()
        done = 0
        for row in rows:
            payload = {k: row[k] for k in row.keys()
                       if k not in ("punch_in_nonce", "punch_out_nonce", "synced_at")}
            try:
                self.poster({"action": "attendance_upsert", "row": payload})
            except Exception as exc:
                log.warning("attendance push failed %s: %s", row["punch_id"], exc)
                break          # để nguyên, lần sau retry
            with self.store.lock:
                self.store.conn.execute(
                    "UPDATE attendance SET synced_at=? WHERE punch_id=?",
                    (datetime.now(_VN).isoformat(), row["punch_id"]))
                self.store.conn.commit()
            done += 1
        return done

    def refresh_staff(self):
        """Kéo STAFF về, ghi cache đã băm PIN. Lỗi thì giữ nguyên cache cũ —
        mất mạng không được làm cả quán hết chấm công."""
        try:
            res = self.poster({"action": "attendance_staff"})
        except Exception as exc:
            log.warning("staff refresh failed: %s", exc)
            return 0
        rows = (res or {}).get("staff") or []
        if not rows:
            return 0
        self.cache.replace(rows)
        return len(rows)

    def eod_text(self, date):
        rep = self.store.report(date, date)
        lines = ["📋 Chấm công %s" % date]
        if not rep["by_staff"]:
            lines.append("— không có ca nào đã đóng —")
        for a in rep["by_staff"]:
            lines.append("· %s: %s (%d ca)"
                         % (a["staff_name"], _hhmm(a["minutes"]), a["shifts"]))
        for u in rep["unclosed"]:
            lines.append("⚠️ %s: ca %s chưa đóng — cần chủ nhập giờ ra"
                         % (u["staff_name"], u["clock_in_at"][11:16]))
        return "\n".join(lines)

    def send_eod(self, date):
        try:
            self.poster({"action": "attendance_alert", "text": self.eod_text(date)})
            return True
        except Exception as exc:
            log.warning("eod alert failed: %s", exc)
            return False

    def run_daily(self, now=None):
        """Job 04:00: quét ca hở của ngày hôm trước rồi bắn cảnh báo."""
        now = now or datetime.now(_VN)
        swept = self.store.sweep_unclosed(now=now)
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
        return {"swept": swept, "alerted": self.send_eod(yesterday)}
