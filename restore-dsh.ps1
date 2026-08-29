# DSH ??????
# ?? DSH ????,??????? sprite-gen ??

$yamlPath = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml"
$backupPath = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml.bak.20260827-175015"

Write-Host "=== DSH ???? ===" -ForegroundColor Cyan

if (Test-Path $backupPath) {
    Write-Host "??????..." -ForegroundColor Yellow
    Copy-Item $backupPath $yamlPath -Force
    Write-Host "? ????????" -ForegroundColor Green
    Write-Host ""
    Write-Host "????:" -ForegroundColor Gray
    Get-Content $yamlPath
} else {
    Write-Host "? ???????" -ForegroundColor Red
}
