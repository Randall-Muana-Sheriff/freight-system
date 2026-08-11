#!/usr/bin/env node
// Stamps build-info.json from the local git checkout so the deployed host
// can report exactly which commit it is running (see config/buildInfo.js
// and the /health endpoint). Run this immediately before syncing files to
// a server — the production host has no git repository of its own.
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'build-info.json');

function git(args, fallback) {
    try {
        return execSync(`git ${args}`, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return fallback;
    }
}

const commit = git('rev-parse HEAD', 'unknown');
const branch = git('rev-parse --abbrev-ref HEAD', null);
// A dirty tree at deploy time means the running code does not match any
// commit — worth surfacing rather than silently reporting a clean SHA.
const dirty = git('status --porcelain', '') !== '';

const info = {
    commit: dirty && commit !== 'unknown' ? `${commit}-dirty` : commit,
    branch,
    builtAt: new Date().toISOString(),
};

fs.writeFileSync(target, `${JSON.stringify(info, null, 2)}\n`);
console.log(`Wrote ${target}:`, info);
