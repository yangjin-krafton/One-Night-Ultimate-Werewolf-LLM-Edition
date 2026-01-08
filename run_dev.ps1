$ErrorActionPreference = "Stop"

$env:DEBUG_COMMANDS = "1"
$env:PYTHONUTF8 = "1"

$port = if ($env:PORT) { $env:PORT } else { "8001" }
python -m uvicorn server.main:app --host 0.0.0.0 --port $port --reload

