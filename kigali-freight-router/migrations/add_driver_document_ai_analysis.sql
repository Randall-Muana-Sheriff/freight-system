-- Backs the AI-assisted document review triage in
-- documentAnalysisService.js — a structured summary (does the image match
-- the claimed document type, extracted name/expiry, name-vs-account match,
-- legibility concerns) attached to each submission for an admin to see
-- alongside the photo. Purely an annotation: it never changes `status`
-- itself, an admin still makes every approve/reject call. Nullable, no
-- backfill — analysis only ever runs going forward, on new uploads.
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;
