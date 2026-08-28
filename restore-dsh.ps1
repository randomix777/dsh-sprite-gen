# DSH 配置恢复脚本
# 如果 DSH 启动失败，运行此脚本移除 godot-sprite 插件

$yamlPath = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml"
$backupPath = "C:\Users\almz7\.dsh\profiles\web\cordis.patch.yml.bak.20260827-175015"

Write-Host "=== DSH 配置恢复 ===" -ForegroundColor Cyan

if (Test-Path $backupPath) {
    Write-Host "恢复备份配置..." -ForegroundColor Yellow
    Copy-Item $backupPath $yamlPath -Force
    Write-Host "✓ 已恢复到备份状态" -ForegroundColor Green
    Write-Host ""
    Write-Host "当前配置:" -ForegroundColor Gray
    Get-Content $yamlPath
} else {
    Write-Host "✗ 未找到备份文件" -ForegroundColor Red
}
