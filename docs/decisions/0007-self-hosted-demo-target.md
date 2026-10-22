# 0007 — run the demo target ourselves in CI

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Every run on `master` finished the same way: the API and contract suites green,
the UI suites red in every module at once. The failures were uniform — each
`getByTestId` timed out, no page object was at fault, and the same tests passed
locally against the same URLs.

The cause is the far end, not the suites. `practicesoftwaretesting.com` answers
GitHub Actions egress with **HTTP 403** and the response header
**`cf-mitigated: challenge`**, serving a Turnstile interstitial instead of the
application. The Angular bundle therefore never loads, nothing with a `data-test`
attribute ever exists, and the only symptom a Playwright trace can show is a
locator that never resolved.

That explains the shape of the failure precisely: the API suites talk to
`api.practicesoftwaretesting.com` with plain HTTP calls that the challenge does
not gate the same way, so they stayed green while the browser work did not. It
also means there is nothing to fix inside the repository. A bot challenge is the
target defending itself against traffic it has every reason to distrust, and no
timeout, retry or wait makes a challenge page render a product list.

## Decision

**Run the Toolshop application on the runner, as four digest-pinned containers,
once per module job, and point the suites at loopback through a new
`shared/environments/ci.json`.**

The stack is `.github/docker/docker-compose.ci.yml`: `mariadb`, `laravel-api`
(PHP-FPM), `web` (nginx) and `angular-ui`. Only two ports are published —
`8091:80` for the API and `4200:4200` for the UI — because the Angular
development build has `http://localhost:8091` compiled in as its API URL. The
browser runs on the runner host, not in a container.

The lifecycle lives in two composite actions, `.github/actions/start-demo-target`
and `.github/actions/stop-demo-target`, so each module job wires it in with two
steps rather than forty lines. Adding the TypeScript job later is the same two
steps.

`AF_ENV: ci` at workflow level selects the new descriptor. Local runs are
untouched: `shared/environments/local.json` still points at the public sandbox,
and **Docker is not a prerequisite for a local suite run.** A developer who wants
the identical target locally brings the compose file up by hand with
`TOOLSHOP_DB_PASSWORD` set; `.env.example` carries the four commands.

## Why `docker compose` and not `services:`

The deciding factor is a single command. `php artisan migrate:fresh --seed
--force` has to run **inside** the API container after it boots, and
`services:` offers no `exec` and no post-start hook — there is no supported point
at which to run it. Three smaller reasons point the same way:

- `services:` gives no startup ordering, so nothing expresses "the API starts
  after the database is answering".
- The shared `/var/www` code volume between `laravel-api` and `web` cannot be
  declared there reliably, and nginx needs it to serve static files.
- A developer can run the exact same compose file. A `services:` block is
  reproducible only inside Actions.

## Why no `cron`

Upstream's compose file includes a `cron` service that runs the Laravel
scheduler, and the scheduler executes `migrate:fresh --seed --force` **hourly**
in a production environment. That is how the public sandbox resets itself. In CI
it is a job that can drop the database underneath a running suite. It is absent
on purpose, and the compose file says so above the services so nobody restores it
for parity with upstream.

## Why `2.5`, and why pinned by digest

The `2.5` tag is the newest published tag for the API and UI images, and it is
kept in the compose file because a tag documents intent in a way a hash cannot.
The **digest** is what makes the pull immutable, which is what `tech.md`'s
version discipline requires of every dependency. The `web` image publishes only
`latest`, so for that service a digest is the only pin available at all — had we
pinned by tag we would have had a floating dependency in the middle of the stack.

## Why the element timeout went back to 10000

CI used to set `AF_TIMEOUTS_ELEMENTMS: '30000'` at workflow level, justified by
a cold runner needing longer for the SPA to become interactive. The trace
disproved that theory: the page was not slow, it was a challenge page, so no
budget would ever have been enough. Loopback is also faster than the sandbox ever
was.

It had to be **deleted** rather than simply omitted from the new descriptor,
because an `AF_*` process variable outranks the descriptor in every module's
config loader. Left in the `env:` block it would have overridden `ci.json`'s
10000 silently and forever. `ci.json` now carries 10000, matching `local.json`,
and the comment that explained the 30000 is gone rather than left to mislead.

## Why the shared concurrency group went

Both module jobs carried `concurrency: demo-target-${{ github.run_id }}`, which
serialised them. The reason was sound at the time: two suites at four workers
each, hitting one public sandbox, had already drawn connection resets out of it.

