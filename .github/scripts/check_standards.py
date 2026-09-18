#!/usr/bin/env python3
"""Gate the shared foundation: steering frontmatter, contract schemas, and secrets.

This runs on every branch, including `main` where no language module exists. It is the
only job that has something to check there, and it guards the files every module
depends on.

Deliberately stdlib only. A gate that needs its own dependency tree installed is a
gate that eventually breaks for reasons unrelated to what it checks.

Usage:
    python3 check_standards.py <repo-root>

Exit code 1 on any failure, so it can gate a build.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

VALID_INCLUSION_MODES = ("always", "fileMatch", "manual", "auto")

SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9-]{1,64}$")

# Shapes that mean a real credential has been committed. Deliberately narrow: a scan
# that cries wolf gets switched off, and then it catches nothing.
SECRET_PATTERNS = (
    ("GitHub personal access token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}")),
    ("GitHub fine-grained token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}")),
    ("Atlassian API token", re.compile(r"\bATATT[A-Za-z0-9_\-=]{30,}")),
    ("AWS access key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
)

SCANNED_SUFFIXES = (
    ".md",
    ".json",
    ".yml",
    ".yaml",
    ".xml",
    ".props",
    ".java",
    ".cs",
    ".py",
    ".ts",
    ".ps1",
    ".sh",
    ".example",
    ".editorconfig",
    ".gitignore",
    ".gitattributes",
    ".sln",
    ".csproj",
    ".toml",
)

SKIPPED_DIRECTORIES = (
    ".git",
    "node_modules",
    "target",
    "bin",
    "obj",
    "TestResults",
    "allure-results",
    ".venv",
    ".playwright",
    ".playwright-mcp",
)


class Report:
    """Collects failures so every problem is reported, not just the first."""

    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks_run = 0

    def check(self, description: str, ok: bool, detail: str = "") -> None:
        self.checks_run += 1
        if ok:
            print(f"  ok   {description}")
            return
        message = description if detail == "" else f"{description}: {detail}"
        print(f"  FAIL {message}")
        self.failures.append(message)


def read_frontmatter(path: Path) -> dict[str, str] | None:
    """Returns the frontmatter as key/value pairs, or None when there is none.

    A deliberately small parser rather than a YAML dependency. Steering frontmatter is
    flat key/value only, so anything more would be pretending to validate more than it
    does.
    """
    lines = path.read_text(encoding="utf-8").splitlines()

    if len(lines) == 0 or lines[0].strip() != "---":
        return None

    values: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            return values
        separator = line.find(":")
        if separator <= 0:
            continue
        key = line[:separator].strip()
        values[key] = line[separator + 1 :].strip()

    return None


def check_steering(root: Path, report: Report) -> None:
    print("Steering files")
    directory = root / ".kiro" / "steering"

    if not directory.is_dir():
        report.check("steering directory exists", False, str(directory))
        return

    files = sorted(directory.glob("*.md"))
    report.check("at least one steering file", len(files) > 0)

    for path in files:
        name = path.name
        frontmatter = read_frontmatter(path)

        if frontmatter is None:
            report.check(f"{name} has closed frontmatter as its first content", False)
            continue

        mode = frontmatter.get("inclusion", "")
        report.check(
            f"{name} inclusion mode is valid",
            mode in VALID_INCLUSION_MODES,
            f"got '{mode}', expected one of {VALID_INCLUSION_MODES}",
        )

        if mode == "auto":
            has_name = frontmatter.get("name", "") != ""
            has_description = frontmatter.get("description", "") != ""
            report.check(
                f"{name} inclusion:auto carries name and description",
                has_name and has_description,
            )

        if mode == "fileMatch":
            report.check(
                f"{name} inclusion:fileMatch carries fileMatchPattern",
                frontmatter.get("fileMatchPattern", "") != "",
            )


def check_skills(root: Path, report: Report) -> None:
    print("Skills")
    directory = root / ".kiro" / "skills"

    if not directory.is_dir():
        report.check("skills directory exists", False, str(directory))
        return

    for skill_directory in sorted(p for p in directory.iterdir() if p.is_dir()):
        folder = skill_directory.name
        skill_file = skill_directory / "SKILL.md"

        if not skill_file.is_file():
            report.check(f"{folder}/SKILL.md exists", False)
            continue

        frontmatter = read_frontmatter(skill_file)
        if frontmatter is None:
            report.check(f"{folder} has closed frontmatter", False)
            continue

        declared = frontmatter.get("name", "")
        report.check(f"{folder} name matches its folder", declared == folder, f"got '{declared}'")
        report.check(
            f"{folder} name is lowercase-hyphen and within 64 chars",
            SKILL_NAME_PATTERN.match(declared) is not None,
        )

        description = frontmatter.get("description", "")
        report.check(
            f"{folder} description is present and within 1024 chars",
            0 < len(description) <= 1024,
            f"length {len(description)}",
        )


def load_json(path: Path) -> object:
    """Reads JSON, tolerating a UTF-8 BOM.

    Windows editors and PowerShell's default `Set-Content` both write a BOM, and a gate
    that rejects a schema for that reason blocks a contributor over something invisible.
    `utf-8-sig` reads files with or without one.
    """
    return json.loads(path.read_text(encoding="utf-8-sig"))


def check_contracts(root: Path, report: Report) -> None:
    print("Contracts")
    directory = root / "shared" / "contracts"

    if not directory.is_dir():
        report.check("contracts directory exists", False, str(directory))
        return

    schemas = sorted(directory.glob("*.schema.json"))
    report.check("at least one contract schema", len(schemas) > 0)

    for path in schemas:
        try:
            parsed = load_json(path)
        except json.JSONDecodeError as error:
            report.check(f"{path.name} is valid JSON", False, str(error))
            continue

        report.check(f"{path.name} is valid JSON", True)

        # additionalProperties:false is the whole point of these schemas. Without it a
        # field the service quietly adds passes unnoticed, which is the drift the
        # contract tests exist to catch.
        report.check(
            f"{path.name} forbids additional properties at the root",
            parsed.get("additionalProperties") is False,
        )


def check_environments(root: Path, report: Report) -> None:
    print("Environments")
    directory = root / "shared" / "environments"

    if not directory.is_dir():
        report.check("environments directory exists", False, str(directory))
        return

    for path in sorted(directory.glob("*.json")):
        try:
            parsed = load_json(path)
        except json.JSONDecodeError as error:
            report.check(f"{path.name} is valid JSON", False, str(error))
            continue

        report.check(f"{path.name} is valid JSON", True)

        offending = credential_keys_in(parsed)
        report.check(
            f"{path.name} holds no credential keys",
            len(offending) == 0,
            f"found {offending}; environment descriptors are non-secret by contract",
        )


CREDENTIAL_KEY_NAMES = (
    "password",
    "passwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "clientsecret",
    "client_secret",
    "credential",
    "credentials",
)


def credential_keys_in(node: object, found: list[str] | None = None) -> list[str]:
    """Returns any credential-shaped **key names** anywhere in the structure.

    Keys only, never values. The first version of this check searched the flattened
    JSON text and failed on the word "secret" inside a description that said
    "Non-secret values only" â€” a false positive from the gate's own carelessness. A
    gate that cries wolf gets switched off, and then it catches nothing.
    """
    if found is None:
        found = []

    if isinstance(node, dict):
        for key, value in node.items():
            lowered = key.lower()
            for banned in CREDENTIAL_KEY_NAMES:
                if banned in lowered:
                    found.append(key)
                    break
            credential_keys_in(value, found)
        return found

    if isinstance(node, list):
        for item in node:
            credential_keys_in(item, found)

    return found


def files_to_scan(root: Path) -> list[Path]:
    found: list[Path] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        skip = False
        for part in path.parts:
            if part in SKIPPED_DIRECTORIES:
                skip = True
                break
        if skip:
            continue

        if path.suffix in SCANNED_SUFFIXES or path.name in (".env.example", ".gitignore"):
            found.append(path)

    return found


def check_secrets(root: Path, report: Report) -> None:
    print("Secret scan")
    hits: list[str] = []

    for path in files_to_scan(root):
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for label, pattern in SECRET_PATTERNS:
            match = pattern.search(content)
            if match is None:
                continue
            relative = path.relative_to(root)
            hits.append(f"{label} in {relative}")

    report.check("no committed credentials", len(hits) == 0, "; ".join(hits))


def check_env_example(root: Path, report: Report) -> None:
    print("Environment example")
    path = root / ".env.example"

    if not path.is_file():
        report.check(".env.example exists", False)
        return

    report.check(".env.example exists", True)

    content = path.read_text(encoding="utf-8")
    report.check(
        ".env.example documents the environment selector",
        "AF_ENV" in content,
    )

    gitignore = root / ".gitignore"
    if gitignore.is_file():
        ignored = gitignore.read_text(encoding="utf-8")
        report.check(".gitignore excludes .env", "\n.env\n" in "\n" + ignored)
        report.check(".gitignore keeps .env.example", "!.env.example" in ignored)


def main(argv: list[str]) -> int:
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    print(f"Checking the shared foundation in {root}\n")

    report = Report()
    check_steering(root, report)
    check_skills(root, report)
    check_contracts(root, report)
    check_environments(root, report)
    check_env_example(root, report)
    check_secrets(root, report)

    print(f"\n{report.checks_run} checks run, {len(report.failures)} failed.")

    if len(report.failures) > 0:
        print("\nFailures:")
        for failure in report.failures:
            print(f"  - {failure}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
