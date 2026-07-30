#!/usr/bin/env python3
"""Prepare Supabase schema SQL for plain Postgres staging restore (badawiasimports)."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
src = root / "supabase/migrations/20260209000000_complete_schema.sql"
contact_src = root / "supabase/migrations/20260227000000_contact_submissions.sql"
out = root / "migration-artifacts/dumps/schema_plain.sql"

text = src.read_text()

def extract_functions(s: str):
    pattern = re.compile(
        r"CREATE\s+OR\s+REPLACE\s+FUNCTION[\s\S]*?\$\$;",
        re.IGNORECASE,
    )
    blocks = pattern.findall(s)
    cleaned = pattern.sub("\n-- (function moved to end)\n", s)
    return cleaned, blocks

header = """
-- Plain Postgres adapted schema (staging) — badawiasimports.com
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS \"pgcrypto\" WITH SCHEMA public;
"""

text = re.sub(
    r'CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;',
    "-- extension handled in header",
    text,
)

body, funcs = extract_functions(text)

extra_alters = """
-- contact_submissions (20260227000000_contact_submissions.sql)
"""
if contact_src.exists():
    extra_alters += contact_src.read_text()

final = (
    header
    + "\n"
    + body
    + "\n-- ===== FUNCTIONS (after tables) =====\n"
    + "\n\n".join(funcs)
    + "\n"
    + extra_alters
)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(final)
print(f"Wrote {out} ({len(final)} bytes, {len(funcs)} functions)")
