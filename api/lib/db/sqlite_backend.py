"""SQLite-backed table implementation for DB_BACKEND=sqlite (selfhost).

Stores each item as a JSON blob keyed by pk, mirroring the schemaless
DynamoDB item shape used everywhere else in lib/db/*.py — no item ever
needs reshaping when switching backends.
"""

from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
from collections.abc import Generator
from decimal import Decimal
from typing import Any

from lib.db.base import ItemNotFoundError

_TABLE_NAMES = (
    "users",
    "games",
    "results",
    "posts",
    "recs",
    "reactions",
    "notifications",
    "settings",
)


def _json_default(obj):
    # _floats_to_decimal() (lib/db/base.py) runs unconditionally at every
    # put_item call site regardless of backend, converting floats to
    # Decimal for DynamoDB's benefit. SQLite/JSON has no such restriction,
    # so just convert Decimal back to int/float here on write; reads come
    # back as plain int/float, never Decimal.
    if isinstance(obj, Decimal):
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _field_expr(field: str) -> str:
    """The SQL expression for one top-level item attribute.

    Both the WHERE clause and the CREATE INDEX below are built from this, and
    they have to match: SQLite only uses an expression index when the query's
    expression parses identically to the indexed one, and it fails silently —
    with a full scan — when it doesn't.
    """
    if not field.isidentifier():
        raise ValueError(f"unsupported filter field: {field!r}")
    return f"json_extract(data, '$.{field}')"


def _bind(value):
    """sqlite3 has no adapter for Decimal, and items arrive holding them because
    _floats_to_decimal() runs on every write regardless of backend."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    return value


# Attributes worth an index, per table. Everything else filters by table scan,
# which is the right trade at the sizes the rest of these tables reach.
_INDEXED_FIELDS: dict[str, tuple[str, ...]] = {
    "notifications": ("playerId",),
    "reactions": ("sessionPk",),
}


def _connect(db_path: str) -> sqlite3.Connection:
    # check_same_thread=False: the connection is shared by FastAPI's threadpool
    # and serialised by SqliteTable's lock, not confined to one thread.
    conn = sqlite3.connect(db_path, timeout=30, isolation_level=None, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    # Durable at every checkpoint, not every commit: under WAL a power cut can
    # lose the last few commits but never corrupts the file.
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


class SqliteTable:
    def __init__(self, db_path: str, name: str):
        self._db_path = db_path
        self._name = name
        # One long-lived connection per table. Opening one per operation (plus
        # its PRAGMAs) cost ~10 ms each, i.e. most of every selfhost request.
        self._conn: sqlite3.Connection | None = None
        self._lock = threading.Lock()
        with self._connection() as conn:
            conn.execute(
                f"CREATE TABLE IF NOT EXISTS {name} (pk TEXT PRIMARY KEY, data TEXT NOT NULL)"
            )
            for field in _INDEXED_FIELDS.get(name, ()):
                conn.execute(
                    f"CREATE INDEX IF NOT EXISTS idx_{name}_{field} "
                    f"ON {name} ({_field_expr(field)})"
                )

    @contextlib.contextmanager
    def _connection(self) -> Generator[sqlite3.Connection]:
        with self._lock:
            if self._conn is None:
                self._conn = _connect(self._db_path)
            try:
                yield self._conn
            except BaseException:
                # The connection outlives this call: never leave a half-done
                # BEGIN IMMEDIATE open on it for the next caller.
                if self._conn.in_transaction:
                    self._conn.execute("ROLLBACK")
                raise

    def close(self) -> None:
        """Release the connection now. A sqlite3.Connection sits in a reference
        cycle, so dropping the table alone keeps the file open until the next
        GC pass. The app's tables live for the whole process and never need
        this; throwaway instances (tests, scripts) should call it."""
        with self._lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None

    def get_item(self, *, Key: dict) -> dict:
        with self._connection() as conn:
            row = conn.execute(
                f"SELECT data FROM {self._name} WHERE pk = ?", (Key["pk"],)
            ).fetchone()
        return {"Item": json.loads(row[0])} if row else {}

    def put_item(self, *, Item: dict) -> None:
        with self._connection() as conn:
            conn.execute(
                f"INSERT INTO {self._name} (pk, data) VALUES (?, ?) "
                "ON CONFLICT(pk) DO UPDATE SET data = excluded.data",
                (Item["pk"], json.dumps(Item, default=_json_default)),
            )

    def delete_item(self, *, Key: dict) -> None:
        with self._connection() as conn:
            conn.execute(f"DELETE FROM {self._name} WHERE pk = ?", (Key["pk"],))

    def scan(self, **kwargs) -> dict:
        filters = kwargs.pop("Filters", None) or {}
        where = ""
        params: list = []
        if filters:
            clauses = []
            for field, value in filters.items():
                clauses.append(f"{_field_expr(field)} = ?")
                params.append(_bind(value))
            where = " WHERE " + " AND ".join(clauses)
        with self._connection() as conn:
            rows = conn.execute(f"SELECT data FROM {self._name}{where}", params).fetchall()
        return {"Items": [json.loads(r[0]) for r in rows]}

    def add_to_set(self, pk: str, field: str, value) -> None:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(f"SELECT data FROM {self._name} WHERE pk = ?", (pk,)).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                raise ItemNotFoundError(pk)
            item = json.loads(row[0])
            values = set(item.get(field, []))
            values.add(value)
            item[field] = sorted(values)
            conn.execute(
                f"UPDATE {self._name} SET data = ? WHERE pk = ?",
                (json.dumps(item, default=_json_default), pk),
            )
            conn.execute("COMMIT")

    def remove_from_set(self, pk: str, field: str, value) -> None:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(f"SELECT data FROM {self._name} WHERE pk = ?", (pk,)).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                raise ItemNotFoundError(pk)
            item = json.loads(row[0])
            values = set(item.get(field, []))
            values.discard(value)
            item[field] = sorted(values)
            conn.execute(
                f"UPDATE {self._name} SET data = ? WHERE pk = ?",
                (json.dumps(item, default=_json_default), pk),
            )
            conn.execute("COMMIT")

    def set_fields(self, pk: str, fields: dict, *, increment: str | None = None) -> None:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(f"SELECT data FROM {self._name} WHERE pk = ?", (pk,)).fetchone()
            if row is None:
                conn.execute("ROLLBACK")
                raise ItemNotFoundError(pk)
            item = json.loads(row[0])
            item.update(fields)
            if increment is not None:
                item[increment] = item.get(increment, 0) + 1
            conn.execute(
                f"UPDATE {self._name} SET data = ? WHERE pk = ?",
                (json.dumps(item, default=_json_default), pk),
            )
            conn.execute("COMMIT")

    def increment_with_timestamp(
        self, pk: str, counter_field: str, timestamp_field: str, timestamp_value
    ) -> None:
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(f"SELECT data FROM {self._name} WHERE pk = ?", (pk,)).fetchone()
            item: dict[str, Any] = json.loads(row[0]) if row else {"pk": pk}
            item[counter_field] = item.get(counter_field, 0) + 1
            item[timestamp_field] = timestamp_value
            conn.execute(
                f"INSERT INTO {self._name} (pk, data) VALUES (?, ?) "
                "ON CONFLICT(pk) DO UPDATE SET data = excluded.data",
                (pk, json.dumps(item, default=_json_default)),
            )
            conn.execute("COMMIT")


def make_sqlite_tables(db_path: str) -> dict:
    return {name: SqliteTable(db_path, name) for name in _TABLE_NAMES}
