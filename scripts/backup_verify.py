# バックアップの SQL を空の SQLite に流し込み、壊れていないか・件数が元と一致するかを確かめる。
# 使い方: python3 scripts/backup_verify.py <dump.sql> <counts.json>
# 件数そのものは表示しない（GitHub Actions のログは公開のため）。
import json, sqlite3, sys

dump, counts_path = sys.argv[1], sys.argv[2]
expected = json.load(open(counts_path, encoding="utf-8"))
con = sqlite3.connect(":memory:")
with open(dump, encoding="utf-8") as f:
    con.executescript(f.read())
ok = con.execute("PRAGMA integrity_check").fetchone()[0]
if ok != "ok":
    sys.exit(f"integrity_check failed: {ok}")
bad = []
for table, n in expected.items():
    got = con.execute(f'SELECT COUNT(*) FROM "{table.replace(chr(34), chr(34) * 2)}"').fetchone()[0]
    if got != n:
        bad.append(table)
if bad:
    sys.exit(f"row count mismatch: {', '.join(bad)}")
print(f"verified: {len(expected)} tables restore cleanly")
