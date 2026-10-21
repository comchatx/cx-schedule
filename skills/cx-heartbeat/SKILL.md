---
name: cx-heartbeat
description: "Scheduled checks in a ComChatX box - a heartbeat, a recurring check, a job at a time - run by pi-cron (`@bacnh85/pi-cron`) and its `cron` tool; what pi-cron's own words miss here. Needs @bacnh85/pi-cron; if no cron skill is listed, it is not installed, and the seller installs cx-heartbeat again in Plugins, which installs it first, or it is installed with `pi install -l npm:@bacnh85/pi-cron@0.4.0` run in /tenant (without -l it is gone at the box's next start). cx-heartbeat itself installs from Plugins, or `pi install -l npm:cx-heartbeat` in /tenant."
---

## When a job runs

- A job runs only while the box is awake: in use, or kept up by `keep_awake` in `/tenant/settings.json`. A sleeping box runs no job, and no job wakes it. Awake time is billed.
- A job that came due while the box slept fires once, soon after the next open; the times it missed in between are skipped.
- A job that fires more often than the box's idle threshold keeps the box awake, and that time is billed.
- The box's clock is UTC: a five-field schedule is read in UTC.
- `export` prints crontab lines and nothing installs or runs them here; the box has no crontab.

## Where a job lands

- A fired job is a follow-up turn in the conversation that is open, after any turn under way; the seller sees it there.
- In `cron action:"list"`, `[ok]` means pi took the job's turn, not that the work in it succeeded.
- Every session runs in `/tenant`, so a job made without `cwd` fires here and needs no pin.
- A pin (`model` or `thinking`) runs the job in a second, headless pi beside the session: a fire takes two model requests, the headless run and the turn that reports its result, where an unpinned job takes one, and the second pi may hit pi's lock.
- The jobs live in `/tenant/.pi/cx-heartbeat/cron/jobs.json`, so they outlast the box's stops; pi-cron's own words name `<agentDir>/cron`, which here is a link to that file's directory.
