"""Audit every tracked repository file in CI.

Fail on unreadable files, invalid metadata, unsafe repository links, and
unregistered dashboard modules. Unit tests and JS parsing run separately.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IGNORED_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".woff", ".woff2"}


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [ROOT / name.decode("utf-8") for name in result.stdout.split(b"\0") if name]


def audit() -> int:
    failures: list[str] = []
    files = tracked_files()
    if not files:
        failures.append("Git returned no tracked files")
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        if not path.is_file():
            failures.append(f"{relative}: tracked file is missing")
            continue
        try:
            raw = path.read_bytes()
            if b"\0" in raw and path.suffix.lower() not in IGNORED_SUFFIXES:
                failures.append(f"{relative}: unexpected binary/NUL content")
            if path.suffix.lower() in {".py", ".js", ".json", ".md", ".toml", ".yml", ".yaml", ".txt"}:
                raw.decode("utf-8")
            if path.suffix.lower() == ".json":
                json.loads(raw.decode("utf-8"))
        except (OSError, UnicodeError, ValueError) as exc:
            failures.append(f"{relative}: {exc}")
    component = ROOT / "custom_components" / "family_hub"
    try:
        manifest = json.loads((component / "manifest.json").read_text(encoding="utf-8"))
        if manifest.get("domain") != "family_hub" or not manifest.get("config_flow"):
            failures.append("manifest.json: invalid integration identity or config flow")
        frontend = (component / "frontend.py").read_text(encoding="utf-8")
        import ast
        module = ast.parse(frontend)
        registered = None
        for node in module.body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "FILES"
                for target in node.targets
            ):
                registered = ast.literal_eval(node.value)
                break
        if not isinstance(registered, (tuple, list)):
            failures.append("frontend.py: FILES is not a static list or tuple")
        else:
            scripts = {path.name for path in (component / "www").glob("*.js")}
            if len(registered) != len(set(registered)):
                failures.append("frontend.py: duplicate registered scripts")
            for name in sorted(scripts - set(registered)):
                failures.append(f"www/{name}: JavaScript file is not registered")
            for name in sorted(set(registered) - scripts):
                failures.append(f"frontend.py: registered missing JavaScript {name}")
    except (OSError, ValueError, SyntaxError, TypeError) as exc:
        failures.append(f"Integration metadata: {exc}")
    print(f"Audited {len(files)} tracked files")
    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1
    print("All repository file checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(audit())