Per-job containers remove the shared resource. Each job brings up its own stack
on its own runner, the jobs are independent again, and they run in parallel — so
the gate on `master` stops paying roughly double for a constraint that no longer
exists. The workflow-level concurrency group stays, for the unrelated reason that
a superseded run should stop burning runner time.

## Licence position

**Stated as the upstream terms as reported, not as legal advice.** A team with a
commercial use case should read the upstream licence itself and take its own
view.

Upstream's licence permits viewing, copying and running the software for
**private, internal and non-commercial** purposes. It reserves commercial use,
hosting, publishing a copy, and redistribution.

This repository is a **learning template for students** — a reference
implementation people copy to learn the architecture, not a product. Running the
application in our own CI to exercise our own test suites sits inside the
permitted use.

Two rules follow, and they are the operative part of this section:

- **Pull the public images directly in CI.** The compose file references
  `testsmith/...` and `yobasystems/...` by digest from their public registries on
  every run.
- **Never mirror them to GHCR or any other registry.** Re-publishing a copy is
  exactly what the licence reserves, and a convenience cache is not a reason to
  do it. If pull rate limits ever bite, the answer is a runner-side layer cache,
  not a mirror.

An adopting team doing commercial work does not need any of this: it points
`AF_UI_BASEURL` and `AF_API_BASEURL` at **its own application under test** and
deletes the compose file. Nothing in the modules depends on Toolshop.

## Divergence, and how it is detected

The stack we run is not provably identical to what the schemas describe, and that
gap is worth naming rather than assuming away.

- **Image `2.5` versus the schema date — an assumption, awaiting a real CI
  run.** Image `2.5` was pushed 2026-09-09; the JSON Schemas in
  `shared/contracts/` were derived from live responses on 2026-09-17, and live
  may have moved since. The direct evidence that the three sources differ is a
  product count: live answers `total: 51` while the seeder on upstream `main`
  inserts 53 rows. No test asserts a count, so that particular difference breaks
  nothing — but it is proof that "the image matches the schemas" is an
  assumption, not a fact.
- **The first-product/specifications pairing — also an assumption, awaiting a
  real CI run.** `test_renders_specifications_when_product_is_opened` and its
  Java and C# equivalents take the **first** product on page 1 and assert its
  specifications table is visible and non-empty. Upstream's `ProductSpecSeeder`
  matches products by name and silently skips any product it has no entry for. On
  upstream `main` the first product is Combination Pliers, which does have specs,
  so the pairing holds there. **It is unverified inside image `2.5`.** If that
  test fails on the first run: diagnose with `GET
  http://localhost:8091/products?page=1` to see which product is first, then `GET
  /products/{id}` to see whether it has specifications. The candidate fixes are a
  different image pin or an upstream data question — never a softer assertion and
  never a conditional in the test.
- **`ng serve` versus a production build.** The UI image runs the Angular
  development server, so it can log console noise a production bundle would not,
  and its first request waits on the first build. The console-error allowlist is
  written against the sandbox's behaviour; whether it still covers exactly the
  dev-server noise is untested here.
- **Detection:** the start action reads `/status` from the running API and writes
  the version it reports into `$GITHUB_STEP_SUMMARY`, so every run records what
  it actually tested against instead of what it meant to.
- **A later option, recorded and not built:** a nightly, non-gating job that runs
  the contract suite against the live API would turn image-versus-live drift into
  a signal rather than a surprise. It is an option here, nothing more.

## Consequences

- **No module source, test or page-object change.** The entire fix is CI
  definitions, one environment descriptor and documentation.
- **Local runs are unchanged** and `shared/environments/local.json` is untouched.
  Docker is not required to run a suite locally.
- **The two module jobs run in parallel again**, and the python job joins them,
  each with its own stack.
- **A new failure mode replaces the old one.** The suites can now fail because
  the stack did not come up, not only because a test broke. Every readiness poll
  is bounded by a deadline and dumps the relevant container logs before failing,
  and the stop action writes `docker compose logs` plus `ps` into the failure
  artifacts, so the diagnosis is in the artifact rather than in a re-run.
- **~484 MiB of images are pulled per job.** That is the cost of the decision,
  paid against a gate that no longer serialises two suites.
- **The module READMEs' "CI uses 30000" rows are corrected** alongside this ADR.
- **The number `0007` is now taken**, so the redaction ADR that
  `python/README.md` reserves as `0007-redaction-field-list-excludes-email-and-phone.md`
  becomes **`0008`**. That README row is not edited here; the renumbering happens
  when the ADR is written.
