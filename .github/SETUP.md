# Wiring for this profile

## The one setting that matters most

**Settings → Public profile → Contributions & Activity → ✅ "Include private
contributions on my profile."**

Without it, a visitor sees ~23 contributions for 2026 instead of 807, and the
snake and the 3D calendar both animate an almost-empty grid. Private repos are
still shown anonymously — only the green squares change, never the repo names.

## Secrets

| Secret | Used by | Scope | Without it |
|---|---|---|---|
| `PROFILE_TOKEN` | `shipped.yml`, `profile-3d.yml` | classic PAT, `repo` | `shipped` skips; the 3D calendar falls back to the job token and sees less |
| `METRICS_TOKEN` | `metrics.yml` | classic PAT, `public_repo` (+`repo` to count private) | the metrics steps skip |
| `WAKATIME_API_KEY` | `metrics.yml` | wakatime.com/settings/api-key | the WakaTime card skips |

Every workflow checks for its secret and no-ops cleanly when it is absent, so
nothing here goes red before the tokens are added.

## Manual, because GitHub has no API for it

Repository pinning. The GraphQL API exposes `pinIssue` and `pinEnvironment`
but nothing for repositories, so the pinned set has to be chosen on the
profile page itself. Suggested: `open-fleet`, `careerclaw`, `publicLandingPage`,
`PiCluster`.
