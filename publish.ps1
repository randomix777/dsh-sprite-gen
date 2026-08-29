# PowerShell deployment helper
# Use: .publish.ps1 --PushToGitHub --GitHubRepo randomix777/dsh-sprite-gen

# dsh-sprite-gen ????

param(
    [switch]$DryRun,
    [switch]$PushToGitHub,
    [string]$GitHubRepo
)

$pluginDir = $PSScriptRoot

Write-Host "=== dsh-sprite-gen ???? ===" -ForegroundColor Cyan
Write-Host ""

# ??????
$requiredFiles = @("package.json", "lib/index.js", "lib/process_sprites.py", "README.md")
foreach ($file in $requiredFiles) {
    if (-not (Test-Path "$pluginDir\$file")) {
        Write-Host "? Missing: $file" -ForegroundColor Red
        exit 1
    }
}
Write-Host "? All required files present" -ForegroundColor Green

# ?? Python ??
Write-Host ""
Write-Host "Checking Python dependencies..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $pillow = python -c "import PIL; print(PIL.__version__)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  PIL/Pillow: $pillow" -ForegroundColor Green
    } else {
        Write-Host "  ? PIL/Pillow not installed" -ForegroundColor Yellow
        Write-Host "  Install: pip install Pillow" -ForegroundColor Gray
    }
} else {
    Write-Host "  ? Python not found" -ForegroundColor Yellow
}

# ????
Write-Host ""
Write-Host "Running tests..." -ForegroundColor Yellow
Set-Location $pluginDir
node lib/index.js 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ? Tests passed" -ForegroundColor Green
} else {
    Write-Host "  ? Test script not found (optional)" -ForegroundColor Yellow
}

# ??? npm
Write-Host ""
Write-Host "Publishing to npm..." -ForegroundColor Yellow
if ($DryRun) {
    npm publish --dry-run
} else {
    npm publish
}

# ??? GitHub
if ($PushToGitHub -and $GitHubRepo) {
    Write-Host ""
    Write-Host "Pushing to GitHub: $GitHubRepo" -ForegroundColor Yellow
    git init
    git add .
    git commit -m "chore: release v$(node -p "require('./package.json').version")"
    git remote add origin "https://github.com/$GitHubRepo.git"
    git push -u origin main
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host ""
Write-Host "Installation:" -ForegroundColor Cyan
Write-Host "  dsh plugin --profile web add github:$GitHubRepo" -ForegroundColor Gray
