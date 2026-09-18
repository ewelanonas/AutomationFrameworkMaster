#!/usr/bin/env python3
"""Turn JUnit XML into a readable run summary.

Why this exists rather than a third-party action: a summary is the difference between
a red check somebody investigates and a red check somebody ignores. Doing it here
keeps the pipeline free of an extra dependency, needs no write permission on the
repository, and — the part that matters most — can be run and verified locally
against the real XML the suites produce.

Reads Surefire output (Java) and JunitXml.TestLogger output (.NET), both of which
are JUnit XML with minor structural differences.

Usage:
    python3 junit_summary.py <label> <path> [<path> ...]

Paths may be files or directories; directories are searched recursively for *.xml.
Writes markdown to stdout and appends it to $GITHUB_STEP_SUMMARY when that is set.

Always exits 0. This reports on a run; it does not gate one. The test step's own
exit code is what fails the build, and a summariser that can fail the build for its
own reasons is a summariser that gets removed.
"""

from __future__ import annotations

import os
import sys
import xml.etree.ElementTree as ElementTree
from pathlib import Path

MAX_FAILURES_LISTED = 25
MAX_MESSAGE_CHARS = 300


class Totals:
    """Counts across every suite in a module."""

    def __init__(self) -> None:
        self.tests = 0
        self.failures = 0
        self.errors = 0
        self.skipped = 0
        self.seconds = 0.0

    @property
    def passed(self) -> int:
        return self.tests - self.failures - self.errors - self.skipped

    @property
    def is_green(self) -> bool:
        return self.failures == 0 and self.errors == 0


class Failure:
    """One failed or errored test, as a reader needs to see it."""

    def __init__(self, classname: str, name: str, kind: str, message: str) -> None:
        self.classname = classname
        self.name = name
        self.kind = kind
        self.message = message


def find_xml_files(paths: list[str]) -> list[Path]:
    """Expands the given files and directories into a sorted list of XML files."""
    found: list[Path] = []

    for raw in paths:
        candidate = Path(raw)
        if candidate.is_file():
            found.append(candidate)
            continue
        if candidate.is_dir():
            for nested in sorted(candidate.rglob("*.xml")):
                found.append(nested)

    return found


def suites_in(root: ElementTree.Element) -> list[ElementTree.Element]:
    """Returns the testsuite elements, whether the file wraps them in testsuites or not."""
    if root.tag == "testsuite":
        return [root]

    suites: list[ElementTree.Element] = []
    for suite in root.iter("testsuite"):
        suites.append(suite)
    return suites


def as_int(value: str | None) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(value)
    except ValueError:
        return 0


def as_float(value: str | None) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def shorten(text: str) -> str:
    """Collapses a message to one readable line."""
    flattened = " ".join(text.split())
    if len(flattened) <= MAX_MESSAGE_CHARS:
        return flattened
    return flattened[:MAX_MESSAGE_CHARS] + " ..."


def collect(files: list[Path]) -> tuple[Totals, list[Failure], list[str]]:
    """Reads every file, returning the totals, the failures, and any parse problems."""
    totals = Totals()
    failures: list[Failure] = []
    problems: list[str] = []

    for path in files:
        try:
            root = ElementTree.parse(path).getroot()
        except ElementTree.ParseError as error:
            # A malformed report is worth surfacing rather than silently skipping: it
            # usually means the run was killed part-way through.
            problems.append(f"{path}: {error}")
            continue

        for suite in suites_in(root):
            totals.tests += as_int(suite.get("tests"))
            totals.failures += as_int(suite.get("failures"))
            totals.errors += as_int(suite.get("errors"))
            totals.skipped += as_int(suite.get("skipped"))
            totals.seconds += as_float(suite.get("time"))

            for case in suite.iter("testcase"):
                collect_case_failure(case, failures)

    return totals, failures, problems


def collect_case_failure(case: ElementTree.Element, failures: list[Failure]) -> None:
    """Appends this test case to the failure list if it failed or errored."""
    classname = case.get("classname") or ""
    name = case.get("name") or "(unnamed)"

    for kind in ("failure", "error"):
        element = case.find(kind)
        if element is None:
            continue

        message = element.get("message") or ""
        if message == "":
            message = element.text or "(no message)"

        failures.append(Failure(classname, name, kind, shorten(message)))
        return


def render(label: str, totals: Totals, failures: list[Failure], problems: list[str]) -> str:
    """Builds the markdown summary."""
    lines: list[str] = []

    status = "PASSED" if totals.is_green else "FAILED"
    icon = "&#9989;" if totals.is_green else "&#10060;"

    # ASCII separator rather than an em dash: this string is written to a file the
    # runner renders, and there is no upside to depending on its encoding.
    lines.append(f"## {icon} {label} - {status}")
    lines.append("")
    lines.append("| Total | Passed | Failed | Errors | Skipped | Duration |")
    lines.append("| ----: | -----: | -----: | -----: | ------: | -------: |")
    lines.append(
        f"| {totals.tests} | {totals.passed} | {totals.failures} "
        f"| {totals.errors} | {totals.skipped} | {totals.seconds:.1f}s |"
    )
    lines.append("")

    if totals.tests == 0:
        lines.append("> No test results were found. The run produced no JUnit XML, which")
        lines.append("> usually means the suite never started.")
        lines.append("")

    if totals.skipped > 0:
        lines.append(
            f"> {totals.skipped} test(s) were skipped. In CI a skip is a pipeline "
            "configuration problem, not a neutral outcome. Check why."
        )
        lines.append("")

    if len(failures) > 0:
        lines.append("### Failures")
        lines.append("")

        shown = 0
        for failure in failures:
            if shown >= MAX_FAILURES_LISTED:
                remaining = len(failures) - shown
                lines.append(f"- ... and {remaining} more. See the uploaded artifacts.")
                break

            short_class = failure.classname.split(".")[-1]
            lines.append(f"- **{short_class}.{failure.name}** ({failure.kind})")
            lines.append(f"  - {failure.message}")
            shown += 1

        lines.append("")
        lines.append(
            "Traces, screenshots and page HTML for UI failures are in the run "
            "artifacts. Open a trace with `npx playwright show-trace <file>`."
        )
        lines.append("")

    if len(problems) > 0:
        lines.append("### Reports that could not be parsed")
        lines.append("")
        for problem in problems:
            lines.append(f"- {problem}")
        lines.append("")

    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        print(__doc__)
        return 0

    label = argv[1]
    files = find_xml_files(argv[2:])
    totals, failures, problems = collect(files)
    markdown = render(label, totals, failures, problems)

    print(markdown)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(markdown)
            handle.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
