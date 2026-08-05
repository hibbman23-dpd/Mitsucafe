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


class NotFound(Exception):
    """Không có ca nào mang punch_id đó."""


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
CREATE TABLE IF NOT EXISTS attendance_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
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

    # ── metadata (marker bền vững qua restart) ──────────────────────────
    def get_meta(self, key):
        r = self.conn.execute(
            "SELECT value FROM attendance_meta WHERE key=?", (key,)).fetchone()
        return r["value"] if r else None

    def set_meta(self, key, value):
        with self.lock:
            self.conn.execute(
                "INSERT INTO attendance_meta(key, value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
            self.conn.commit()

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

    # ── job quét ca hở ───────────────────────────────────────────────────
    def sweep_unclosed(self, now=None):
        """Đánh dấu UNCLOSED cho ca OPEN vào trước 04:00 hôm nay.

        Chạy 04:00 sáng hôm sau, KHÔNG chạy buổi tối: job tối sẽ cắt nhầm ca
        tối/ca đêm còn đang làm, nhân viên bấm ra sau đó lại mở ca mới (§5.1.1).
        """
        now = now or datetime.now(_VN)
        cutoff = now.replace(hour=4, minute=0, second=0, microsecond=0)
        if now < cutoff:
            cutoff -= timedelta(days=1)
        with self.lock:
            cur = self.conn.execute(
                "UPDATE attendance SET status='UNCLOSED', synced_at=NULL "
                "WHERE status='OPEN' AND clock_in_at < ?", (cutoff.isoformat(),))
            self.conn.commit()
            return cur.rowcount

    # ── báo cáo ──────────────────────────────────────────────────────────
    def today_open(self, now=None):
        now = now or datetime.now(_VN)
        cutoff = (now - timedelta(hours=REOPEN_WINDOW_HOURS)).isoformat()
        rows = self.conn.execute(
            "SELECT * FROM attendance WHERE status='OPEN' AND clock_in_at >= ? "
            "ORDER BY clock_in_at", (cutoff,)).fetchall()
        return [dict(r) for r in rows]

    def staff_ids_with_open_shift(self, now=None):
        """staff_id của những người còn ca đóng được — CÙNG tiêu chí với
        _open_shift (OPEN hoặc UNCLOSED, trong cửa sổ 24h).

        Khác today_open() một cách cố ý: today_open trả lời "ai đang trong ca"
        cho header, nên chỉ tính OPEN. Hàm này trả lời "ai còn ca bấm ra được",
        nên phải tính cả UNCLOSED — nếu không, người đã nghỉ việc có ca đã qua
        đợt quét 04:00 sẽ không bao giờ tự đóng được ca của mình.
        """
        now = now or datetime.now(_VN)
        cutoff = (now - timedelta(hours=REOPEN_WINDOW_HOURS)).isoformat()
        rows = self.conn.execute(
            "SELECT DISTINCT staff_id FROM attendance "
            "WHERE status IN ('OPEN','UNCLOSED') AND clock_in_at >= ?",
            (cutoff,)).fetchall()
        return [r["staff_id"] for r in rows]

    def report(self, date_from, date_to):
        rows = [dict(r) for r in self.conn.execute(
            "SELECT * FROM attendance WHERE date BETWEEN ? AND ? ORDER BY date, clock_in_at",
            (date_from, date_to)).fetchall()]
        by = {}
        for r in rows:
            if r["status"] != "CLOSED":
                continue
            agg = by.setdefault(r["staff_id"], {
                "staff_id": r["staff_id"], "staff_name": r["staff_name"],
                "shifts": 0, "minutes": 0})
            agg["shifts"] += 1
            agg["minutes"] += r["minutes_worked"] or 0
        return {
            "rows": rows,
            "by_staff": sorted(by.values(), key=lambda a: a["staff_name"] or ""),
            "unclosed": [r for r in rows if r["status"] == "UNCLOSED"],
        }

    # ── chủ sửa ──────────────────────────────────────────────────────────
    def fix(self, punch_id, owner_id, note, clock_in_at=None, clock_out_at=None):
        with self.lock:
            row = self._row(punch_id)
            if row is None:
                raise NotFound(punch_id)
            started = datetime.fromisoformat(clock_in_at or row["clock_in_at"])
            ended = clock_out_at or row["clock_out_at"]
            ended_dt = datetime.fromisoformat(ended) if ended else None
            if ended_dt and ended_dt <= started:
                raise ValueError("clock_out_at phải sau clock_in_at")
            now = _now_iso()
            self.conn.execute(
                "UPDATE attendance SET clock_in_at=?, clock_out_at=?, date=?, status=?, "
                "minutes_worked=?, edited_by=?, edited_at=?, edit_note=?, synced_at=NULL "
                "WHERE punch_id=?",
                (started.isoformat(),
                 ended_dt.isoformat() if ended_dt else None,
                 started.strftime("%Y-%m-%d"),
                 "CLOSED" if ended_dt else row["status"],
                 int(round((ended_dt - started).total_seconds() / 60)) if ended_dt else None,
                 owner_id, now, note, punch_id))
            self.conn.commit()
            return self._row(punch_id)

    def create_manual(self, staff_id, staff_name, clock_in_at, clock_out_at,
                      owner_id, note):
        started = datetime.fromisoformat(clock_in_at)
        ended = datetime.fromisoformat(clock_out_at)
        if ended <= started:
            raise ValueError("clock_out_at phải sau clock_in_at")
        now = _now_iso()
        punch_id = new_punch_id(started)
        with self.lock:
            self.conn.execute(
                "INSERT INTO attendance(punch_id, staff_id, staff_name, date, clock_in_at, "
                "clock_out_at, status, minutes_worked, source, edited_by, edited_at, "
                "edit_note, created_at) "
                "VALUES(?,?,?,?,?,?,'CLOSED',?,'owner_manual',?,?,?,?)",
                (punch_id, staff_id, staff_name, started.strftime("%Y-%m-%d"),
                 started.isoformat(), ended.isoformat(),
                 int(round((ended - started).total_seconds() / 60)),
                 owner_id, now, note, now))
            self.conn.commit()
            return self._row(punch_id)
