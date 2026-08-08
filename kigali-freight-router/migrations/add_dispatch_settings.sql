-- A single-row table for the one operational setting that needs to be
-- admin-editable without a rebuild: the dispatch phone number shown to
-- drivers on the pre-login PIN screens (see systemRoutes.js's public
-- /dispatch-contact endpoint and AuthFlow.tsx's "Contact dispatch" link).
CREATE TABLE IF NOT EXISTS system_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    dispatch_phone_number TEXT,
    CONSTRAINT system_settings_single_row CHECK (id = 1)
);
INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
