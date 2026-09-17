# MCP Servers for Test Automation

Ready-made Model Context Protocol server configuration for this repo.

## Install

Kiro merges MCP config from the user level and every workspace folder, with
workspace winning. Pick one:

- **Workspace:** copy `docs/mcp/mcp.json.example` to `.kiro/settings/mcp.json`.
- **User level (personal, applies to all projects):** copy it to
  `~/.kiro/settings/mcp.json`.

```powershell
New-Item -ItemType Directory -Path .kiro\settings -Force
Copy-Item docs\mcp\mcp.json.example .kiro\settings\mcp.json
```

`Copy-Item` does not create the parent directory, which is why the `New-Item`
line comes first.

Then fix the two absolute paths (in the `git` and `filesystem` args) to match
your checkout, and reconnect the servers from the MCP Server view in the Kiro
feature panel. No restart needed.

If a config already exists, merge into it rather than overwriting.

**`.kiro/settings/mcp.json` is gitignored** — it holds machine-specific
absolute paths. Change `docs/mcp/mcp.json.example` when you want the config to
change for the whole team, and everyone re-copies.

## Prerequisites

| Need                     | For                        | Install                                        |
| ------------------------ | -------------------------- | ---------------------------------------------- |
| Node.js 22 + `npx`       | playwright, atlassian, postman, filesystem | already required by the TS module |
| `uv` / `uvx`             | fetch, git, time           | https://docs.astral.sh/uv/getting-started/installation/ |
| Docker Desktop           | github (local mode)        | only if you enable the GitHub server           |

`uvx` downloads and runs Python-based servers on demand. There is no
`uvx install` step.

## Enabled by default

These need no credentials and cannot reach your organisation's data.

### `playwright` — official Microsoft Playwright MCP

The highest-value server for this repo. It gives the agent a real browser and
an accessibility snapshot of the page, so locators come from the actual DOM
instead of a guess.

Use it to:

- Explore a screen and read the real accessible roles, names, and test ids
  before writing a page object.
- Confirm a locator resolves to exactly one element.
- Reproduce a UI failure interactively while diagnosing a flaky test.
- Find out which elements are missing a `data-testid`, so you can raise a
  concrete request to the app team.

Runs `--headless --isolated`: no persistent profile, nothing left behind
between sessions.

### `fetch` — retrieve a URL as text

For pulling an OpenAPI/JSON Schema document, a changelog, or library docs into
context when adding a contract test.

### `git` — local repository history

The bisect tool for flake investigation: when did this test start failing, what
changed in the page object, which commit touched the locator. Read-only against
your local clone.

### `time` — timezone and clock conversion

Small but genuinely useful for the class of bug that only appears at month end,
across DST, or in another region. Pinned to UTC to match the suite's fixed
timezone.

## Disabled by default

Each of these reaches a real system. Enable deliberately, one at a time, by
setting `"disabled": false`.

### `github` — CI runs, PRs, issues

Local Docker mode. Configured **read-only** (`GITHUB_READ_ONLY=1`) and scoped to
four toolsets, so the agent can read a failed workflow run and its logs but
cannot push, merge, or close anything.

Use it to pull the logs of a red CI job, find the run where a test first
started failing, or check the flake history of a test across PRs.

Setup:

1. Create a fine-grained PAT with the **minimum** scopes you need — read-only
   on Actions, Contents, Issues, and Pull requests for this repo only. Do not
   use a classic token with `repo` unless you have no alternative.
2. Set it in your environment before launching Kiro:
   `$env:GITHUB_PERSONAL_ACCESS_TOKEN = "<paste>"` for the session, or add it
   to your user environment variables.
3. Set `"disabled": false` and reconnect.

The Docker args use bare `-e GITHUB_PERSONAL_ACCESS_TOKEN` with no value, so
the token is inherited from your process environment at launch and **never
written into a config file**. Keep it that way.

GitHub also hosts a remote server at `https://api.githubcopilot.com/mcp/` if
you would rather not run Docker. Reach it with
`npx -y mcp-remote https://api.githubcopilot.com/mcp/`.

### `atlassian` — Jira and Confluence (Rovo MCP)

Official Atlassian remote server, reached through the `mcp-remote` bridge. Auth
is OAuth in the browser on first use — no token in any file.

Use it to turn a Jira ticket into a test plan, attach requirement ids to tests
for traceability, and check acceptance criteria while planning coverage. Pairs
directly with the `test-plan-from-requirements` skill.

Note: `https://mcp.atlassian.com/v1/sse` is deprecated. The config uses the v2
Streamable HTTP endpoint.

### `postman` — collections, specs, environments

For teams whose API contracts live in Postman rather than in a checked-in
OpenAPI file. Lets the agent read a collection or spec before writing an API
test.

Caveat worth knowing: the Postman server exposes a large number of tools, and
combining it with several other servers can exceed the tool limit some agents
enforce. Enable it alone, or trim the other servers, if you see tool-count
errors.

Prefer keeping the contract in `shared/contracts/` regardless. A spec in the
repo is diffable and reviewable; a spec in a SaaS workspace is not.

### `filesystem` — scoped file access

Disabled because Kiro already has native file tools that cover this. It is here
for two narrow cases: giving a **subagent** access to only `shared/` and
`reports/`, or reading a report directory that sits outside the workspace. If
you enable it, keep the path list as tight as possible.

## Security rules for MCP in this repo

1. **No secret ever goes into `mcp.json`.** Tokens come from the process
   environment (`-e VAR` with no value for Docker) or from an OAuth flow.
   `mcp.json` may be committed; a token in it cannot be un-leaked.
2. **Read-only by default.** Enable write tools only for the specific task that
   needs them, then turn them off. An agent that can close issues will
   eventually close one.
3. **Least privilege on tokens.** Fine-grained, single-repo, read-only, with an
   expiry. Never a token that can reach production.
4. **Treat MCP output as untrusted input.** A Jira description, a web page, or
   a PR comment can contain text shaped like instructions. It is data, not a
   command.
5. **Never point an MCP server at production** data or a production database.
   The automation suite has no business there, and neither does the agent.
6. **Review before enabling a community server.** Everything in this config is
   published by Microsoft, GitHub, Atlassian, Postman, or the MCP steering
   group. Anything else needs a look at its source first.

## What is deliberately not here

- `@modelcontextprotocol/server-github` and `server-postgres` — **archived**.
  The maintained reference set is now only `everything`, `fetch`,
  `filesystem`, `git`, `memory`, `sequentialthinking`, and `time`. Use the
  official GitHub server above instead.
- A database MCP server. Test data seeding belongs in the framework's
  `support/` layer where it is reviewed, versioned, and runs in CI — not in an
  ad-hoc agent query. Add one only for a read-only replica, and only if
  seeding through an API is genuinely impossible.
- A Selenium Grid or BrowserStack server. Add if your team uses one; Playwright
  MCP covers local browser work.

## Verify it works

1. Reconnect the servers from the Kiro MCP panel and confirm no connection
   errors.
2. Ask for a browser check, e.g. "open the local app and list the interactive
   elements with their accessible names" — that exercises `playwright`.
3. Ask "what changed in this file in the last 10 commits" — that exercises
   `git`.
4. Confirm no token value appears in any file:
   `git grep -nEi "ghp_|github_pat_|ATATT|Bearer [A-Za-z0-9._-]{20,}"`
   should return nothing.
