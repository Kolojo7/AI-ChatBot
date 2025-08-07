import subprocess
import sys
from pathlib import Path

def run(command, cwd=None):
    print(f"> Running: {command} in {cwd}")
    result = subprocess.run(command, cwd=cwd, shell=True)
    if result.returncode != 0:
        print(f"✖ Command failed: {command}")
        exit(1)

BASE_DIR = Path(__file__).resolve().parent
frontend = BASE_DIR / "jarvis-coder"
backend = BASE_DIR / "voice-backend"
venv = backend / ".venv"
venv_scripts = venv / "Scripts"

# Step 1: Install frontend dependencies
run("npm install", cwd=frontend)

# Step 2: Create virtual environment if missing
if not venv.exists() or not (venv_scripts / "python.exe").exists():
    print("> Creating virtual environment...")
    run(f"{sys.executable} -m venv .venv", cwd=backend)

# Step 3: Confirm pip exists inside venv
pip_exe = venv_scripts / "pip.exe"
if not pip_exe.exists():
    print(f"✖ pip not found at: {pip_exe}")
    exit(1)

# Step 4: Install backend dependencies
run(f'"{pip_exe}" install -r requirements.txt', cwd=backend)

# Step 5: Launch frontend and backend
python_exe = venv_scripts / "python.exe"
print("> Launching frontend and backend...")

subprocess.Popen(f'start cmd /k "cd {frontend} && npm start"', shell=True)
subprocess.Popen(f'start cmd /k "cd {backend} && {python_exe} stt.py"', shell=True)
