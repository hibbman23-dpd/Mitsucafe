"""attendance_store.py — bảng chấm công, nguồn ghi tại quán.

File SQLite RIÊNG (`attendance.db`), KHÔNG dùng chung outbox.db: outbox có
purge_synced(days=7) còn bảng công là căn cứ trả lương, phải giữ nhiều tháng.

Mọi mốc giờ do server sinh, +07 cố định. Không nhận timestamp từ client.
"""
import secrets
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))

QUICK_OUT_SECONDS = 180          # dưới mốc này thì hỏi lại trước khi đóng ca
REOPEN_WINDOW_HOURS = 24         # cửa sổ tìm ca để đóng


def _now_iso():
    return datetime.now(_VN).isoformat()


class QuickPunchConfirm(Exception):
    """Bấm ra ca dưới QUICK_OUT_SECONDS — chờ client xác nhận."""

    def __init__(self, row):
        super().__init__("quick punch needs confirm")
        self.row = row


def new_punch_id(now):
    return "ATT-%s-%s" % (now.strftime("%Y%m%d-%H%M%S"), secrets.token_hex(4))


ATTENDANCE_SCHEMA = """
CREATE TABLE IF NOT EXISTS attendance (
  punch_id        TEXT PRIMARY KEY,
  staff_id        TEXT NOT NULL,
  staff_name      TEXT,
  date            TEXT NOT NULL,
  clock_in_at     TEXT NOT NULL,
  clock_out_at    TEXT,
  status          TEXT NOT NULL,
  minutes_worked  INTEGER,
  source          TEXT NOT NULL DEFAULT 'staff',
  edited_by       TEXT,
  edited_at       TEXT,
  edit_note       TEXT,
  punch_in_nonce  TEXT,
  punch_out_nonce TEXT,
  synced_at       TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_att_staff_date ON attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS ix_att_status ON attendance(status);
CREATE INDEX IF NOT EXISTS ix_att_sync ON attendance(synced_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_att_in_nonce
  ON attendance(punch_in_nonce) WHERE punch_in_nonce IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_att_out_nonce
  ON attendance(punch_out_nonce) WHERE punch_out_nonce IS NOT NULL;
"""


class AttendanceStore:
    def __init__(self, conn, lock):
        self.conn = conn
        self.lock = lock
        with lock:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA busy_timeout=5000;")
            conn.executescript(ATTENDANCE_SCHEMA)
            conn.commit()

    # ── helpers ──────────────────────────────────────────────────────────
    def _row(self, punch_id):
        r = self.conn.execute(
            "SELECT * FROM attendance WHERE punch_id=?", (punch_id,)).fetchone()
        return dict(r) if r else None

    def _by_nonce(self, nonce):
        r = self.conn.execute(
            "SELECT *, 'in' AS which FROM attendance WHERE punch_in_nonce=? "
            "UNION ALL "
            "SELECT *, 'out' AS which FROM attendance WHERE punch_out_nonce=? "
            "LIMIT 1", (nonce, nonce)).fetchone()
        return dict(r) if r else None

    def _open_shift(self, staff_id, now):
        """Ca gần nhất còn mở của staff, trong cửa sổ 24h theo clock_in_at.

        Lấy theo cửa sổ giờ chứ KHÔNG theo `date`: ca đêm vào 21:00 ngày 05 ra
        02:00 ngày 06 mang date=05 trong khi hôm nay đã là 06 — lọc theo date sẽ
        không thấy nó và mở thêm ca rác. Cửa sổ cũng chặn ca UNCLOSED từ tuần
        trước bị đóng nhầm.
        """
        cutoff = (now - timedelta(hours=REOPEN_WINDOW_HOURS)).isoformat()
        r = self.conn.execute(
            "SELECT * FROM attendance WHERE staff_id=? AND status IN ('OPEN','UNCLOSED') "
            "AND clock_in_at >= ? ORDER BY clock_in_at DESC LIMIT 1",
            (staff_id, cutoff)).fetchone()
        return dict(r) if r else None

    # ── nghiệp vụ ────────────────────────────────────────────────────────
    def punch(self, staff_id, staff_name, nonce, confirm_quick_out=False, now=None):
        now = now or datetime.now(_VN)
        with self.lock:
            prior = self._by_nonce(nonce)
            if prior:
                which = prior.pop("which")
                return {"action": which, "row": prior, "replay": True}

            shift = self._open_shift(staff_id, now)
            if shift is None:
                return {"action": "in",
                        "row": self._insert_open(staff_id, staff_name, nonce, now),
                        "replay": False}

            started = datetime.fromisoformat(shift["clock_in_at"])
            if (shift["status"] == "OPEN"
                    and (now - started).total_seconds() < QUICK_OUT_SECONDS
                    and not confirm_quick_out):
                raise QuickPunchConfirm(shift)

            return {"action": "out",
                    "row": self._close(shift, nonce, now),
                    "replay": False}

    def _insert_open(self, staff_id, staff_name, nonce, now):
        punch_id = new_punch_id(now)
        self.conn.execute(
            "INSERT INTO attendance(punch_id, staff_id, staff_name, date, clock_in_at, "
            "status, source, punch_in_nonce, created_at) "
            "VALUES(?,?,?,?,?,'OPEN','staff',?,?)",
            (punch_id, staff_id, staff_name, now.strftime("%Y-%m-%d"),
             now.isoformat(), nonce, now.isoformat()))
        self.conn.commit()
        return self._row(punch_id)

    def _close(self, shift, nonce, now):
        started = datetime.fromisoformat(shift["clock_in_at"])
        minutes = int(round((now - started).total_seconds() / 60))
        note = "nhân viên bấm ra muộn" if shift["status"] == "UNCLOSED" else None
        self.conn.execute(
            "UPDATE attendance SET clock_out_at=?, status='CLOSED', minutes_worked=?, "
            "punch_out_nonce=?, edit_note=COALESCE(?, edit_note), synced_at=NULL "
            "WHERE punch_id=?",
            (now.isoformat(), minutes, nonce, note, shift["punch_id"]))
        self.conn.commit()
        return self._row(shift["punch_id"])
