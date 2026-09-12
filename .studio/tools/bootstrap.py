from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from contextlib import redirect_stdout
from email.parser import BytesParser
from io import StringIO
from pathlib import Path
from typing import Any


def _result(code: str, summary: str, *, next_action: str | None = None) -> int:
    payload = {"code": code, "summary": summary}
    if next_action is not None:
        payload["next_action"] = next_action
    print(json.dumps(payload, indent=2, sort_keys=True))
    return {
        "ok": 0,
        "invalid_input": 2,
        "policy_denied": 4,
        "state_corrupt": 5,
    }[code]


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _manifest(root: Path) -> dict[str, Any]:
    path = root / ".studio/tools/tool-manifest.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("tool manifest must be a JSON object")
    return payload


def _uv_version(executable: str) -> tuple[int, ...]:
    output = subprocess.run(
        [executable, "--version"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", output)
    if match is None:
        raise ValueError("uv version could not be determined")
    return tuple(int(part) for part in match.groups())


def _locked_runtime_packages(lock: Path) -> dict[str, str]:
    indexed: dict[str, dict[str, Any]] = {}
    for block in lock.read_text(encoding="utf-8").split("[[package]]")[1:]:
        name_match = re.search(r'^name = "([^"]+)"$', block, re.MULTILINE)
        version_match = re.search(r'^version = "([^"]+)"$', block, re.MULTILINE)
        if name_match is None or version_match is None:
            raise ValueError("runtime lock contains an invalid package")
        dependency_section = re.search(
            r"^dependencies = \[\n(?P<body>.*?)^\]$",
            block,
            re.MULTILINE | re.DOTALL,
        )
        dependencies = (
            re.findall(r'{ name = "([^"]+)"', dependency_section.group("body"))
            if dependency_section is not None
            else []
        )
        indexed[name_match.group(1)] = {
            "version": version_match.group(1),
            "dependencies": dependencies,
        }
    root_name = "agentic-development-studio"
    if root_name not in indexed:
        raise ValueError("runtime lock does not contain the Studio package")
    pending = [root_name]
    selected: dict[str, str] = {}
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        package = indexed.get(name)
        version = None if package is None else package.get("version")
        if package is None or not isinstance(version, str):
            raise ValueError(f"runtime lock is missing a version for {name}")
        selected[name] = version
        dependencies = package.get("dependencies", [])
        if not isinstance(dependencies, list) or not all(
            isinstance(dependency, str) for dependency in dependencies
        ):
            raise ValueError(f"runtime lock dependencies are invalid for {name}")
        pending.extend(dependencies)
    return dict(sorted(selected.items()))


def _locked_runtime_artifact_hashes(lock: Path) -> dict[str, list[str]]:
    selected = _locked_runtime_packages(lock)
    blocks: dict[str, str] = {}
    for block in lock.read_text(encoding="utf-8").split("[[package]]")[1:]:
        name_match = re.search(r'^name = "([^"]+)"$', block, re.MULTILINE)
        if name_match is not None:
            blocks[name_match.group(1)] = block
    artifact_hashes: dict[str, list[str]] = {}
    for name in selected:
        if name == "agentic-development-studio":
            continue
        hashes = sorted(set(re.findall(r'hash = "(sha256:[0-9a-f]{64})"', blocks[name])))
        if not hashes:
            raise ValueError(f"runtime lock contains no artifact hashes for {name}")
        artifact_hashes[name] = hashes
    return dict(sorted(artifact_hashes.items()))


def _installed_versions(python: Path) -> dict[str, str]:
    script = (
        "import importlib.metadata,json;"
        "normalize=lambda name:name.lower().replace('_','-');"
        "versions={normalize(d.metadata['Name']):d.version "
        "for d in importlib.metadata.distributions()};"
        "print(json.dumps(versions,sort_keys=True))"
    )
    completed = subprocess.run(
        [str(python), "-c", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise ValueError("installed runtime package metadata could not be read")
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict) or not all(
        isinstance(name, str) and isinstance(version, str) for name, version in payload.items()
    ):
        raise ValueError("installed runtime package metadata is invalid")
    return dict(payload)


def _installed_content(
    python: Path, expected_packages: dict[str, str]
) -> dict[str, dict[str, str]]:
    script = """
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

normalize = lambda name: name.lower().replace("_", "-")
expected = set(json.loads(sys.argv[1]))
prefix = Path(sys.prefix).resolve()
content = {}
for distribution in importlib.metadata.distributions():
    name = normalize(distribution.metadata["Name"])
    if name not in expected:
        continue
    files = {}
    for entry in distribution.files or ():
        path = Path(distribution.locate_file(entry))
        if not path.is_file() or path.suffix == ".pyc" or "__pycache__" in path.parts:
            continue
        relative = path.resolve().relative_to(prefix).as_posix()
        files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    content[name] = dict(sorted(files.items()))
if set(content) != expected or any(not files for files in content.values()):
    raise SystemExit("installed package content is incomplete")
print(json.dumps(dict(sorted(content.items())), sort_keys=True))
"""
    completed = subprocess.run(
        [str(python), "-c", script, json.dumps(sorted(expected_packages))],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise ValueError("installed runtime package content could not be hashed")
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError("installed runtime package content manifest is invalid")
    return payload


def verify_runtime(project_root: Path) -> tuple[bool, str]:
    root = project_root.resolve(strict=True)
    runtime = root / ".studio/runtime"
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    stamp_path = runtime / "studio-runtime.json"
    if not python.is_file() or not stamp_path.is_file():
        return False, "Project-local runtime or its provenance record is missing."
    try:
        manifest = _manifest(root)
        tools = root / ".studio/tools"
        wheel = tools / str(manifest["wheel"]["file"])
        lock = tools / str(manifest["lock"]["file"])
        wheel_digest = _digest(wheel)
        lock_digest = _digest(lock)
        if wheel_digest != manifest["wheel"]["sha256"]:
            raise ValueError("runtime wheel differs from the tool manifest")
        if lock_digest != manifest["lock"]["sha256"]:
            raise ValueError("runtime lock differs from the tool manifest")
        expected = _locked_runtime_packages(lock)
        artifact_hashes = _locked_runtime_artifact_hashes(lock)
        stamp = json.loads(stamp_path.read_text(encoding="utf-8"))
        if not isinstance(stamp, dict):
            raise ValueError("runtime provenance record must be an object")
        if stamp.get("wheel_sha256") != wheel_digest:
            raise ValueError("runtime wheel provenance differs from the verified bundle")
        if stamp.get("lock_sha256") != lock_digest:
            raise ValueError("runtime lock provenance differs from the verified bundle")
        if stamp.get("packages") != expected:
            raise ValueError("runtime package provenance differs from the exact lock closure")
        if stamp.get("artifact_hashes") != artifact_hashes:
            raise ValueError("runtime artifact provenance differs from the exact lock")
        if _installed_versions(python) != expected:
            raise ValueError("installed runtime packages differ from the exact lock closure")
        if stamp.get("installed_content") != _installed_content(python, expected):
            raise ValueError("installed runtime content differs from its bootstrap manifest")
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        return False, str(error)[:300]
    return True, "Project-local runtime matches its verified wheel and exact lock closure."


def bootstrap(project_root: Path) -> int:
    root = project_root.resolve(strict=True)
    try:
        manifest = _manifest(root)
        tools = root / ".studio/tools"
        wheel = tools / str(manifest["wheel"]["file"])
        lock = tools / str(manifest["lock"]["file"])
        if _digest(wheel) != manifest["wheel"]["sha256"]:
            return _result(
                "state_corrupt",
                "Pinned Studio wheel digest does not match tool-manifest.json.",
            )
        if _digest(lock) != manifest["lock"]["sha256"]:
            return _result(
                "state_corrupt",
                "Pinned Studio lock digest does not match tool-manifest.json.",
            )
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        return _result("invalid_input", f"Bootstrap metadata is invalid: {str(error)[:300]}")

    uv = shutil.which("uv")
    if uv is None:
        return _result(
            "policy_denied",
            "A compatible existing uv executable is required; Studio will not download it.",
            next_action="Install an approved uv release and rerun ./studioctl bootstrap.",
        )
    try:
        if _uv_version(uv) < (0, 12, 0):
            return _result(
                "policy_denied",
                "The available uv release is incompatible with this Studio bundle.",
                next_action="Install uv 0.12 or newer through the approved system path.",
            )
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        return _result("invalid_input", f"Unable to verify uv: {str(error)[:300]}")

    runtime = root / ".studio/runtime"
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if python.is_file():
        valid, reason = verify_runtime(root)
        if not valid:
            return _result("state_corrupt", f"Existing Studio runtime is invalid: {reason}")
        return _result("ok", "Project-local Studio runtime is already bootstrapped and verified.")

    staging = root / ".studio" / f".runtime-staging-{os.getpid()}"
    if staging.exists():
        shutil.rmtree(staging)
    environment = dict(os.environ)
    environment["UV_PYTHON_DOWNLOADS"] = "never"
    try:
        created = subprocess.run(
            [uv, "venv", "--python", "3.12", "--no-python-downloads", str(staging)],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        if created.returncode != 0:
            return _result(
                "policy_denied",
                "A compatible local Python 3.12 interpreter is required.",
                next_action="Install Python 3.12 locally; bootstrap will not download it.",
            )
        staging_python = staging / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        locked_packages = _locked_runtime_packages(lock)
        artifact_hashes = _locked_runtime_artifact_hashes(lock)
        requirements = staging / "locked-requirements.txt"
        requirements.write_text(
            "".join(
                f"{name}=={locked_packages[name]} "
                + " ".join(f"--hash={digest}" for digest in hashes)
                + "\n"
                for name, hashes in artifact_hashes.items()
            ),
            encoding="utf-8",
        )
        dependencies_installed = subprocess.run(
            [
                uv,
                "pip",
                "install",
                "--python",
                str(staging_python),
                "--offline",
                "--no-deps",
                "--require-hashes",
                "--requirements",
                str(requirements),
            ],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        if dependencies_installed.returncode != 0:
            return _result(
                "policy_denied",
                "Locked runtime dependencies are not fully cached; network access is required.",
                next_action=(
                    "Approve dependency retrieval, populate the uv cache, and rerun bootstrap."
                ),
            )
        requirements.unlink()
        studio_installed = subprocess.run(
            [
                uv,
                "pip",
                "install",
                "--python",
                str(staging_python),
                "--offline",
                "--no-deps",
                str(wheel),
            ],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        if studio_installed.returncode != 0:
            return _result("state_corrupt", "Verified Studio wheel could not be installed.")
        installed_versions = _installed_versions(staging_python)
        if installed_versions != locked_packages:
            return _result(
                "state_corrupt",
                "Installed runtime packages differ from the exact lock closure.",
            )
        installed_content = _installed_content(staging_python, locked_packages)
        (staging / "studio-runtime.json").write_text(
            json.dumps(
                {
                    "schema_version": "1.0.0",
                    "wheel_sha256": _digest(wheel),
                    "lock_sha256": _digest(lock),
                    "packages": locked_packages,
                    "artifact_hashes": artifact_hashes,
                    "installed_content": installed_content,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        os.replace(staging, runtime)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    return _result("ok", "Project-local Studio runtime bootstrapped from verified pinned assets.")


def _distribution_bundle(
    wheel: Path,
    expected_sha256: str,
) -> tuple[bytes, bytes, bytes, str]:
    if not re.fullmatch(r"[0-9a-f]{64}", expected_sha256):
        raise ValueError("expected distribution digest must be lowercase SHA-256")
    resolved = wheel.resolve(strict=True)
    if not resolved.is_file() or resolved.suffix != ".whl":
        raise ValueError("distribution wheel must be an existing wheel file")
    wheel_bytes = resolved.read_bytes()
    if hashlib.sha256(wheel_bytes).hexdigest() != expected_sha256:
        raise ValueError("distribution wheel digest does not match expected SHA-256")
    lock_member = "agentic_studio/_assets/locks/codex.uv.lock"
    bootstrap_member = "agentic_studio/bootstrap.py"
    try:
        with zipfile.ZipFile(resolved) as archive:
            names = archive.namelist()
            if names.count(lock_member) != 1 or names.count(bootstrap_member) != 1:
                raise ValueError("distribution wheel lacks unique Studio runtime assets")
            metadata_members = [
                name
                for name in names
                if name.endswith(".dist-info/METADATA") and Path(name).name == "METADATA"
            ]
            if len(metadata_members) != 1:
                raise ValueError("distribution wheel metadata is ambiguous")
            metadata = BytesParser().parsebytes(archive.read(metadata_members[0]))
            if metadata.get("Name") != "agentic-development-studio":
                raise ValueError("distribution wheel is not Agentic Development Studio")
            version = metadata.get("Version")
            if not version:
                raise ValueError("distribution wheel version is missing")
            return (
                wheel_bytes,
                archive.read(lock_member),
                archive.read(bootstrap_member),
                version,
            )
    except zipfile.BadZipFile as error:
        raise ValueError("distribution wheel is not a valid wheel archive") from error


def _stage_distribution_tools(
    staging_root: Path,
    distribution_wheel: Path,
    expected_sha256: str,
) -> None:
    wheel_bytes, lock_bytes, bootstrap_bytes, studio_version = _distribution_bundle(
        distribution_wheel,
        expected_sha256,
    )
    tools = staging_root / ".studio/tools"
    tools.mkdir(parents=True)
    wheel_name = distribution_wheel.name
    lock_name = "studio-codex.uv.lock"
    (tools / wheel_name).write_bytes(wheel_bytes)
    (tools / lock_name).write_bytes(lock_bytes)
    (tools / "bootstrap.py").write_bytes(bootstrap_bytes)
    manifest = {
        "schema_version": "1.0.0",
        "studio_version": studio_version,
        "python": "==3.12.*",
        "uv_minimum": "0.12.0",
        "wheel": {"file": wheel_name, "sha256": expected_sha256},
        "lock": {
            "file": lock_name,
            "sha256": hashlib.sha256(lock_bytes).hexdigest(),
        },
    }
    (tools / "tool-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _remove_owned_tree(path: Path) -> None:
    if path.is_symlink():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def upgrade(project_root: Path, distribution_wheel: Path, expected_sha256: str) -> int:
    try:
        root = project_root.resolve(strict=True)
    except OSError as error:
        return _result("invalid_input", f"Project root is invalid: {str(error)[:300]}")
    studio = root / ".studio"
    tools = studio / "tools"
    runtime = studio / "runtime"
    if not tools.is_dir() or tools.is_symlink() or not runtime.is_dir() or runtime.is_symlink():
        return _result(
            "invalid_input",
            "Project must have regular Studio tools and a bootstrapped runtime before upgrade.",
        )
    valid, reason = verify_runtime(root)
    if not valid:
        return _result(
            "state_corrupt",
            f"Existing Studio runtime must be valid before upgrade: {reason}",
        )

    staging_root = studio / f".upgrade-staging-{os.getpid()}"
    backup_root = studio / f".upgrade-backup-{os.getpid()}"
    if staging_root.exists() or staging_root.is_symlink() or backup_root.exists():
        return _result("state_corrupt", "A colliding Studio upgrade workspace already exists.")
    try:
        staging_root.mkdir()
        _stage_distribution_tools(staging_root, distribution_wheel, expected_sha256)
        staged_output = StringIO()
        with redirect_stdout(staged_output):
            staged_code = bootstrap(staging_root)
        if staged_code != 0:
            try:
                staged_result = json.loads(staged_output.getvalue())
                code = str(staged_result["code"])
                summary = str(staged_result["summary"])
                next_action = staged_result.get("next_action")
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                code = "state_corrupt"
                summary = "Replacement runtime could not be staged."
                next_action = None
            if code not in {"invalid_input", "policy_denied", "state_corrupt"}:
                code = "state_corrupt"
            _remove_owned_tree(staging_root)
            return _result(
                code,
                f"Studio upgrade staging failed: {summary}",
                next_action=str(next_action) if next_action is not None else None,
            )
        staged_tools = staging_root / ".studio/tools"
        staged_runtime = staging_root / ".studio/runtime"
        staged_valid, staged_reason = verify_runtime(staging_root)
        if not staged_valid:
            _remove_owned_tree(staging_root)
            return _result(
                "state_corrupt",
                f"Replacement Studio runtime failed provenance verification: {staged_reason}",
            )
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        _remove_owned_tree(staging_root)
        return _result("invalid_input", f"Studio upgrade bundle is invalid: {str(error)[:300]}")

    backup_tools = backup_root / "tools"
    backup_runtime = backup_root / "runtime"
    old_tools_moved = False
    new_tools_moved = False
    old_runtime_moved = False
    new_runtime_moved = False
    try:
        backup_root.mkdir()
        os.replace(tools, backup_tools)
        old_tools_moved = True
        os.replace(staged_tools, tools)
        new_tools_moved = True
        os.replace(runtime, backup_runtime)
        old_runtime_moved = True
        os.replace(staged_runtime, runtime)
        new_runtime_moved = True
        upgraded_valid, upgraded_reason = verify_runtime(root)
        if not upgraded_valid:
            raise ValueError(upgraded_reason)
    except (OSError, UnicodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        restoration_errors: list[str] = []
        try:
            if new_runtime_moved:
                _remove_owned_tree(runtime)
            if old_runtime_moved:
                os.replace(backup_runtime, runtime)
        except OSError as restore_error:
            restoration_errors.append(str(restore_error))
        try:
            if new_tools_moved:
                _remove_owned_tree(tools)
            if old_tools_moved:
                os.replace(backup_tools, tools)
        except OSError as restore_error:
            restoration_errors.append(str(restore_error))
        if restoration_errors:
            return _result(
                "state_corrupt",
                "Studio upgrade failed and automatic restoration was incomplete; "
                "preserved upgrade backups require operator recovery.",
            )
        shutil.rmtree(backup_root, ignore_errors=True)
        return _result(
            "state_corrupt",
            f"Studio upgrade failed; old tools and runtime were restored: {str(error)[:300]}",
        )
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)

    shutil.rmtree(backup_root, ignore_errors=True)
    return _result(
        "ok",
        "Studio tools and runtime upgraded from the verified distribution bundle.",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="studio-bootstrap")
    parser.add_argument("--project-root", type=Path, required=True)
    arguments = parser.parse_args(argv)
    return bootstrap(arguments.project_root)


def upgrade_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="studio-upgrade")
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--distribution-wheel", type=Path, required=True)
    parser.add_argument("--expected-sha256", required=True)
    arguments = parser.parse_args(argv)
    return upgrade(
        arguments.project_root,
        arguments.distribution_wheel,
        arguments.expected_sha256,
    )


if __name__ == "__main__":
    sys.exit(main())
