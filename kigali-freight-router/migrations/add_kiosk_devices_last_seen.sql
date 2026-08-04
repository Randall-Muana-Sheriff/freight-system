-- Lets an admin actually tell whether an unattended wall display is still
-- alive without walking over to look at it. Updated on every successful
-- kiosk token verification (see verifyKioskToken in kioskAuthService.js),
-- combined with a periodic heartbeat call from the kiosk frontend so a
-- long-running session (which otherwise only talks over the socket, not
-- REST) doesn't look falsely stale.
ALTER TABLE kiosk_devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
