# DSH cordis.patch.yml 修复脚本
# 如果 DSH 启动失败，运行此脚本恢复配置

$backup = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml.bak.20260827-175015"
$current = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml"

if (Test-Path $backup) {
    Write-Host "恢复备份配置..." -ForegroundColor Yellow
    Copy-Item $backup $current -Force
    Write-Host "已恢复到备份状态" -ForegroundColor Green
    Write-Host ""
    Write-Host "如需重新安装插件，请运行:" -ForegroundColor Cyan
    Write-Host "  npm install -g dsh-godot-sprite"
} else {
    Write-Host "未找到备份文件" -ForegroundColor Red
}
