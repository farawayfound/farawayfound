#!/usr/bin/env node
/**
 * Rewrites the SHIPPED block in README.md from the last seven days of
 * contribution data.
 *
 * The shape of this script is dictated by how GitHub reports the data.
 * `commitContributionsByRepository` itemizes ONLY repositories the querying
 * viewer can see by name; everything in a private repo is collapsed into a
 * single `restrictedContributionsCount` and is never broken out per repo, no
 * matter what scopes the token carries. So the public side gets named and
 * linked, the private side gets counted, and there is no code path that could
 * publish a private repository's name even by accident.
 *
 * That happens to be exactly the desired behaviour: the aggregate carries the
 * signal ("188 contributions in private repos") without disclosing that one of
 * them is an active job search.
 *
 * `restrictedContributionsCount` counts contributions of every kind (commits,
 * PRs, reviews, issues), not commits alone — the wording below says
 * "contributions" for that reason and should stay that way.
 *
 *   node scripts/shipped.mjs [--dry-run]
 *
 * Env: GITHUB_TOKEN (required — classic PAT, `repo` scope) ·
 *      SHIPPED_DAYS (default 7) · SHIPPED_NOW (ISO, for reproducible output).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const START = '<!-- SHIPPED:START -->';
const END = '<!-- SHIPPED:END -->';
const README = new URL('../README.md', import.meta.url);
const DAYS = Number(process.env.SHIPPED_DAYS || 7);
const DRY = process.argv.includes('--dry-run');

const QUERY = `
  query($from: DateTime!, $to: DateTime!) {
    viewer {
      contributionsCollection(from: $from, to: $to) {
        restrictedContributionsCount
        commitContributionsByRepository(maxRepositories: 100) {
          contributions { totalCount }
          repository { name url isPrivate }
        }
      }
    }
  }`;

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

function renderLine(collection) {
  const rows = (collection.commitContributionsByRepository ?? [])
    // isPrivate is always false here in practice; filtered anyway so that a
    // future change on GitHub's side cannot start naming private repos.
    .filter((r) => !r.repository.isPrivate)
    .sort((a, b) => b.contributions.totalCount - a.contributions.totalCount);

  const publicCommits = rows.reduce((n, r) => n + r.contributions.totalCount, 0);
  const restricted = collection.restrictedContributionsCount ?? 0;
  const grand = publicCommits + restricted;

  if (!grand) return '**Shipped this week —** nothing at all. Probably on a mountain. 🏔️';

  const parts = rows
    .slice(0, 4)
    .map((r) => `[${r.repository.name}](${r.repository.url}) ×${r.contributions.totalCount}`);
  if (rows.length > 4) parts.push(`${rows.length - 4} more public`);
  if (restricted) parts.push(`**${restricted}** in private repos`);

  return `**Shipped this week —** ${plural(grand, 'contribution')}: ${parts.join(' · ')}.`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('shipped: GITHUB_TOKEN is required (classic PAT, `repo` scope).');
    process.exitCode = 1;
    return;
  }

  const now = process.env.SHIPPED_NOW ? new Date(process.env.SHIPPED_NOW) : new Date();
  const from = new Date(now.getTime() - DAYS * 864e5);

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'farawayfound-profile-readme',
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { from: from.toISOString(), to: now.toISOString() },
    }),
  });
  if (!res.ok) {
    console.error(`shipped: GitHub API ${res.status} — ${await res.text()}`);
    process.exitCode = 1;
    return;
  }
  const body = await res.json();
  if (body.errors) {
    console.error('shipped: ' + JSON.stringify(body.errors, null, 2));
    process.exitCode = 1;
    return;
  }

  const line = renderLine(body.data.viewer.contributionsCollection);
  const block = [
    START,
    '<!-- Regenerated nightly by .github/workflows/shipped.yml — do not edit by hand. -->',
    line,
    END,
  ].join('\n');

  if (DRY) {
    console.log(block);
    return;
  }

  const md = readFileSync(README, 'utf8');
  const s = md.indexOf(START);
  const e = md.indexOf(END);
  if (s < 0 || e < 0 || e < s) {
    console.error(`shipped: README.md is missing its ${START} / ${END} markers.`);
    process.exitCode = 1;
    return;
  }
  const next = md.slice(0, s) + block + md.slice(e + END.length);
  if (next === md) {
    console.log('shipped: no change');
    return;
  }
  writeFileSync(README, next);
  console.log('shipped: updated —\n' + line);
}

// No process.exit() anywhere past the fetch: tearing the process down while
// undici still holds a socket trips a libuv assertion on Windows, which turns
// a successful run into a non-zero exit.
await main();
