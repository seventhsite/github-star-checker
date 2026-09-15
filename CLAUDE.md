# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GitHub star monitoring tool that runs as a GitHub Actions workflow. Every hour by default (configurable via `workflow_dispatch`), it checks star counts on all repositories owned by the authenticated user, records them in `stars.json`, and notifies you when stars change (increase or decrease).

## Architecture

- **Single workflow**: `.github/workflows/check-stars.yml` — contains all logic inline via `actions/github-script@v7`
- **Data store**: `stars.json` (latest snapshot + `last_weekly_report`/`last_monthly_report` dedup dates) + `stars-history.json` (daily snapshots, 32-day retention for weekly/monthly reports) — persisted via git commit by the workflow itself
- **Notifications**: Configurable via `NOTIFICATION_CHANNEL` env — `issue` (default), `gmail`, or `both`. Changeable via `workflow_dispatch`. Alerts are appended as comments to one `star-notification` issue per UTC month, located by a `<!-- star-notification-month:YYYY-MM -->` marker in the issue body; reports create their own issues with the `star-report` label
- **Reports**: Weekly and monthly star summary reports fire on the first run of a new week (Mon-based) or month, deduped by date in `stars.json` rather than by weekday/hour — the cron is sparse (Tue/Fri), so an hour-exact trigger would never match. Can also be triggered manually via `workflow_dispatch` report input
- First run initializes `stars.json` without creating notifications

## Workflow Steps

1. **Update settings** — if `schedule` or `notification` inputs are provided via `workflow_dispatch`, uses `sed` to mutate the workflow file itself (cron expression and `NOTIFICATION_CHANNEL` env) and commits the change
2. **Check stars** — fetches all public, non-fork repos via `repos.listForAuthenticatedUser` (paginated), diffs against `stars.json`, outputs changes; also writes daily snapshot to `stars-history.json` and generates weekly/monthly reports if applicable
3. **Notify** — comments on the month's alert issue (creating it if absent) and/or sends Gmail depending on `NOTIFICATION_CHANNEL`; separate steps for alerts vs. reports
4. **Commit and push** — commits `stars.json`, `stars-history.json`, and the workflow file itself if any changed

## Secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `STAR_MONITOR_TOKEN` | Always | Classic PAT (`repo` + `workflow` scopes) — needed to list all owned repos |
| `GMAIL_USER` | Gmail only | Gmail address for sending |
| `GMAIL_APP_PASSWORD` | Gmail only | Gmail App Password |
| `NOTIFY_EMAIL` | Gmail only | Recipient address |

## Testing Locally

The workflow can be triggered manually via `workflow_dispatch` on GitHub. Most logic runs within GitHub Actions using `actions/github-script`, but two pieces are covered by tests that extract the relevant script block out of the workflow YAML and run it against stubs:

```bash
node --test .github/tests/*.test.cjs
```

`monthly-alert.test.cjs` matches the step named `Append monthly GitHub Issue comment (alert)`, and `report-trigger.test.cjs` matches the `// Date-based dedup:` block — renaming either, or reindenting their scripts, breaks the extraction regexes.
