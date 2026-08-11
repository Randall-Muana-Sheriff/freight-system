import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_INFO_PATH = path.join(__dirname, '..', 'build-info.json');

// Production is deployed by file sync, not from a git checkout, so the host
// has no repository to interrogate — there was previously no way to tell
// which commit was actually running, no diff against the repo, and no
// clean rollback target. Two features sat committed-but-undeployed for a
// day before a manual grep caught it. Deploys now stamp this file (see
// bin/write-build-info.js) and /health reports it, so drift is visible
// from outside the box.
function readBuildInfo() {
    try {
        const raw = fs.readFileSync(BUILD_INFO_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            commit: typeof parsed.commit === 'string' ? parsed.commit : 'unknown',
            builtAt: typeof parsed.builtAt === 'string' ? parsed.builtAt : null,
            branch: typeof parsed.branch === 'string' ? parsed.branch : null,
        };
    } catch {
        // Absent in local dev (and on any host deployed before this
        // existed) — an unstamped build is reported honestly rather than
        // guessed at.
        return { commit: 'unknown', builtAt: null, branch: null };
    }
}

// Read once at startup: the file cannot change without a redeploy, and a
// health endpoint should not touch the filesystem on every request.
export const buildInfo = readBuildInfo();
