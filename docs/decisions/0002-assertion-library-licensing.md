# 0002 — AwesomeAssertions rather than FluentAssertions

- **Status:** Accepted, and worth reviewing rather than inheriting
- **Date:** 2026-09-17
- **Applies to:** the `csharp/` module

## Context

`tech.md` originally named **FluentAssertions** as the C# assertion library,
with no version constraint. That is a commercial liability, not just a technical
choice.

FluentAssertions **8.0** (January 2025) replaced its Apache-2.0 licence with a
proprietary one, in partnership with Xceed. Free for open-source and
non-commercial use; **commercial use requires a paid seat**, listed from around
USD 130 per developer.

Version **7.x remains Apache-2.0 indefinitely** and continues to receive
bugfixes, per the project's own site — but no new features.

A standard that says "FluentAssertions" without a version therefore quietly
points every future `dotnet add package` at a paid dependency. Nobody would
notice until procurement or an audit did.

Sources: [fluentassertions.com licensing](https://fluentassertions.com/),
[InfoQ report](https://www.infoq.com/news/2025/01/fluent-assertions-v8-license/),
[AwesomeAssertions](https://github.com/AwesomeAssertions/AwesomeAssertions).
Content was rephrased for compliance with licensing restrictions.

## Decision

Use **AwesomeAssertions**, the MIT-licensed community fork of FluentAssertions
7.x, pinned in `csharp/Directory.Packages.props`.

`tech.md` is updated to name it explicitly, so the licensing question cannot be
re-introduced by someone following the standard.

## Consequences

- The API is compatible with FluentAssertions 7.x. Migration in either direction
  is a package swap and a namespace change, not a rewrite. That is what makes
  this decision cheap to reverse.
- `using AwesomeAssertions;` replaces `using FluentAssertions;`.
- `AssertionScope` comes from `AwesomeAssertions.Execution`.
- No licence obligation for commercial use.

## Alternatives considered

- **Pin FluentAssertions 7.x.** Also free and requires no code change. Rejected
  as the default because it parks the module on a library frozen to bugfixes,
  and because a future `dotnet add package FluentAssertions` with no version
  silently lands on 8.x. If your organisation prefers the original project's
  provenance over a fork's, this is the reasonable second choice.
- **Buy commercial FluentAssertions 8.x.** Defensible for a team already
  invested in it. Not justifiable for a template.
- **Shouldly.** Free and well established, but a different API, so switching
  later is a rewrite rather than a swap.
- **NUnit's own constraint model.** No dependency at all. Rejected because
  `Should().BeEquivalentTo(...)` and `AssertionScope` do real work here:
  object comparison with exclusions, and multi-field verification of one action.

## Review trigger

Revisit if AwesomeAssertions goes unmaintained — check release cadence and open
security issues — or if the team acquires FluentAssertions licences for other
reasons.
