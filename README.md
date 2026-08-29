# dsh-sprite-gen

Sprite Sheet Generator with AI Image Generation for DeepSeek Harness.

## Features

- ?? **AI Image Generation** - Generate sprites directly with AI
- ?? **4 Providers** - Gemini Flash, Stable Diffusion, Agnes AI, ComfyUI (local)
- ?? **Auto-crop** - Automatically remove transparent edges
- ?? **Grid Arrangement** - Configurable sprite sheet layouts
- ?? **Cutout + Validation** - Distance-threshold background removal with bbox crop, scale, and quality checks
- ?? **Animation Sequences** - Multi-frame walk/jump/attack/idle with reference consistency
- ??? **Parallax Backgrounds** - 3-layer side-scroller backgrounds (sky/mid/foreground)
- ?? **Effects Generation** - Bullets, fire, explosions, smoke, sparks
- ?? **Weapon/Equipment Sprites** - Guns, swords, armor, helmets
- ?? **Batch Generation** - Generate multiple assets in one call
- ?? **GIF Export** - Export sprite sheets to animated GIF for preview

## Supported Providers

| Provider | Model | Limits | API Key |
|----------|-------|--------|---------|
| Gemini Flash | gemini-2.0-flash-exp | 60/day | Required |
| Stable Diffusion | sdxl | 100/day | Required |
| Agnes AI | agnes-image-2.1-flash | Free forever | Required |
| ComfyUI | sdxl (local) | Unlimited | Not needed |

## Installation

```bash
# From GitHub
dsh plugin --profile web add github:randomix777/dsh-sprite-gen

# Manual
cd ~/.dsh/profiles/web
pnpm add file:/path/to/dsh-sprite-gen
```

## Available Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `sprite_config` | Manage API keys, providers, and defaults |
| `sprite_generate_image` | Generate image + convert to sprite sheet |
| `sprite_sheet` | Process existing image into sprite sheet |
| `sprite_cutout` | Background cutout with validation |
| `sprite_info` | View plugin info and configuration |

### Animation & Effects

| Tool | Description |
|------|-------------|
| `sprite_animation_sequence` | Generate multi-frame animation from reference |
| `sprite_animation_list` | List available animation types |
| `sprite_generate_effect` | Generate effect sprites (bullets, fire, etc.) |
| `sprite_effect_list` | List available effect types |
| `sprite_generate_weapon` | Generate weapon/equipment sprites |
| `sprite_weapon_list` | List available weapon types |

### Advanced

| Tool | Description |
|------|-------------|
| `sprite_batch_generate` | Batch generate multiple AI sprites |
| `sprite_batch_process` | Batch process multiple images |
| `sprite_generate_background` | Generate 3-layer parallax backgrounds |
| `sprite_gif_export` | Export sprite sheet PNG to animated GIF |
| `sprite_tiled_export` | Export sprite sheet to Tiled editor JSON |
| `sprite_aseprite_import` | Import .aseprite files to sprite sheets/frames |
| `sprite_tileset_batch` | Slice terrain atlas into per-terrain tile variants |
| `sprite_video2dsprite` | Extract frames from video → sprite sheets + GIF |
| `sprite_palette_quantize` | Quantize to retro palettes (GameBoy, NES, Pico-8, etc.) |
| `sprite_detect` | Auto-detect sprite grid layout from PNG sheet |

### Character Consistency

| Tool | Description |
|------|-------------|
| `sprite_character_create` | Create persistent character identity (name, description, ref image, seed) |
| `sprite_character_get` | Get character identity by ID |
| `sprite_character_list` | List all saved character identities |
| `sprite_character_delete` | Delete a character identity |
| `sprite_character_generate` | Generate sprite with character consistency (strength tuning, fixed seed) |
| `sprite_character_sheet` | Multi-view character sheet (front/side/back) with consistent appearance |
| `sprite_character_views` | List available view types for character sheet |

### Props & Scene Objects

| Tool | Description |
|------|-------------|
| `sprite_generate_prop_pack` | Generate + extract a batch of related props (rock, barrel, torch, chest…) from a sheet |
| `sprite_extract_prop_pack` | Chroma-key extract individual props from an existing prop sheet |
| `sprite_scene_object` | Generate/extract a single game-ready scene object with collision bbox metadata |
| `sprite_scene_object_batch` | Batch-extract multiple scene objects from a multi-object sheet |
| `sprite_anchor_layout` | Build fixed-scale anchor template from accepted master frame for multi-view consistency |

