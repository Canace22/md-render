"""Copy durable data into a new DB and rebuild FTS; never replace the source DB."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time

DATA_TABLES = ('app_state', 'documents', 'links', 'versions')
FTS_TABLE = 'documents_fts'
FTS_TRIGGERS = {'documents_ai', 'documents_ad', 'documents_au'}
REBUILD_TIMEOUT_SECONDS = 60
PROGRESS_INTERVAL = 1000


def quote_identifier(name):
    return '"' + name.replace('"', '""') + '"'


def fingerprint(connection, schema, table):
    digest = hashlib.sha256()
    count = 0
    query = f'SELECT rowid, * FROM {schema}.{quote_identifier(table)} ORDER BY rowid'
    for row in connection.execute(query):
        digest.update(repr(row).encode('utf-8'))
        digest.update(b'\n')
        count += 1
    return {'rows': count, 'sha256': digest.hexdigest()}


def copy_table(connection, table):
    columns = [row[1] for row in connection.execute(
        f'PRAGMA original.table_info({quote_identifier(table)})',
    )]
    fields = ', '.join(['rowid', *(quote_identifier(column) for column in columns)])
    name = quote_identifier(table)
    connection.execute(f'INSERT INTO main.{name} ({fields}) SELECT {fields} FROM original.{name}')


def rebuild(source, destination, offline_source=False):
    if not source.is_file():
        raise ValueError('源数据库不存在。')
    if source.resolve() == destination.resolve():
        raise ValueError('必须写入新文件，不能原地改动源数据库。')
    source_status = source.stat()
    wal = Path(str(source) + '-wal')
    if offline_source and wal.exists() and wal.stat().st_size:
        raise ValueError('离线源库仍有 WAL，必须先正常退出应用并完成写入。')
    # Exclusive creation also prevents overwriting an existing backup.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    connection = sqlite3.connect(destination, timeout=1, uri=True)
    deadline = time.monotonic() + REBUILD_TIMEOUT_SECONDS
    connection.set_progress_handler(lambda: int(time.monotonic() > deadline), PROGRESS_INTERVAL)
    try:
        # Closed WAL databases may require creating sidecars even for a readonly open.
        # Immutable is only safe for an explicitly offline, checkpointed source.
        suffix = '?mode=ro&immutable=1' if offline_source else '?mode=ro'
        connection.execute('ATTACH DATABASE ? AS original', (source.resolve().as_uri() + suffix,))
        connection.execute('BEGIN')
        schema = connection.execute(
            "SELECT type, name, tbl_name, sql FROM original.sqlite_master WHERE sql IS NOT NULL",
        ).fetchall()
        tables = {name: sql for kind, name, _, sql in schema if kind == 'table'}
        durable_tables = {
            name for name in tables
            if not name.startswith(FTS_TABLE + '_')
            and name not in (FTS_TABLE, 'sqlite_sequence')
        }
        if durable_tables != set(DATA_TABLES) or FTS_TABLE not in tables:
            raise ValueError('数据库包含未覆盖的表结构，已停止，源数据库未改动。')
        triggers = {name for kind, name, _, _ in schema if kind == 'trigger'}
        if triggers != FTS_TRIGGERS:
            raise ValueError('数据库触发器与预期不符，已停止，源数据库未改动。')
        for table in DATA_TABLES:
            connection.execute(tables[table])
            copy_table(connection, table)
        if 'sqlite_sequence' in tables:
            connection.execute('DELETE FROM main.sqlite_sequence')
            copy_table(connection, 'sqlite_sequence')
        for kind, _, table, sql in schema:
            if kind == 'index' and table in DATA_TABLES:
                connection.execute(sql)
        connection.execute(tables[FTS_TABLE])
        connection.execute("INSERT INTO documents_fts(documents_fts) VALUES ('rebuild')")
        for kind, _, _, sql in schema:
            if kind == 'trigger':
                connection.execute(sql)
        fingerprints = {}
        for table in (*DATA_TABLES, 'sqlite_sequence'):
            original = fingerprint(connection, 'original', table)
            copied = fingerprint(connection, 'main', table)
            if original != copied:
                raise ValueError(f'{table} 数据校验不一致，源数据库未改动。')
            fingerprints[table] = copied
        for pragma in ('user_version', 'application_id'):
            value = connection.execute(f'PRAGMA original.{pragma}').fetchone()[0]
            connection.execute(f'PRAGMA main.{pragma} = {value}')
        connection.commit()
        connection.execute('PRAGMA foreign_keys = ON')
        if connection.execute('PRAGMA main.integrity_check').fetchall() != [('ok',)]:
            raise ValueError('新数据库完整性校验失败。')
        if connection.execute('PRAGMA main.foreign_key_check').fetchall():
            raise ValueError('新数据库引用关系校验失败。')
        index_rows = connection.execute('SELECT count(*) FROM documents_fts_docsize').fetchone()[0]
        stale_rows = connection.execute('''
            SELECT count(*) FROM documents_fts_docsize s
            LEFT JOIN documents d ON d.rowid = s.id WHERE d.rowid IS NULL
        ''').fetchone()[0]
        if index_rows != fingerprints['documents']['rows'] or stale_rows:
            raise ValueError('新搜索索引与文档记录不一致。')
        if offline_source and (
            source.stat().st_mtime_ns != source_status.st_mtime_ns
            or source.stat().st_size != source_status.st_size
            or (wal.exists() and wal.stat().st_size)
        ):
            raise ValueError('源库在重建期间发生写入，已停止，请先关闭应用。')
        return {'tables': fingerprints, 'index_rows': index_rows, 'stale_index_rows': stale_rows}
    except Exception:
        connection.close()
        destination.unlink(missing_ok=True)
        raise
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--offline-source', action='store_true', help='仅用于已退出应用、没有 WAL 的静止源库')
    args = parser.parse_args()
    report = rebuild(args.source, args.destination, args.offline_source)
    report.update(source_bytes=args.source.stat().st_size, repaired_bytes=args.destination.stat().st_size)
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
