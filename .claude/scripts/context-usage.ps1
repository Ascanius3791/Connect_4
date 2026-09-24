# Reports the context size of the current Claude Code session and a session-management verdict.
#   (no switch)  manual use: prints tokens and verdict
#   -Hook        PostToolUse hook: reads hook JSON from stdin, silent below the first threshold
#   -StatusLine  status line: reads status JSON from stdin, prints one short line
# Context size = input + cache creation + cache read tokens of the last main-session assistant turn.
param([switch]$Hook, [switch]$StatusLine, [string]$TranscriptPath)

$ContinueBelow = 60000   # below: always continue
$CompactAbove = 120000   # above: compact if the next issue builds on this session

function Find-Transcript {
  $projects = Join-Path $env:USERPROFILE '.claude\projects'
  $key = (Get-Location).Path -replace '[^A-Za-z0-9]', '-'
  $dir = Get-ChildItem $projects -Directory | Where-Object { $_.Name -ieq $key } | Select-Object -First 1
  if (-not $dir) { return $null }
  Get-ChildItem $dir.FullName -Filter *.jsonl | Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

function Read-Tail([string]$path, [long]$bytes) {
  # Get-Content -Tail is very slow on long JSONL lines, so seek from the end instead.
  $stream = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
  try {
    $start = [math]::Max(0, $stream.Length - $bytes)
    $stream.Seek($start, 'Begin') | Out-Null
    $lines = (New-Object IO.StreamReader($stream)).ReadToEnd() -split "`n"
    if ($start -gt 0) { $lines = $lines | Select-Object -Skip 1 }  # first line is partial
    return , @($lines)
  } finally {
    $stream.Dispose()
  }
}

function Get-ContextTokens([string]$path) {
  # Only the tail is parsed; the last main-session turn is almost always within it.
  foreach ($bytes in 512KB, [long]::MaxValue) {
    $lines = Read-Tail $path $bytes
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
      $line = $lines[$i]
      if ($line -notmatch '"usage"' -or $line -notmatch '"type":"assistant"' -or $line -match '"isSidechain":true') { continue }
      $u = ($line | ConvertFrom-Json).message.usage
      if ($u) { return [int]($u.input_tokens + $u.cache_creation_input_tokens + $u.cache_read_input_tokens) }
    }
  }
  return 0
}

$stdin = if ($Hook -or $StatusLine) { [Console]::In.ReadToEnd() | ConvertFrom-Json } else { $null }
# Safety net in case the hook's "if" filter does not narrow it down to pushes.
if ($Hook -and $stdin.tool_input.command -notmatch '(^|[;&|\s])git push') { exit 0 }
if (-not $TranscriptPath) { $TranscriptPath = if ($stdin.transcript_path) { $stdin.transcript_path } else { Find-Transcript } }
if (-not $TranscriptPath -or -not (Test-Path $TranscriptPath)) { exit 0 }

$tokens = Get-ContextTokens $TranscriptPath
$k = '{0}k' -f [math]::Round($tokens / 1000)

if ($tokens -lt $ContinueBelow) {
  $short = 'ok'
  $verdict = 'CONTINUE'
} elseif ($tokens -lt $CompactAbove) {
  $short = 'new session advised'
  $verdict = 'NEW SESSION if the next issue does not build on knowledge that exists only in this session, otherwise CONTINUE'
} else {
  $short = 'new session / compact'
  $verdict = 'NEW SESSION if the next issue does not build on knowledge that exists only in this session, otherwise COMPACT'
}

if ($StatusLine) {
  "ctx $k | $short"
} elseif ($Hook) {
  if ($tokens -lt $ContinueBelow) { exit 0 }
  $message = "Context is $k tokens. Session check: $verdict. See CLAUDE.md step 7."
  @{
    systemMessage      = $message
    hookSpecificOutput = @{ hookEventName = 'PostToolUse'; additionalContext = $message }
  } | ConvertTo-Json -Compress
} else {
  "context_tokens: $tokens"
  "verdict: $verdict"
}
