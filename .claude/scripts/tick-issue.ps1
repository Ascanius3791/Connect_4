# Ticks all checkboxes in a GitHub issue's body and prints the issue state.
param([Parameter(Mandatory)][int]$Number)

$repo = 'Ascanius3791/Connect_4'
$tmp = New-TemporaryFile
try {
  (gh issue view $Number -R $repo --json body -q .body) -join "`n" -replace '- \[ \]', '- [x]' |
    Set-Content -NoNewline $tmp
  gh issue edit $Number -R $repo --body-file $tmp | Out-Null
  gh issue view $Number -R $repo --json number,state,body `
    -q '"#\(.number) \(.state), unchecked boxes: \(.body | [scan("- \\[ \\]")] | length)"'
} finally {
  Remove-Item $tmp
}
