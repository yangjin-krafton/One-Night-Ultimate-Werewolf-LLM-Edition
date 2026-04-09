$ErrorActionPreference = "Stop"

$port = if ($env:PORT) { $env:PORT } else { "8001" }
python -m http.server $port --directory public

