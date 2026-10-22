---
name: cx-schedule
description: "Scheduled tasks in a ComChatX box - a recurring check, a task at a time - run by the scheduler cx-schedule carries (`@amaster.ai/pi-task-scheduler`) and its `scheduler_*` tools; what the tools' own words miss here. cx-schedule installs from Plugins, or with `pi install -l npm:@comchatx/cx-schedule` run in /tenant (without -l it is gone at the box's next start). Do not install `@amaster.ai/pi-task-scheduler` beside it: cx-schedule carries it, and a second copy loads it twice."
---

## When a task runs

- A task runs only while the box is awake: in use, or kept up by `keep_awake` in `/tenant/settings.json`. A sleeping box runs no task, and no task wakes it. Awake time is billed.
- A task whose time falls while the box sleeps does not run, and does not wake the box: a `cron` task runs at its next time after the box opens, an `interval` task counts its interval again from the open, and a `once` task whose time passed is marked `error` and never runs.
- A task that runs more often than the box's idle threshold keeps the box awake, and that time is billed.
- The box's clock is UTC: a `cron` schedule is read in UTC.

## Where a task lands

- A task belongs to the conversation it was made in. It runs as a follow-up turn there, after any turn under way, and only while that conversation is the open one; in another conversation it neither runs nor shows in `scheduler_list`.
- A run's `success` means pi took the turn, not that the work in it succeeded.
- A task runs on the conversation's own model: the `model` a task records is not used.
- The tasks live in `/tenant/.pi/cx-schedule/scheduler/`, so they outlast the box's stops.
