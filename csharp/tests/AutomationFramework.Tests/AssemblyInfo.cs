using NUnit.Framework;

// Parallel execution is on from the first test, not retrofitted later.
//
// Retrofitting is the trap: by the time anyone tries, the suite has quietly grown
// dependencies on shared state, and enabling this turns a green suite red for
// reasons that look like product bugs.
[assembly: Parallelizable(ParallelScope.All)]

// Two workers, fixed rather than derived from processor count.
//
// Each concurrent UI test holds a browser context, and each auth test registers an
// account over the API first. More workers than the machine can feed produces
// timeouts everywhere at once, which reads exactly like a product failure.
//
// Two rather than four is a deliberate concession to the target, not a machine
// limit. This template runs against a free public sandbox, and at four workers the
// suite drew ERR_CONNECTION_RESET, SSL handshake failures and navigation timeouts
// from the far end — environment failures caused by the suite's own load. Against a
// service you own, raise this and measure.
[assembly: LevelOfParallelism(2)]

// A fresh fixture instance per test case. This line is not optional, and leaving
// it out cost hours.
//
// By default NUnit creates ONE instance of a fixture and runs every test method
// on it. Combined with ParallelScope.All that means concurrent tests share the
// fixture's instance fields — so UiTestBase's _page and _context were being
// overwritten and then nulled by whichever sibling test finished first. It
// presented as TargetClosedException, net::ERR_ABORTED, and a null Page, none of
// which look like a lifecycle problem.
//
// It is the same defect the house rules warn about under "static mutable state in
// fixtures". A shared instance makes instance fields just as shared.
//
// The Java module configures the equivalent with
// junit.jupiter.testinstance.lifecycle.default = per_method. This is that line.
[assembly: FixtureLifeCycle(LifeCycle.InstancePerTestCase)]
