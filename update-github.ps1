param(
  [string]$DataFile = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$git = "C:\Users\ching\AppData\Local\GitHubDesktop\app-3.5.12\resources\app\git\cmd\git.exe"
$target = Join-Path $repoRoot "data\encrypted-data.js"

if (!(Test-Path -LiteralPath $git)) {
  throw "找不到 GitHub Desktop 內建 Git：$git"
}

if ([string]::IsNullOrWhiteSpace($DataFile)) {
  $download = Join-Path $env:USERPROFILE "Downloads"
  $latest = Get-ChildItem -LiteralPath $download -Filter "encrypted-data*.js" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($latest) {
    $DataFile = $latest.FullName
  } elseif (Test-Path -LiteralPath $target) {
    $DataFile = $target
  } else {
    throw "找不到 encrypted-data.js。請先在 admin.html 產生加密資料檔，或把檔案路徑傳給本腳本。"
  }
}

if (!(Test-Path -LiteralPath $DataFile)) {
  throw "找不到資料檔：$DataFile"
}

$resolvedInput = (Resolve-Path -LiteralPath $DataFile).Path
$resolvedTarget = (Resolve-Path -LiteralPath (Split-Path -Parent $target)).Path + "\encrypted-data.js"

if ($resolvedInput -ne $resolvedTarget) {
  Copy-Item -LiteralPath $resolvedInput -Destination $target -Force
}

Push-Location $repoRoot
try {
  $changes = & $git status --short
  if (-not $changes) {
    Write-Host "沒有偵測到需要更新的檔案。"
    exit 0
  }

  & $git add data/encrypted-data.js index.html portal.js shared.js styles.css README.md .gitignore .nojekyll data/.gitkeep update-github.ps1 update-github.bat
  $staged = & $git diff --cached --name-only
  if (-not $staged) {
    Write-Host "沒有需要提交的變更。"
    exit 0
  }

  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  & $git commit -m "Update encrypted birthday CRM data $stamp"
  & $git push origin main
  Write-Host "已更新到 GitHub。GitHub Pages 通常 1-3 分鐘後會看到最新資料。"
} finally {
  Pop-Location
}
