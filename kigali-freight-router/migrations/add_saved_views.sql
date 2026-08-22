-- A dispatcher's own named filters over the board.
--
-- Per user rather than per browser, deliberately. The dispatch desk is
-- shared: the alternative was localStorage, which would show one person's
-- saved views to whoever signed in next on the same machine. That is not a
-- cheaper version of this table, it is a bug, and it is the kind that gets
-- reported as "the board keeps changing by itself" long after anybody
-- remembers why.
CREATE TABLE IF NOT EXISTS saved_views (
    id         SERIAL PRIMARY KEY,
    -- ON DELETE CASCADE: a removed account's private filters have no owner
    -- and no other referent, so they go with it.
    username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    -- Opaque to this service on purpose. The shape belongs to the board that
    -- writes it, and the UI versions it on its own side; a column that tried
    -- to model the filter would have to change every time a facet was added.
    filter     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Saving over a name replaces it rather than growing a second entry with
    -- the same label, which is what every tool with this feature does and
    -- what a dispatcher means by saving again.
    UNIQUE (username, name)
);

-- Every read is "this user's views", so that is the index.
CREATE INDEX IF NOT EXISTS idx_saved_views_username ON saved_views(username, name);
