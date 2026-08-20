import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(__dirname, '..', 'migrations');
const DOWN = path.join(MIGRATIONS, 'down');

// Every forward migration must be reversible, or must say why not.
//
// bin/migrate-down.js refuses to roll back a migration with no down file and
// points at down/README.md for the reason — which only works if the reason
// is actually there. init_spatial.sql had no down file and no entry, so the
// runner would have sent an operator mid-rollback to a document that did not
// mention the thing they were stuck on.
//
// This is a documentation test on purpose. It cannot check that a down file
// is *correct*, only that a decision was made and written down, which is the
// part that rots silently.
test('every migration has a down file or a documented reason it cannot', () => {
    const readme = fs.readFileSync(path.join(DOWN, 'README.md'), 'utf8');
    const forward = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    assert.ok(forward.length > 0, 'expected to find forward migrations');

    const undocumented = forward.filter(
        (f) => !fs.existsSync(path.join(DOWN, f)) && !readme.includes(f)
    );

    assert.deepEqual(
        undocumented,
        [],
        `These migrations have no down file and no entry in migrations/down/README.md. ` +
        `Either add migrations/down/<name>.sql, or explain in that README why a safe ` +
        `automated reversal is not possible: ${undocumented.join(', ')}`
    );
});

// The other direction: a down file for a migration that no longer exists is
// dead weight, and worse, suggests a rollback path that cannot be reached.
test('no down file is orphaned', () => {
    const forward = new Set(fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')));
    const orphans = fs
        .readdirSync(DOWN)
        .filter((f) => f.endsWith('.sql') && !forward.has(f));

    assert.deepEqual(orphans, [], `Down files with no forward migration: ${orphans.join(', ')}`);
});
