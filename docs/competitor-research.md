# Evenpoint — Competitor Research & Feature Roadmap

_Researched 2026-11-13. Most sources are vendor pages or SEO blogs; no public pricing found. Verify claims (especially Zendesk eligibility/lookback) before using in a pitch._

## Summary

The core gap still holds: no open-source tool combines your exports + process mining + model tests on your own data. But two closed products now cover part of it, and the competitor table in architecture v0 is outdated in a few places.

## Landscape updates

| Player | What's new | What it means for Evenpoint |
|---|---|---|
| **Zendesk (native)** | Built-in "automation potential" report. Looks at recent tickets (Zendesk says 30 days; a third-party guide says 90), estimates hours saved, splits tickets into "covered by knowledge" vs "AI can't answer yet". Included in Suite and Support plans. | **Biggest threat, missing from the table.** Free for exactly the support-ticket buyer we target. Our answer: it only sees Zendesk, only scores Zendesk's own AI agent, and is written by the company selling that agent. Position as the vendor-neutral second opinion. |
| **Vals AI** | Raised $40M Series A (led by a16z, per a crypto-exchange blog; unconfirmed). Sells private evals built from a customer's own data, incl. Vals Smith (turns a customer's GitHub PRs into a coding benchmark). | Table says "No, generic tasks" — now wrong. Change to "Yes, enterprise, closed". |
| **Larridin** | $47M total funding. Now also offers "workflow optimization: mapping business processes to find automation opportunities", plus a remote MCP server for Claude/Cursor. | Moving from post-adoption ROI toward pre-adoption prediction. Still enterprise-only, contact-for-pricing, no independent reviews. |
| **Mimica** | Ranks opportunities by "Ease of Automation" score + dollar ROI. No public pricing. One directory says it's a poor fit for small teams. | Confirms SMBs unserved. "Ease × dollar ROI" ranking is the format buyers already expect. |
| **Auditic** | Free "AI opportunity assessment" for consultants, scored from manual effort and complexity. | Belongs in the "your guesses" row. Consultants are also a possible distribution channel. |
| **ai-production-readiness-kit** (OSS) | CLI scoring AI workflow readiness from YAML files. No LLM calls, no event logs. | Closest OSS neighbour. Questionnaire, not measurement on real data. |
| **agent-assist-bench** (OSS) | Benchmarks agent frameworks on your real workflows, graded by humans. | Close to our benchmark step; no process mining or ROI. |
| **Celonis AgentC** | Feeds process intelligence into agents on Copilot Studio, Bedrock, Agentforce. No sign it identifies automation opportunities directly. | Enterprise ERP data. No SMB overlap. |

**LiteLLM is mislabelled** in the table. It's an open-source LLM gateway, not an ROI calculator. Remove from competitors; use as a building block (see below).

## Features to add (priority order)

### v0 — directly support the pitch

1. **Ranges, not single numbers.** With ~50 sample tasks, "hours saved" needs a range (bootstrap resampling). "Your guesses" calculators can't do this; it's where trust comes from.
2. **Break-even + sensitivity.** Show the accuracy a model needs before automating pays off; let users adjust hourly rate and review time. Feeds the don't-automate list.
3. **Three automation modes, each with its own ROI:** fully automatic / AI drafts + human approves / AI only triages and routes. Most SMB wins are draft-and-approve; the review-time term already handles it.
4. **Help-content gap check.** Load help-centre/docs export; report ticket types with no answer anywhere ("write these 10 articles first"). Zendesk does this — needed to match.
5. **Cross-check vendor claims.** Load Zendesk's automation-potential numbers, compare against what models actually achieved on the same tickets. Most convincing demo.
6. **Data-quality warnings.** Flag missing timestamps, tiny samples, unclear case IDs before running, so a bad export doesn't produce a confident wrong ROI.
7. **Cost estimate before a run.** Show benchmark API cost before spending anything.

### v1 — retention

8. **`evenpoint rerun` on new model release.** Re-run saved test cases, show the delta. Brings users back every few weeks for free.
9. **Model routing suggestion.** E.g. cheap model for 80% of cases, stronger model for hard ones. Report cost per successful task for the mix.
10. **Predicted vs actual savings.** After automating, load a fresh export and compare real result to forecast. Starts covering Larridin's post-adoption space.
11. **MCP server.** Let users query their report from Claude/Cursor. Larridin has one; small effort.
12. **Opt-in shared benchmark.** Users contribute anonymised, aggregated results by workflow type to grow bizbench. Only aggregates leave the machine.

