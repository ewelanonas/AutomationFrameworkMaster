# 0005 — `master` carries every module

- **Status:** Accepted
- **Date:** 2026-09-17
- **Supersedes:** the per-branch module layout described in
  [ADR 0004](0004-ci-runs-smoke-not-regression.md) and the original branching
  model in the README

## Context

The repository originally kept each language module on its own long-lived branch:
`main` held the shared foundation, and `framework/java`, `framework/csharp` and so
on each added one module. The reasoning was that a team adopting one stack should
be able to clone only what they need.

Two things became clear once two modules existed.

**The isolation was worth less than it cost.** A team wanting only the Java module
can delete three folders. That is cheaper than the alternative: every change to
`.kiro/`, `docs/`, `shared/` or the CI workflow had to land on `main` and then be
merged into every framework branch. That happened five times in one working
session. Each merge is trivial and each one is an opportunity to forget.

**Cross-module parity is a stated requirement, and separate branches hide
breaches of it.** `product.md` requires that a concept existing in one module
exists in all of them with the same name. Two defects this session were found only
because the second module was built and compared against the first:

- The account-lockout defect, where negative sign-in tests shared an account and
  locked it. It existed in the Java module from the start and was invisible until
  C# hit the same wall.
- The missing NUnit `FixtureLifeCycle` setting, whose counterpart the Java module
  had configured all along. Seeing both files side by side would have made it
  obvious immediately.

Parity is far easier to hold when the modules are in one working tree.

## Decision

**`master` is the primary branch and carries every module.** The `framework/*`
branches are kept as per-language views for anyone who wants a single-stack
checkout, refreshed from `master` rather than feeding it.

The merge direction inverts: work lands on `master`, and a framework branch is a
projection of it.

## Consequences

- **No more merge-down chore for shared changes.** One commit, one branch.
- **CI runs both module jobs on every push to `master`.** Both suites target the
  same public sandbox, so the two jobs now share a job-level concurrency group and
  queue rather than running together. Gate time roughly doubles; the alternative
  is self-inflicted connection resets, which this repo has already produced once.
- **A Java developer clones the C# module too.** Accepted. It is a few megabytes
  and a folder they can ignore or delete.
- **The `detect` job in the CI workflow needed no change.** It looks for
  `java/pom.xml` and `csharp/AutomationFramework.sln` rather than mapping branches
  to modules, so it correctly runs both jobs on `master` and one on each framework
  branch. Detecting what is present rather than encoding an assumption is what
  made the restructure cheap.
- The five merge-down commits in the history are not noise. They are the record of
  a rule that was followed while it was the rule.

## On the branch name

`master` is the name the team asked for. Worth knowing: GitHub's default for new
repositories is `main`, and some tooling and documentation assume it. Nothing here
depends on the name — the CI workflow lists both while the switch settles — so
this is a naming preference with no technical consequence beyond remembering to
set the default branch in the repository settings.

## What was deliberately not done

`main` and the `framework/*` branches were **not deleted**. Deleting a remote
branch is not reversible from the client, and which of them to keep is a decision
for the team. Once `master` is the default branch and the first CI run on it is
green, they can go.
