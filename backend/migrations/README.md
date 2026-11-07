# Backend migrations (Alembic)

Status: **scaffolding only.** The API still builds its schema at startup with
`app.db.init_db` (`create_all` plus the `_ensure_*` ALTER helpers). Alembic is
installed and has a baseline, but nothing runs it. Production is untouched
until the owner approves the cutover below.

## What is here

- `../alembic.ini`, `env.py`: the URL comes from the app settings
  (`DATABASE_URL`, via `get_settings().sqlalchemy_url`), the metadata is
  `app.models.Base.metadata`. Run commands from `backend/`.
- `versions/0001_baseline.py`: the full schema `init_db` produces on an empty
  database (every model table, plus the columns, indexes and constraints the
  `_ensure_*` helpers add, including the `lower(username)` unique index).
- `tests/test_alembic_baseline.py`: builds one database with `init_db` and one
  with `alembic upgrade head` and fails on any difference in tables, columns
  (type, nullability, server default), primary keys, indexes, unique
  constraints or foreign keys. It runs under the normal `pytest` command, on
  SQLite and (CI) Postgres.
- `alembic` needs the settings to load. With a Postgres `DATABASE_URL` the app
  treats the environment as production, so set `SESSION_SECRET`,
  `CATALOG_SYNC_TOKEN`, `DUEL_INGEST_SECRET` and `ENABLE_DEV_LOGIN=false` as
  Render does (locally any non-default values work).

## Adding a migration (once the cutover is done)

1. Change the model in `app/models.py`.
2. `cd backend && alembic revision --autogenerate -m "short summary"` against a
   scratch database that is at `head` (SQLite is fine for column changes; use a
   local Postgres for anything dialect specific).
3. Read the generated file. Autogenerate misses expression indexes, server
   defaults it cannot render portably, and data changes. Use `sa.true()`,
   `sa.false()` and `sa.func.now()` for defaults (not `sa.text('0')`, which
   Postgres rejects for booleans). Put data backfills in the migration, not in
   app startup.
4. Make `downgrade()` the real inverse where that is possible.
5. `python3 -m pytest -q`. The schema test checks only the baseline today; when
   the first real migration lands, change it to compare `init_db`-free
   `create_all` output with `upgrade head` (or add `alembic check`).
6. One head only: if two PRs add a revision off the same parent, rebase one and
   re-point its `down_revision`.

## One-time production cutover (needs the owner's approval)

Do not do any of this from a worker thread. Steps that touch Neon/Render are
the owner's.

1. In Neon, create a **schema-only branch** of production (no data). Never
   point tooling at the main branch for this.
2. Compare it with the baseline from `backend/` with
   `DATABASE_URL=<branch url> alembic check` (reports every difference between
   the live schema and the models), and with `pg_dump --schema-only` of the
   branch against a database made by `alembic upgrade head`.
3. Expect differences on the columns the `_ensure_*` helpers added to existing
   tables. Those ALTERs created the column **nullable** with a `DEFAULT`, while
   the model says `NOT NULL`. On a fresh database (and in the baseline) they are
   `NOT NULL`. Known cases: `group_buys.{external_order_id, order_notes,
   shipping_cost, shipping_split, tax_cost, receipt_text, is_public}`,
   `users.{session_version, sum_across_leaders}`, `decks.is_main`,
   `duel_match_progress.closed`, `analyst_usage.{outcome, tool_calls,
   duration_ms}`, `analyst_access.{topup_usd, auto_approved}`,
   `feedback.discord_author`. Server-default spelling may also differ, and
   column order always does (ignore order). Decide per difference: either a
   `0002` migration that backfills NULLs and sets `NOT NULL` (run it on the
   branch first), or loosen the model; do not edit `0001`.
4. When the branch matches, `alembic stamp 0001` against **production**. Stamp
   only writes the `alembic_version` table; it runs no DDL.
5. In a follow-up PR (not before step 4): switch startup from `init_db` to
   `alembic upgrade head` (keep the `startup_lock` advisory lock around it so
   several workers do not race), delete the 25 `_ensure_*` helpers and
   `test_startup_migrations.py`'s legacy cases, and move the seed data
   (`_seed_eval_runs`, `_seed_default_event`) and boot backfills out of
   `init_db` into data migrations or an explicit command.

## Rollback

- Before step 4 nothing in production changed: delete the Neon branch, done.
- After stamping, rollback is `DELETE FROM alembic_version` / `DROP TABLE
  alembic_version`, which returns production to the state `init_db` expects.
  The app does not read that table until step 5, so the stamp is harmless.
- After step 5, redeploy the previous release (it ignores `alembic_version`
  and its `_ensure_*` helpers are idempotent). For a bad migration use
  `alembic downgrade -1`, or restore the Neon point-in-time branch taken
  before the deploy.
