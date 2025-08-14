import subprocess
from pathlib import Path
import platform
import sys

def abort(message):
    print(f"✖ {message}")
    sys.exit(1)

# Detect OS
is_windows = platform.system() == "Windows"

# Set paths
BASE_DIR = Path(__file__).resolve().parent
frontend = BASE_DIR / "jarvis-coder"
backend = BASE_DIR / "voice-backend"
venv_bin = backend / ".venv" / ("Scripts" if is_windows else "bin")
python_exe = venv_bin / ("python.exe" if is_windows else "python3")

# Validate paths
if not frontend.exists():
    abort(f"Frontend directory not found: {frontend}")

if not backend.exists():
    abort(f"Backend directory not found: {backend}")

if not python_exe.exists():
    abort(f"Python executable not found in venv: {python_exe}")

# Start frontend and backend
print("> Starting frontend and backend...")

if is_windows:
    subprocess.Popen(f'start cmd /k "cd {frontend} && npm start"', shell=True)
    subprocess.Popen(f'start cmd /k "cd {backend} && {python_exe} stt.py"', shell=True)
else:
    subprocess.Popen(["npm", "start"], cwd=frontend)
    subprocess.Popen([str(python_exe), "stt.py"], cwd=backend)
