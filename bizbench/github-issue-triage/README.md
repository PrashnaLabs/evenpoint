# GitHub issue triage (real data)

A support queue run by an open-source team: the issue tracker of [astral-sh/uv](https://github.com/astral-sh/uv).

- **Data:** all 544 issues opened 1 May to 31 October 2026, fetched with `fetch.py` through the GitHub API. Nothing is synthetic.
- **Steps and timestamps** come from each issue's timeline: opened, triaged (first type label), first maintainer reply, closed.
- **Ground truth** is what the maintainers actually did: the type label they applied (bug, enhancement, question, documentation) and the first reply they wrote. 245 issues have both, so they can be used as test cases.
- **Assumptions** (minutes of work per step, hourly rate, review time) are in `evenpoint.yaml`. They are estimates, not measurements.

Result of the run on 13 November 2026 (gpt-5.4-mini and gpt-5.4-nano, 40 test cases per step, $0.37):
both models picked the right type label 75% of the time, which makes "AI labels, a maintainer checks" worth about 0.9 hours a month at this volume.
Drafting the first reply failed almost every time (0-5%), because maintainers' replies depend on knowing the codebase. So: don't automate it.

Issue text belongs to its GitHub authors. It's public on github.com and included here unchanged as evaluation data. Refresh or change the repo with:

```bash
python bizbench/github-issue-triage/fetch.py --repo astral-sh/uv --since 2026-05-01 --until 2026-10-31
```
