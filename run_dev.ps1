$ErrorActionPreference = "Stop"

$env:DEBUG_COMMANDS = "1"
$env:PYTHONUTF8 = "1"

python -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload

