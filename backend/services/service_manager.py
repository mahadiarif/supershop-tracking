import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Tuple


class ServiceManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._processes: Dict[str, subprocess.Popen] = {}
        self._project_root = Path(__file__).resolve().parents[2]
        self._log_dir = self._project_root / "service_logs"
        self._log_dir.mkdir(exist_ok=True)
        self._supported_services = {"mediamtx", "python_worker"}

    def list_supported(self):
        return sorted(self._supported_services)

    def is_running(self, service_key: str) -> bool:
        with self._lock:
            return self._is_running_locked(service_key)

    def start(self, service_key: str) -> Tuple[bool, str]:
        if service_key not in self._supported_services:
            return False, "Unsupported service key."

        with self._lock:
            if self._is_running_locked(service_key):
                return True, f"{service_key} is already running."

            command, cwd, err = self._build_start_command(service_key)
            if err:
                return False, err

            kwargs = {
                "cwd": str(cwd),
                "stdout": open(self._log_dir / f"{service_key}.out.log", "a", encoding="utf-8"),
                "stderr": open(self._log_dir / f"{service_key}.err.log", "a", encoding="utf-8"),
            }
            if os.name == "nt":
                kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

            try:
                proc = subprocess.Popen(command, **kwargs)  # noqa: S603
                for _ in range(6):
                    time.sleep(0.5)
                    if proc.poll() is not None:
                        self._processes.pop(service_key, None)
                        return False, self._read_last_error(service_key)
                self._processes[service_key] = proc
                return True, f"Started {service_key}."
            except Exception as exc:
                return False, f"Failed to start {service_key}: {exc}"

    def stop(self, service_key: str) -> Tuple[bool, str]:
        if service_key not in self._supported_services:
            return False, "Unsupported service key."

        with self._lock:
            proc = self._processes.get(service_key)
            if not proc or proc.poll() is not None:
                self._processes.pop(service_key, None)
                return True, f"{service_key} is already stopped."

            try:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    proc.wait(timeout=5)
                else:
                    proc.terminate()
                    proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            except Exception as exc:
                return False, f"Failed to stop {service_key}: {exc}"

            self._processes.pop(service_key, None)
            return True, f"Stopped {service_key}."

    def _build_start_command(self, service_key: str):
        if service_key == "mediamtx":
            mediamtx_exe_candidates = [
                self._project_root / "mediamtx_bin" / "mediamtx.exe",
                self._project_root / "mediamtx_bin" / "mediamtx",
            ]
            mediamtx_exe_path = next((p for p in mediamtx_exe_candidates if p.exists()), None)
            if not mediamtx_exe_path:
                system_bin = shutil.which("mediamtx")
                if system_bin:
                    mediamtx_exe_path = Path(system_bin)

            if not mediamtx_exe_path:
                return None, None, "MediaMTX executable not found."

            config_candidates = [
                self._project_root / "mediamtx.yml",
                self._project_root / "mediamtx_bin" / "mediamtx.yml",
            ]
            config_path = next((p for p in config_candidates if p.exists()), None)

            command = [str(mediamtx_exe_path)]
            if config_path:
                command.append(str(config_path))
            return command, self._project_root, None

        if service_key == "python_worker":
            worker_dir = self._project_root / "python_worker"
            worker_script = worker_dir / "main.py"
            if not worker_script.exists():
                return None, None, "python_worker/main.py not found."

            python_candidates = [
                worker_dir / "venv" / "Scripts" / "python.exe",
                worker_dir / "venv" / "bin" / "python",
            ]
            python_path = next((p for p in python_candidates if p.exists()), None)
            if not python_path:
                python_sys = shutil.which("python")
                python_path = Path(python_sys) if python_sys else Path(sys.executable)

            command = [str(python_path), str(worker_script)]
            return command, worker_dir, None

        return None, None, "Unsupported service key."

    def _is_running_locked(self, service_key: str) -> bool:
        proc = self._processes.get(service_key)
        if not proc:
            return False
        if proc.poll() is not None:
            self._processes.pop(service_key, None)
            return False
        return True

    def _read_last_error(self, service_key: str) -> str:
        error_log = self._log_dir / f"{service_key}.err.log"
        if not error_log.exists():
            return f"{service_key} exited immediately after launch."

        try:
            lines = error_log.read_text(encoding="utf-8", errors="ignore").strip().splitlines()
            if not lines:
                return f"{service_key} exited immediately after launch."
            return lines[-1]
        except Exception:
            return f"{service_key} exited immediately after launch."


service_manager = ServiceManager()
