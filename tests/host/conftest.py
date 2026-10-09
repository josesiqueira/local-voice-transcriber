import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOST_DIR = ROOT / "host"
sys.path.insert(0, str(HOST_DIR))

# Keep test logs out of the real log folder.
os.environ.setdefault("WAT_LOG_DIR", str(ROOT / "test-results" / "host-logs"))
