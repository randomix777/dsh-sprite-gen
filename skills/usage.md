# Godot Sprite Generator - 使用技能

## 快速开始

### 1. 配置 API Key

```javascript
// 设置 Gemini Flash API Key (免费)
godot_sprite_config({
  action: "set_key",
  provider: "gemini_flash",
  api_key: "AIzaSy..."
})

// 或设置 Stable Diffusion API Key (免费)
godot_sprite_config({
  action: "set_key",
  provider: "stable_diffusion",
  api_key: "sd-api-key..."
})
```

### 2. 生成精灵图

```javascript
// 一键生成：图片 + 精灵图
godot_generate_image({
  prompt: "pixel art character sprite sheet, idle walk attack animations, 32x32 pixels",
  provider: "gemini_flash",
  width: 128,
  height: 128,
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  output_path: "./sprites/character.png"
})
```

### 3. 处理现有图片

```javascript
// 从现有图片生成精灵图
godot_sprite_sheet({
  image_path: "input.png",
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  spacing: 0,
  output_path: "./output/sheet.png"
})
```

## 可用工具

### godot_generate_image
生成 AI 图片并转换为精灵图。

**参数：**
- `prompt` (string, 必需): 图片描述
- `provider` (string, 默认 "gemini_flash"): 服务提供商
- `width` (integer, 默认 1024): 图片宽度
- `height` (integer, 默认 1024): 图片高度
- `num_images` (integer, 默认 1): 生成数量
- `grid_cols` (integer, 默认 4): 网格列数
- `grid_rows` (integer, 默认 4): 网格行数
- `crop_mode` (string, 默认 "auto"): 裁剪模式
- `output_path` (string): 输出路径

### godot_sprite_sheet
从现有图片生成精灵图。

**参数：**
- `image_path` (string, 必需): 输入图片路径
- `grid_cols` (integer, 默认 4): 列数
- `grid_rows` (integer, 默认 4): 行数
- `crop_mode` (string, 默认 "auto"): auto/fixed/none
- `spacing` (integer, 默认 0): 像素间距
- `cell_width` (integer, 默认 32): 单元格宽度
- `cell_height` (integer, 默认 32): 单元格高度
- `output_path` (string): 输出路径
- `padding` (integer, 默认 0): 内边距

### godot_sprite_config
管理插件配置。

**操作：**
- `list` - 列出所有提供商
- `set_provider` - 设置默认提供商
- `set_key` - 设置 API Key
- `get_default` - 获取默认参数

### godot_sprite_info
查看插件信息。

## 提供商说明

### 免费提供商

#### Gemini Flash
- **ID**: `gemini_flash`
- **模型**: gemini-2.0-flash-exp
- **限制**: 60 张图片/天
- **速率**: 20 请求/分钟
- **API Key**: https://aistudio.google.com/app/apikey

#### Stable Diffusion
- **ID**: `stable_diffusion`
- **模型**: sdxl
- **限制**: 100 张图片/天
- **速率**: 10 请求/分钟
- **API Key**: https://stable-diffusionapi.com/

### 付费提供商

#### OpenAI DALL-E 3
- **ID**: `openai`
- **成本**: $0.04 (1024x1024) / $0.08 (1792x1024)
- **API Key**: https://platform.openai.com/api-keys

#### Seedream
- **ID**: `seedream`
- **成本**: API 积分
- **API Key**: https://console.volcengine.com/ark

#### Agnes AI
- **ID**: `agnes`
- **成本**: 订阅制
- **API Key**: https://apihub.agnes-ai.com/

## Godot 集成

1. 将生成的 PNG 导入 Godot 项目
2. 添加 `SpriteFrames` 节点
3. 创建新资源，导入 PNG
4. 启用 **Region** 选项
5. 设置 **Region Rect** 为单格尺寸
6. 设置 **H Frames** 和 **V Frames** 为网格行列数

## 示例工作流

```javascript
// 1. 配置 API Key
godot_sprite_config({
  action: "set_key",
  provider: "gemini_flash",
  api_key: "AIzaSy..."
})

// 2. 生成角色精灵图
godot_generate_image({
  prompt: "pixel art RPG character sprite sheet, 8 directions, walk cycle, 64x64 pixels per frame",
  provider: "gemini_flash",
  width: 512,
  height: 512,
  grid_cols: 8,
  grid_rows: 8,
  crop_mode: "auto",
  output_path: "./assets/characters/knight.png"
})

// 3. 在 Godot 中使用
// - 导入 knight.png
// - 设置 H Frames = 8, V Frames = 8
// - 启用 Region，设置 Region Rect = 64x64
```
