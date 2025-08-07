import subprocess
from pathlib import Path
import sys

def abort(message):
    print(f"✖ {message}")
    sys.exit(1)

# Resolve base directory
BASE_DIR = Path(__file__).resolve().parent
frontend = BASE_DIR / "jarvis-coder"
backend = BASE_DIR / "voice-backend"
venv_scripts = backend / ".venv" / "Scripts"
python_exe = venv_scripts / "python.exe"

# Validate paths
if not frontend.exists():
    abort(f"Frontend directory not found: {frontend}")

if not backend.exists():
    abort(f"Backend directory not found: {backend}")

if not python_exe.exists():
    abort(f"Python executable not found in venv: {python_exe}")

# Launch frontend and backend
print("> Starting frontend and backend...")

subprocess.Popen(f'start cmd /k "cd {frontend} && npm start"', shell=True)
subprocess.Popen(f'start cmd /k "cd {backend} && {python_exe} stt.py"', shell=True)
