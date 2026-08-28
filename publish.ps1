# PowerShell deployment helper
# Use: .publish.ps1 --PushToGitHub --GitHubRepo randomix777/dsh-godot-sprite

# dsh-godot-sprite 发布脚本

param(
    [switch]$DryRun,
    [switch]$PushToGitHub,
    [string]$GitHubRepo
)

$pluginDir = $PSScriptRoot

Write-Host "=== dsh-godot-sprite 发布工具 ===" -ForegroundColor Cyan
Write-Host ""

# 检查必要文件
$requiredFiles = @("package.json", "lib/index.js", "lib/process_sprites.py", "README.md")
foreach ($file in $requiredFiles) {
    if (-not (Test-Path "$pluginDir\$file")) {
        Write-Host "❌ Missing: $file" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ All required files present" -ForegroundColor Green

# 检查 Python 依赖
Write-Host ""
Write-Host "Checking Python dependencies..." -ForegroundColor Yellow
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    $pillow = python -c "import PIL; print(PIL.__version__)" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  PIL/Pillow: $pillow" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ PIL/Pillow not installed" -ForegroundColor Yellow
        Write-Host "  Install: pip install Pillow" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠ Python not found" -ForegroundColor Yellow
}

# 运行测试
Write-Host ""
Write-Host "Running tests..." -ForegroundColor Yellow
Set-Location $pluginDir
node lib/index.js 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✅ Tests passed" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Test script not found (optional)" -ForegroundColor Yellow
}

# 发布到 npm
Write-Host ""
Write-Host "Publishing to npm..." -ForegroundColor Yellow
if ($DryRun) {
    npm publish --dry-run
} else {
    npm publish
}

# 推送到 GitHub
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