### Terrain & Platforms

| Tool | Description |
|------|-------------|
| `sprite_tileset_batch_qc` | Enhanced terrain tile bundle with edge_policy (isolated/seamless), contrast QC, pairwise PSNR variant-diff, material hints |
| `sprite_platform_strip` | Reusable side-scrolling platform strips (left/middle/right cap) with collision metadata |

### Preview

| Tool | Description |
|------|-------------|
| `sprite_preview_list` | List recently generated sprite outputs with paths and timestamps |
| `sprite_preview_image` | Read a local image file and return as base64 data URL for client-side preview |

## Usage Examples

### Generate Character with Animation

```javascript
// 1. Generate base character
sprite_generate_image({
  prompt: "female survivor pixel art character, idle pose, detailed 32-bit pixel art",
  provider: "agnes",
  width: 1024, height: 1536,
  output_path: "./sprites/player_base.png"
})

// 2. Cutout and validate
sprite_cutout({
  image_path: "./sprites/player_base.png",
  output_path: "./sprites/player_clean.png",
  target_width: 512, target_height: 768
})

// 3. Generate walk cycle
sprite_animation_sequence({
  sequence: "player_run",
  reference_image_path: "./sprites/player_clean.png",
  output_path: "./sprites/player_run.png"
})

// 4. Generate jump animation
sprite_animation_sequence({
  sequence: "player_jump",
  reference_image_path: "./sprites/player_clean.png",
  output_path: "./sprites/player_jump.png"
})

// 5. Generate attack animation
sprite_animation_sequence({
  sequence: "player_shoot",
  reference_image_path: "./sprites/player_clean.png",
  output_path: "./sprites/player_shoot.png"
})
```

### Generate Effects

```javascript
// List available effects
sprite_effect_list()

// Generate bullet effects
sprite_generate_effect({ effect: "bullet_trail", output_path: "./effects/bullet.png" })
sprite_generate_effect({ effect: "bullet_impact", output_path: "./effects/impact.png" })
sprite_generate_effect({ effect: "fire_explosion", output_path: "./effects/explosion.png" })
```

### Generate Weapons

```javascript
// List weapons
sprite_weapon_list()

// Generate weapon sprites
sprite_generate_weapon({ weapon: "assault_rifle", output_path: "./weapons/rifle.png" })
sprite_generate_weapon({ weapon: "pistol_9mm", output_path: "./weapons/pistol.png" })
```

### Batch Generation

```javascript
// Generate multiple characters at once
sprite_batch_generate({
  provider: "agnes",
  items: [
    { prompt: "female survivor pixel art", output_path: "./sprites/female.png" },
    { prompt: "male raider pixel art", output_path: "./sprites/raider.png" },
    { prompt: "zombie enemy pixel art", output_path: "./sprites/zombie.png" },
  ]
})
```

### Parallax Background

```javascript
sprite_generate_background({
  character_prompt: "post-apocalyptic survivor in wasteland",
  character_image_url: "https://example.com/character.png",
  provider: "agnes"
})
```

### Export to GIF

```javascript
// Convert a sprite sheet PNG to animated GIF
sprite_gif_export({
  image_path: "./sprites/player_walk.png",
  output_path: "./sprites/player_walk.gif",
  fps: 12,
  grid_cols: 4,
  grid_rows: 1
})
```

### ComfyUI (Local SD)

```javascript
// Ensure ComfyUI is running on http://127.0.0.1:8188
sprite_generate_image({
  prompt: "pixel art character sprite",
  provider: "comfy",
  width: 512, height: 512
})
```

## Configuration

```javascript
// Set Agnes API key
sprite_sprite_config({
  action: "set_key",
  provider: "agnes",
  api_key: "your_key_here"
})

// Switch default provider
sprite_sprite_config({ action: "set_provider", provider: "agnes" })

// List providers
sprite_sprite_config({ action: "list" })
```

## Godot Integration

1. Import the generated PNG into your Godot project
2. Add a `SpriteFrames` node
3. Create a new resource, import the PNG
4. Enable **Region** in the inspector
5. Set **Region Rect** to single cell size
6. Set **H Frames** and **V Frames** to grid dimensions

## Requirements

- Node.js >= 18
- Python 3.8+
- Pillow + NumPy

```bash
pip install Pillow numpy
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
