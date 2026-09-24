# Prints the context size (in tokens) of the current Claude Code session, read from its transcript.
# Context size = input + cache creation + cache read tokens of the last main-session assistant turn.
param([string]$SessionId)

$projectKey = ((Get-Location).Path -replace '[^A-Za-z0-9]', '-')
$dir = Join-Path $env:USERPROFILE ".claude\projects\$projectKey"
if (-not (Test-Path $dir)) {
  # Drive letter casing differs between launchers; fall back to a case-insensitive match.
  $dir = Get-ChildItem (Join-Path $env:USERPROFILE '.claude\projects') -Directory |
    Where-Object { $_.Name -ieq $projectKey } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $dir) { throw "No transcript directory found for $projectKey" }

$file = if ($SessionId) { Join-Path $dir "$SessionId.jsonl" }
        else { Get-ChildItem $dir -Filter *.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName }

$entry = Get-Content $file | Where-Object { $_ -match '"usage"' } | ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.type -eq 'assistant' -and -not $_.isSidechain -and $_.message.usage } | Select-Object -Last 1
$u = $entry.message.usage
$tokens = $u.input_tokens + $u.cache_creation_input_tokens + $u.cache_read_input_tokens

"session: $([IO.Path]::GetFileNameWithoutExtension($file))"
"context_tokens: $tokens"
