# Auto-submit to awesome-dsh-plugin when repo is old enough
param(
    [string]$Repo = "randomix777/dsh-sprite-gen",
    [string]$TargetRepo = "awesome-dsh-plugin/awesome-dsh-plugin"
)

Write-Host "=== DSH Plugin Auto-Submitter ===" -ForegroundColor Cyan
Write-Host ""

# Check repo age
$created = gh api "repos/$Repo" --jq '.created_at'
$now = Get-Date
$ageHours = ($now.ToUniversalTime() - [DateTimeOffset]::Parse($created).UtcDateTime).TotalHours

if ($ageHours -lt 24) {
    $remaining = [Math]::Ceiling(24 - $ageHours)
    $readyAt = $now.AddHours(24 - $ageHours).ToString('yyyy-MM-dd HH:mm')
    Write-Host "⏳ Repository is $($ageHours.ToString('0.0')) hours old" -ForegroundColor Yellow
    Write-Host "   Need 24 hours, will be ready at: $readyAt (UTC)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   You can run this script again later:" -ForegroundColor Gray
    Write-Host "   .\scripts\auto-submit.ps1" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Repository is $([Math]::Round($ageHours, 1)) hours old - ready to submit!" -ForegroundColor Green
Write-Host ""

# Create the plugin entry file
$pluginEntry = @"
url: https://github.com/$Repo
name: $Repo
category: tools
description:
  en: Sprite sheet generator with AI image generation using free providers (Gemini Flash, Stable Diffusion, Agnes AI). Auto-crops transparent edges and arranges sprites into Godot-compatible grids.
  zh: Godot 精灵图生成器，使用免费 AI 图片生成服务（Gemini Flash、Stable Diffusion、Agnes AI）。自动裁剪透明边、网格排列，输出与 Godot AnimationPlayer 兼容的精灵图集。
"@

# Create PR body
$prBody = @"
## Add $Repo

Sprite Sheet Generator with AI Image Generation for DeepSeek Harness.

- Generates pixel art sprites via free AI (Gemini Flash, Stable Diffusion, Agnes AI)
- Auto-crops transparent edges
- Arranges into Godot-compatible sprite sheets
- Full DSH client settings panel support

**Category:** tools
**Install:** \`dsh plugin --profile web add dsh-sprite-gen\`
**GitHub:** https://github.com/$Repo
"@

Write-Host "📝 Creating awesome-dsh-plugin PR..." -ForegroundColor Cyan

# Fork if not already forked
$myFork = gh api repos/$($env:USERNAME)/awesome-dsh-plugin --status 404 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Forking awesome-dsh-plugin..." -ForegroundColor Gray
    gh repo fork $TargetRepo --clone=false 2>&1 | Out-Null
}

# Clone fork if needed
$forkDir = "$env:USERPROFILE\awesome-dsh-plugin"
if (-not (Test-Path "$forkDir\.git")) {
    Write-Host "  Cloning fork..." -ForegroundColor Gray
    git clone "https://github.com/$($env:USERNAME)/awesome-dsh-plugin.git" $forkDir 2>&1 | Out-Null
}

Set-Location $forkDir
git checkout -b add-$Repo 2>$null
git pull origin main 2>$null

# Create data directory if needed
New-Item -ItemType Directory -Path "data/plugins" -Force | Out-Null

# Write plugin entry
$entryPath = "data/plugins/$($Repo.Replace('/', '__')).yml"
$pluginEntry | Out-File -FilePath $entryPath -Encoding utf8
Write-Host "  Created: $entryPath" -ForegroundColor Gray

# Regenerate READMEs
if (Test-Path "package.json") {
    Write-Host "  Regenerating READMEs..." -ForegroundColor Gray
    npm ci --silent 2>$null
    node scripts/generate-readme.mjs 2>$null
}

# Commit and push
git add .
git diff --cached --quiet 2>$null
if ($LASTEXITCODE -ne 0) {
    git commit -m "Add $Repo" 2>&1 | Out-Null
    git push -u origin "add-$Repo" 2>&1 | Out-Null
    
    # Create PR
    Write-Host "  Creating PR..." -ForegroundColor Gray
    $pr = gh pr create `
        --repo $TargetRepo `
        --title "Add $Repo" `
        --body $prBody 2>&1
    
    if ($pr) {
        Write-Host ""
        Write-Host "✅ PR created successfully!" -ForegroundColor Green
        Write-Host "   $pr" -ForegroundColor Cyan
    } else {
        Write-Host "   PR URL: https://github.com/$TargetRepo/pull/new/add-$Repo" -ForegroundColor Gray
    }
} else {
    Write-Host "  Nothing to commit (already submitted?)" -ForegroundColor Yellow
}

Set-Location -
