// Notices the failures that nothing else here notices.
//
// Three gaps this closes, in order of how quietly they fail:
//
// 1. A container that is RUNNING but UNHEALTHY. Docker's restart policy only
//    reacts to a process that exited; it does nothing about a healthcheck
//    that has been failing for an hour. Compose healthchecks are consulted
//    at startup for dependency ordering and then effectively ignored.
//
// 2. A crash LOOP. `restart: unless-stopped` turns a one-off crash into a
//    blip, which is the point — but it also turns a permanent fault into a
//    container that is forever "restarting" and never serving, with no
//    outward sign beyond requests failing.
//
// 3. Disk filling. Postgres stops accepting writes when the volume is full,
//    and the first symptom is orders failing to save.
//
// What it deliberately does NOT cover: the host being off. Nothing running
// on the host can report that. That needs a check from somewhere else — see
// docs/deployment/README.md.
//
// Run from a systemd timer every 5 minutes. Alerts through the same Telegram
// path as everything else, and only on a change of state, because a monitor
// that messages every five minutes is a monitor people mute.
import { execSync } from 'child_process';
import fs from 'fs';
import { dispatchExternalAlert, ALERT_CATEGORY } from '../services/alertDispatchService.js';

const CONTAINERS = ['inzira-router', 'inzira-ui', 'inzira-postgres', 'inzira-redis', 'inzira-caddy'];
const DISK_WARN_PERCENT = Number.parseInt(process.env.WATCHDOG_DISK_WARN_PERCENT || '85', 10);

// Remembering the last verdict is what makes this quiet. Kept in /var/tmp
// rather than /tmp so a reboot does not silently reset it to "everything was
// fine" and swallow the first alert after the very event most worth hearing
// about.
const STATE_PATH = process.env.WATCHDOG_STATE_PATH || '/var/tmp/inzira-watchdog-state.json';

function sh(cmd) {
    try {
        return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString().trim();
    } catch {
        return '';
    }
}

function inspect(name) {
    const raw = sh(`docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}' ${name}`);
    if (!raw) return { name, present: false };
    const [status, health, restarts] = raw.split('|');
    return { name, present: true, status, health, restarts: Number(restarts) || 0 };
}

function checkContainers() {
    const problems = [];
    for (const name of CONTAINERS) {
        const c = inspect(name);
        if (!c.present) { problems.push(`${name}: not found`); continue; }
        if (c.status !== 'running') { problems.push(`${name}: ${c.status}`); continue; }
        // Only 'unhealthy' counts. 'starting' is a container still inside its
        // start_period, which is normal right after a deploy — alerting on it
        // would fire on every single release.
        if (c.health === 'unhealthy') problems.push(`${name}: running but unhealthy`);
        if (c.restarts > 3) problems.push(`${name}: restarted ${c.restarts} times — likely crash-looping`);
    }
    return problems;
}

function checkDisk() {
    const out = sh("df --output=pcent,target / | tail -1");
    const pct = Number.parseInt(out.replace('%', '').trim(), 10);
    if (Number.isFinite(pct) && pct >= DISK_WARN_PERCENT) {
        return [`disk at ${pct}% (warns at ${DISK_WARN_PERCENT}%)`];
    }
    return [];
}

function readState() {
    try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { problems: [] }; }
}

function writeState(problems) {
    try { fs.writeFileSync(STATE_PATH, JSON.stringify({ problems, at: new Date().toISOString() })); } catch { /* best effort */ }
}

const problems = [...checkContainers(), ...checkDisk()];
const previous = readState().problems || [];
const same = problems.length === previous.length && problems.every((p, i) => p === previous[i]);

if (problems.length && !same) {
    await dispatchExternalAlert(
        `🩺 *WATCHDOG* 🩺\n\n${problems.map((p) => `• ${p}`).join('\n')}\n\n*Time:* ${new Date().toISOString()}`,
        ALERT_CATEGORY.SYSTEM
    ).catch(() => {});
} else if (!problems.length && previous.length) {
    await dispatchExternalAlert(
        `✅ *WATCHDOG — RECOVERED*\n\nAll containers healthy again.\n*Time:* ${new Date().toISOString()}`,
        ALERT_CATEGORY.SYSTEM
    ).catch(() => {});
}

writeState(problems);
console.log(JSON.stringify({ problems, changed: !same }));
process.exit(0);
