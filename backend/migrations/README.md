# Backend migrations (Alembic)

Alembic owns the database schema. API startup runs `alembic upgrade head`; the
old `create_all` + `_ensure_*` ALTER helpers are gone (refactor 3.8c).

## What startup does

`app.main.lifespan` calls `init_db()` (`app/core/db.py`) inside `startup_lock()`,
the Postgres transaction-scoped advisory lock (`STARTUP_LOCK_KEY`), so several
workers do not race. Under that lock:

1. `app.core.migrate.upgrade_to_head(engine)` runs `alembic upgrade head` in
   one transaction (Postgres DDL is transactional) on the app's own engine, so
   it uses the same `DATABASE_URL` as the app. On a database already at head it
   only reads `alembic_version`. SQLite (tests, local dev) runs the same
   migrations.
   - A database that has tables but no `alembic_version` (built by the old
     startup) is refused with an error: run `alembic stamp 0001` from
     `backend/` once (0002 then reconciles its drift), or delete a local
     `optcg.db`.
   - A database whose revision this release does not know (a newer release
     migrated it, then you rolled back) fails with Alembic's "Can't locate
     revision". Redeploy the newer release or restore a backup.
2. `app.core.seed.seed_reference_data` writes data, not schema, idempotently:
   the one admin role (`settings.admin_email`, every boot), the two historic
   eval runs (only into an empty table) and the default event (only when step 1
   started from an empty database, so deleting every event keeps it deleted).
3. The lifespan then runs its boot backfills (`refresh_special_flags`,
   `backfill_seats`) as before.

`duel_match_outbox` belongs to the game server (`game-server/src/writeback.ts`
creates it): it is not a model, no migration touches it, and `env.py`'s
`include_object` hides it from `alembic check` / autogenerate.

## What is here

- `../alembic.ini`, `env.py`: the URL comes from the app settings
  (`DATABASE_URL`, via `get_settings().sqlalchemy_url`) unless the caller passes
  an open connection in `config.attributes["connection"]` (startup and the tests
  do). The metadata is `app.all_models.Base.metadata`. Startup sets
  `configure_logger=False` so `env.py` does not replace the app's logging.
  Run CLI commands from `backend/`.
- `versions/0001_baseline.py`: the full schema (every model table, plus the
  `lower(username)` unique index).
- `versions/0002_reconcile_production.py`: brings the production database,
  which the old startup built, to exactly the 0001 schema (17 columns made
  `NOT NULL`, two indexes, the `user_sharing.collection` default). A no-op on a
  database built by 0001. Production is stamped and at 0002.
- `tests/test_alembic_baseline.py`: builds one database with
  `Base.metadata.create_all` and one with `alembic upgrade head` and fails on
  any difference in tables, columns (type, nullability, server default),
  primary keys, indexes, unique constraints or foreign keys. A model change
  without a migration fails it.
- `tests/test_alembic_reconcile.py`: 0002 on a production-shaped database.
- `tests/test_startup_migrations.py`: startup reaches head, a second startup
  changes nothing, an unstamped database is refused, and (Postgres) the
  lifespan migrates only while it holds the startup lock.
- `alembic` needs the settings to load. With a Postgres `DATABASE_URL` the app
  treats the environment as production, so set `SESSION_SECRET`,
  `CATALOG_SYNC_TOKEN`, `DUEL_INGEST_SECRET` and `ENABLE_DEV_LOGIN=false` as
  Render does (locally any non-default values work).

## Adding a migration

1. Change the model in the domain `app/<package>/models.py`.
2. `cd backend && alembic revision --autogenerate -m "short summary"` against a
   scratch database that is at `head` (SQLite is fine for column changes; use a
   local Postgres for anything dialect specific).
3. Read the generated file. Autogenerate misses expression indexes, server
   defaults it cannot render portably, and data changes. Use `sa.true()`,
   `sa.false()` and `sa.func.now()` for defaults (not `sa.text('0')`, which
   Postgres rejects for booleans). A new `NOT NULL` column on an existing
   table needs a `server_default` or a backfill first. SQLite cannot alter
   columns in place: use `op.batch_alter_table`. Put data backfills in the
   migration; `app/core/seed.py` is only for reference rows the app expects.
4. Make `downgrade()` the real inverse where that is possible.
5. `python3 -m pytest -q`. `test_alembic_baseline.py` compares `upgrade head`
   with the models, so the migration and the model must agree. Do not edit
   `0001` or `0002`.
6. One head only: if two PRs add a revision off the same parent, rebase one and
   re-point its `down_revision`.
7. Deploy: the new release migrates on boot under the startup lock. A migration
   that rewrites a big table holds the lock (and every other worker's boot) for
   its duration; prefer additive changes.

## History: the production cutover (done)

Production was built by the old `init_db` (`create_all` plus 25 `_ensure_*`
ALTER helpers). On 2026-11-07 a schema-only Neon branch was compared with the
baseline (`refactor-review/alembic-prod-compare-2026-11-07.md`): 17 columns
nullable with a `DEFAULT` where the models say `NOT NULL`, two missing indexes,
the `user_sharing.collection` default, and the game-server-owned
`duel_match_outbox`. `0002` fixes the first three. The owner stamped production
at `0001` and ran `upgrade head`, so production is at `0002`.

## Rollback

- Redeploy the previous release. Releases before 3.8c ignore `alembic_version`
  and their `_ensure_*` helpers are idempotent, so they start fine on a
  database that Alembic migrated, as long as the migrations since only added
  nullable or defaulted columns.
- For a bad migration use `alembic downgrade -1` (from `backend/`, with the
  production `DATABASE_URL`, owner only), or restore the Neon point-in-time
  branch taken before the deploy.
