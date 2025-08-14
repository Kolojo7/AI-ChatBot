import subprocess
import sys
from pathlib import Path
import platform

def run(command, cwd=None):
    print(f"> Running: {command} in {cwd}")
    result = subprocess.run(command, cwd=cwd, shell=True)
    if result.returncode != 0:
        print(f"✖ Command failed: {command}")
        sys.exit(1)

# Detect OS
is_windows = platform.system() == "Windows"

# Define paths
BASE_DIR = Path(__file__).resolve().parent
frontend = BASE_DIR / "jarvis-coder"
backend = BASE_DIR / "voice-backend"
server = BASE_DIR / "server"  # new
venv = backend / ".venv"

# Scripts or bin folder depending on OS
venv_bin = venv / ("Scripts" if is_windows else "bin")
pip_exe = venv_bin / ("pip.exe" if is_windows else "pip")
python_exe = venv_bin / ("python.exe" if is_windows else "python3")

# Step 1: Install frontend dependencies
run("npm install", cwd=frontend)

# Step 2: Install server dependencies
run("npm install", cwd=server)

# Step 3: Create virtual environment if needed
if not venv.exists() or not python_exe.exists():
    print("> Creating virtual environment...")
    run(f"{sys.executable} -m venv .venv", cwd=backend)

# Step 4: Install Python backend dependencies
if not pip_exe.exists():
    print(f"✖ pip not found at: {pip_exe}")
    sys.exit(1)

run(f'"{pip_exe}" install -r requirements.txt', cwd=backend)

# Step 5: Launch frontend, backend, and server
print("> Launching frontend, backend, and server...")

if is_windows:
    subprocess.Popen(f'start cmd /k "cd {frontend} && npm start"', shell=True)
    subprocess.Popen(f'start cmd /k "cd {backend} && {python_exe} stt.py"', shell=True)
    subprocess.Popen(f'start cmd /k "cd {server} && npm run server"', shell=True)
else:
    subprocess.Popen(f'gnome-terminal -- bash -c "cd {frontend} && npm start"', shell=True)
    subprocess.Popen(f'gnome-terminal -- bash -c "cd {backend} && {python_exe} stt.py"', shell=True)
    subprocess.Popen(f'gnome-terminal -- bash -c "cd {server} && npm run server"', shell=True)
