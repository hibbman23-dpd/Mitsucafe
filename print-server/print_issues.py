# print-server/print_issues.py
"""print_issues.py — operational alert log: real print failures (auto) + staff-flagged
'tem không ra' reports (manual). Surfaced as a banner in kds.html so a manager can
reprint or dismiss. Same sqlite conn/lock as the rest of print-server (no new DB file)."""
from datetime import datetime, timedelta, timezone

_VN = timezone(timedelta(hours=7))


def _now_iso():
    return datetime.now(_VN).isoformat()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS print_issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  issue_type   TEXT NOT NULL,
  cup_index    INTEGER,
  note         TEXT,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS ix_print_issues_open ON print_issues(resolved_at, id);
"""


class PrintIssues:
    def __init__(self, conn, lock):
        self._conn = conn
        self._lock = lock
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def log_auto_failed(self, order_id, kind, cup_index, note):
        with self._lock:
            self._conn.execute(
                "INSERT INTO print_issues(order_id,kind,issue_type,cup_index,note,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (order_id, kind, "auto_failed", cup_index, str(note)[:400], _now_iso()))
            self._conn.commit()

    def flag_manual(self, order_id, note):
        with self._lock:
            self._conn.execute(
                "INSERT INTO print_issues(order_id,kind,issue_type,cup_index,note,created_at) "
                "VALUES(?,?,?,?,?,?)",
                (order_id, "label", "manual_flag", None, str(note or "")[:400], _now_iso()))
            self._conn.commit()

    def list_open(self):
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM print_issues WHERE resolved_at IS NULL ORDER BY id").fetchall()
            return [dict(r) for r in rows]

    def resolve(self, issue_id):
        with self._lock:
            self._conn.execute(
                "UPDATE print_issues SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
                (_now_iso(), issue_id))
            self._conn.commit()
