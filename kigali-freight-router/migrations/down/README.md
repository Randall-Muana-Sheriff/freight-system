# Down migrations

Each file here reverses exactly the migration of the same name in
`../`, on the assumption that `bin/migrate-down.js` only ever rolls back
migrations one at a time, in strict reverse order of application — a down
file never needs to account for a *later* migration still being applied,
because the runner won't let you get here until that later one has
already been rolled back first.

## Migrations with no down file, on purpose

Not every forward migration has a safe automated reversal. Rather than
write a down-migration that would silently lose data or leave the schema
in a state the application code doesn't actually support, these are left
unreversible by design — rolling one of these back requires a manual,
DBA-supervised procedure (and almost always rolling the *application
code* back too, not just the schema):

- **`add_full_schema.sql`** — the foundational schema migration. It both
  creates several tables and backfills real data into new columns on
  existing tables (`orders.pickup_lng`/`pickup_lat`/etc, computed from
  the earlier PostGIS geometry columns). Reversing it means dropping
  tables and columns that essentially every other migration and the
  entire application now depends on — there is no meaningful "rolled
  back" state short of also rolling back every migration and every app
  deploy that came after it.
- **`fix_refresh_tokens_schema.sql`** — a conditional `DO $$ ... $$`
  block whose actual effect depends on what state the table was already
  in (an old table missing a column vs. no table at all). There's no
  single, well-defined "before" state to reverse to.
- **`fix_refresh_tokens_drop_user_id.sql`** — dropped a column. The data
  in it is already gone; re-adding an empty `user_id` column would
  restore the schema shape but not the data, and no current application
  code reads that column anyway, so a fake restore would only be
  misleading.
- **`consolidate_roles.sql`** — a pure data migration (`UPDATE users SET
  role = 'dispatcher' WHERE role IN ('manager', 'merchant')`). Which
  users were originally `manager` vs `merchant` is not recoverable once
  this has run.

If `bin/migrate-down.js` is asked to roll back one of these, it refuses
with a clear error rather than doing something destructive or
misleading.
