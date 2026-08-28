# dsh-godot-sprite 使用指南

## 功能概述

dsh-godot-sprite 是一个 DSH 插件，提供：
1. AI 图片生成（支持多个服务商）
2. 精灵图生成（自动裁剪透明边、网格排列）
3. DSH UI 设置面板

## 工具列表

### godot_generate_image
一键生成 AI 图片并转换为精灵图。

```javascript
godot_generate_image({
  prompt: "pixel art character sprite sheet",
  provider: "gemini_flash",
  width: 128,
  height: 128,
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  output_path: "./sprites/character.png"
})
```

### godot_sprite_sheet
从现有图片生成精灵图。

```javascript
godot_sprite_sheet({
  image_path: "input.png",
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  output_path: "./output/sheet.png"
})
```

### godot_sprite_config
管理插件配置。

```javascript
// 列出所有提供商
godot_sprite_config({ action: "list" })

// 设置 API Key
godot_sprite_config({ 
  action: "set_key", 
  provider: "gemini_flash", 
  api_key: "YOUR_API_KEY" 
})

// 设置默认提供商
godot_sprite_config({ 
  action: "set_provider", 
  default_provider: "gemini_flash" 
})
```

### godot_sprite_info
查看插件信息。

```javascript
godot_sprite_info()
```

## DSH UI 设置面板

重启 DSH 后，在设置面板中可以：
1. 配置各服务提供商的 API Key
2. 设置默认网格参数（列数、行数、裁剪模式、间距）
3. 查看插件信息

## 支持的提供商

| 提供商 | ID | 费用 | 限制 |
|--------|-----|------|------|
| Google Gemini Flash | gemini_flash | 免费 | 60张/天 |
| Stable Diffusion | stable_diffusion | 免费 | 100张/天 |
| OpenAI DALL-E 3 | openai | 付费 | $0.04-0.08/张 |
| Seedream | seedream | 付费 | API 积分 |
| Agnes AI | agnes | 付费 | 订阅制 |
| 自定义 | custom | 视服务商 | 自定 |

## 获取 API Key

### Gemini Flash (免费)
1. 访问 https://aistudio.google.com/app/apikey
2. 创建 API Key
3. 在 DSH 设置面板或对话中配置

### Stable Diffusion (免费)
1. 访问 https://stable-diffusionapi.com/
2. 注册账号并获取 API Key
3. 在 DSH 设置面板或对话中配置

## Godot 集成

1. 导入生成的 PNG 到 Godot 项目
2. 添加 SpriteFrames 节点
3. 创建新资源，导入 PNG
4. 启用 Region，设置 Region Rect 大小
5. 设置 H Frames 和 V Frames 为网格行列数