### v2

13. **Multi-step tasks.** Steps needing lookups (e.g. order status) — simulate tools from export data.
14. **Build vs buy.** Compare self-built automation against a vendor bot's per-resolution price (user-entered).

## Reuse instead of building

- **Pricing catalog:** LiteLLM's maintained `model_prices_and_context_window.json`; LiteLLM also handles calls to OpenAI/Anthropic/Gemini/Ollama. Covers two boxes.
- **Runner + graders:** promptfoo runs YAML test grids and LLM-judge grading across providers. Export test cases in its format or call it directly. Some sources say OpenAI is acquiring promptfoo (unconfirmed) — check that and its MIT licence first.
- **Process mining:** keep PM4Py. Apromore Community Edition exists if someone wants a GUI.
- **Skip for now:** live API connectors (exports suffice for v0), hosted multi-user version, desktop recording.

## Suggested "Our gap" wording

> Free tools run on guesses. Zendesk only scores its own bot. Data-driven tools are closed and enterprise-only. Evenpoint is neutral, local and open source, and runs model tests on your own exports from any tool.

## Sources

- [Larridin $30M Series A](https://larridin.com/blog/larridin-raises-30-million-series-a-to-prove-the-impact-of-ai)
- [Larridin $47M total funding (Let's Data Science)](https://letsdatascience.com/news/larridin-raises-30-million-series-a-to-track-enterprise-ai-s-9ae62401)
- [Larridin on Beri](https://www.beri.net/tools/larridin)
- [Larridin competitors page](https://larridin.com/larridin-competitors-alternatives?hsLang=en)
- [Waydev on Larridin](https://waydev.co/?p=23132)
- [Zendesk automation potential rollout](https://support.zendesk.com/hc/en-us/articles/10593801794842)
- [Zendesk plan article](https://support.zendesk.com/hc/en-us/articles/9877546283930)
- [Zendesk AI Agent Automation Potential community post](https://zendesk2-en-sandbox-hub.insided.com/private-to-be-launched-54/what-is-the-ai-agent-automation-potential-eap-18951)
- [eesel: reduce Zendesk ticket volume](https://www.eesel.ai/blog/how-to-reduce-zendesk-ticket-volume-with-ai)
- [Info-Tech: Zendesk bets on AI that solves](https://www.infotech.com/software-reviews/vendor-technology-notes/zendesk-bets-on-ai-that-solves-not-just-deflects)
- [Vals AI (Sacra)](https://sacra.com/c/vals-ai)
- [Vals AI methodology](https://vals.ai/methodology)
- [Vals AI $40M Series A](https://www.kucoin.com/blog/vals-ai-40m-series-a-real-world-benchmarks?lang=en_US)
- [Mimica on SAP](https://www.sap.com/poland/products/business-transformation-management/partners/mimica-automation-limited-mimica-task-mining-process-intelligence.html)
- [Mimica on Capterra](https://www.capterra.com/p/196675/Mimica-Mapper/)
- [Mimica on Beri](https://www.beri.net/tools/mimica)
- [Mimica Miner on Gartner](https://www.gartner.com/reviews/product/mimica-miner)
- [Auditic AI opportunity assessment](https://auditic.app/features/ai-opportunity-assessment)
- [ai-production-readiness-kit](https://github.com/mihaibc/ai-production-readiness-kit)
- [awesome-agent-harness (lists agent-assist-bench)](https://github.com/Picrew/awesome-agent-harness)
- [Celonis AgentC](https://celonis.com/blog/enterprise-ai-unleashed-agentc-lets-companies-develop-agents-in-leading-ai-platforms-powered-with-celonis-process-intelligence)
- [Celonis platform upgrades (IT Brief)](https://itbrief.com.au/story/celonis-expands-ai-orchestration-in-latest-platform-upgrades)
- [Self-hosted process mining: PM4Py, Apromore, ProM](https://www.pistack.xyz/posts/2026-06-16-self-hosted-process-mining-pm4py-apromore-prom/)
- [PM4Py paper](https://arxiv.org/pdf/1905.06169)
- [Best open-source eval frameworks 2026](https://futureagi.com/blog/best-open-source-eval-frameworks-2026)
- [promptfoo vs OpenAI Evals](https://qaskills.sh/blog/promptfoo-vs-openai-evals-comparison-2026)
- [OpenAI Evals](https://github.com/openai/evals)
