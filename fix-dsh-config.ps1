# DSH cordis.patch.yml ????
# ?? DSH ????,?????????

$backup = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml.bak.20260827-175015"
$current = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml"

if (Test-Path $backup) {
    Write-Host "??????..." -ForegroundColor Yellow
    Copy-Item $backup $current -Force
    Write-Host "????????" -ForegroundColor Green
    Write-Host ""
    Write-Host "????????,???:" -ForegroundColor Cyan
    Write-Host "  npm install -g dsh-sprite-gen"
} else {
    Write-Host "???????" -ForegroundColor Red
}
