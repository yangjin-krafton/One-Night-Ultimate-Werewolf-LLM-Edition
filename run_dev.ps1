$ErrorActionPreference = "Stop"

# Build scenario index from folder scan
python scripts/build_scenario_index.py

$port = if ($env:PORT) { $env:PORT } else { "8001" }
python -m http.server $port --directory public

