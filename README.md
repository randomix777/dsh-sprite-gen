# dsh-godot-sprite

Godot Sprite Sheet Generator with AI Image Generation for DeepSeek Harness.

## Features

- 🎨 **AI Image Generation** - Generate sprites directly with AI
- 🔌 **Multiple Providers** - Support for free services
- ✂️ **Auto-crop** - Automatically remove transparent edges
- 📐 **Grid Arrangement** - Configurable sprite sheet layouts
- 🎮 **Godot Ready** - Output compatible with Godot AnimationPlayer
- ⚙️ **Customizable** - Full configuration support

## Supported Providers

| Provider | Model | Limits | API Key |
|----------|-------|--------|---------|
| Gemini Flash | gemini-2.0-flash-exp | 60/day | Required |
| Stable Diffusion | sdxl | 100/day | Required |
| Agnes AI | agnes-image-2.1-flash | Free forever | Required |

## Installation

```bash
# From GitHub
dsh plugin --profile web add github:randomix777/dsh-godot-sprite

# Manual
cd ~/.dsh/profiles/web
pnpm add file:/path/to/dsh-godot-sprite
```

## Usage

### Generate Image + Sprite Sheet (Recommended)

```javascript
godot_generate_image({
  prompt: "pixel art character sprite, idle pose, 32x32",
  provider: "gemini_flash",
  width: 128,
  height: 128,
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  output_path: "./sprites/character.png"
})
```

### Generate Sprite Sheet from Existing Image

```javascript
godot_sprite_sheet({
  image_path: "input.png",
  grid_cols: 4,
  grid_rows: 4,
  crop_mode: "auto",
  spacing: 0,
  output_path: "./output/sheet.png"
})
```

### Configuration

```javascript
// List providers
godot_sprite_config({ action: "list" })

// Set default provider
godot_sprite_config({ action: "set_provider", default_provider: "gemini_flash" })

// Set API key
godot_sprite_config({ action: "set_key", provider: "gemini_flash", api_key: "YOUR_API_KEY" })

// Get defaults
godot_sprite_config({ action: "get_default" })
```

## Parameters

### godot_generate_image
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| prompt | string | — | Image generation prompt |
| provider | string | gemini_flash | Image generation provider |
| width | integer | 1024 | Image width |
| height | integer | 1024 | Image height |
| num_images | integer | 1 | Number of images |
| grid_cols | integer | 4 | Sprite sheet columns |
| grid_rows | integer | 4 | Sprite sheet rows |
| crop_mode | enum | auto | Crop mode: auto/fixed/none |
| output_path | string | ./output/sprite_sheet.png | Output path |

### godot_sprite_sheet
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| image_path | string | — | Input image path or DSH attachment |
| grid_cols | integer | 4 | Number of columns |
| grid_rows | integer | 4 | Number of rows |
| crop_mode | enum | auto | auto/fixed/none |
| spacing | integer | 0 | Pixel spacing between cells |
| cell_width | integer | 32 | Cell width (fixed mode) |
| cell_height | integer | 32 | Cell height (fixed mode) |
| output_path | string | ./output/sprite_sheet.png | Output path |
| padding | integer | 0 | Padding around cells |

## Setup API Keys

```javascript
// Gemini Flash (Free tier)
godot_sprite_config({ 
  action: "set_key", 
  provider: "gemini_flash", 
  api_key: "AIzaSy..." 
})

// Stable Diffusion (Free tier)
godot_sprite_config({ 
  action: "set_key", 
  provider: "stable_diffusion", 
  api_key: "sd-api-key..." 
})
```

## Godot Integration

1. Import the PNG into your Godot project
2. Add a `SpriteFrames` node
3. Create a new resource, import the PNG
4. Enable **Region** in the inspector
5. Set **Region Rect** to single cell size
6. Set **H Frames** and **V Frames** to grid dimensions

## Requirements

- Node.js >= 18
- Python 3.8+
- PIL (Pillow)

```bash
pip install Pillow
```

## Development

```bash
# Install dependencies
npm install

# Build client bundle
npm run build-client

# Test
node scripts/validate.mjs

# Pack for publishing
npm pack
```

## License

MIT
