#!/usr/bin/env node
// Keeps exactly one Vercel deployment for this project: the newest READY production deployment.
// Everything else (old production builds, previews, failed/cancelled builds) is deleted.
//
//   node scripts/prune-deployments.mjs          dry run: lists what would be deleted
//   node scripts/prune-deployments.mjs --yes    actually deletes
//
// Needs VERCEL_TOKEN in the environment (never commit it). Run it AFTER a production deploy is READY,
// so the site never loses its live build. Safety rules (see selectDeletions):
//   - refuses to run if a newer production build is still building,
//   - never touches deployments that are still building or queued,
//   - never deletes the newest READY production deployment.

import { pathToFileURL } from 'node:url';

const API = 'https://api.vercel.com';
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_HYbQfoIUkjjiEH6SwbhvbqGhKzW1';
const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_FdOJU6k0aSSHE2P7hHTWrNuP';

const stateOf = (d) => d.state || d.readyState;
const isProduction = (d) => d.target === 'production';
const inFlight = (d) => ['BUILDING', 'QUEUED', 'INITIALIZING'].includes(stateOf(d));

/**
 * Pure selection logic (unit-tested).
 * @returns {{ keep: object|null, remove: object[], skipped: object[], error?: string }}
 */
export function selectDeletions(deployments) {
  const byNewest = [...deployments].sort((a, b) => b.created - a.created);
  const keep = byNewest.find((d) => isProduction(d) && stateOf(d) === 'READY') || null;
  if (!keep) return { keep: null, remove: [], skipped: [], error: 'No READY production deployment found; refusing to delete anything.' };

  const newerProdInFlight = byNewest.find((d) => isProduction(d) && inFlight(d) && d.created > keep.created);
  if (newerProdInFlight) {
    return { keep, remove: [], skipped: [], error: `A newer production deployment (${newerProdInFlight.uid}) is still ${stateOf(newerProdInFlight)}; wait for it to finish, then run again.` };
  }

  const skipped = byNewest.filter((d) => d.uid !== keep.uid && inFlight(d));
  const remove = byNewest.filter((d) => d.uid !== keep.uid && !inFlight(d));
  return { keep, remove, skipped };
}

async function api(path, init = {}) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not set.');
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAll() {
  const out = [];
  let until;
  for (;;) {
    const page = await api(`/v6/deployments?projectId=${PROJECT_ID}&limit=100${until ? `&until=${until}` : ''}`);
    out.push(...page.deployments);
    until = page.pagination?.next;
    if (!until) return out;
  }
}

async function main() {
  const confirm = process.argv.includes('--yes');
  const deployments = await listAll();
  const { keep, remove, skipped, error } = selectDeletions(deployments);
  if (error) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  console.log(`Keeping: ${keep.uid}  ${keep.url}  (production, READY)`);
  for (const d of skipped) console.log(`Skipping (still ${stateOf(d)}): ${d.uid}`);
  console.log(`${confirm ? 'Deleting' : 'Would delete'} ${remove.length} deployment(s):`);
  for (const d of remove) console.log(`  ${d.uid}  ${isProduction(d) ? 'production' : 'preview'}  ${stateOf(d)}  ${d.url}`);
  if (!confirm) {
    console.log('Dry run only. Re-run with --yes to delete.');
    return;
  }
  let failed = 0;
  for (const d of remove) {
    try {
      await api(`/v13/deployments/${d.uid}`, { method: 'DELETE' });
    } catch (err) {
      failed++;
      console.error(`Failed to delete ${d.uid}: ${err.message}`);
    }
  }
  console.log(`Done. Deleted ${remove.length - failed}, failed ${failed}.`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
