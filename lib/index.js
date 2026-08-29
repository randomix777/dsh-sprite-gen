/**
 * Host side of dsh-sprite-gen plugin
 */

import { existsSync, writeFileSync } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

import {
  loadConfig,
  saveConfig,
  getProviderConfig,
  listProviders,
  getConfigSummary,
  IMAGE_PROVIDERS
} from './config.js';
import { generateImage } from './image_gen.js';
import { registerSettingsSection } from './settings.js';
import { saveGeneratedImage, runPythonScript } from './utils.js';
import { generateAnimationSequence, listAnimationSequences } from './animation_gen.js';
import { generateEffect, listEffects } from './effects_gen.js';
import { generateWeapon, listWeapons } from './weapon_gen.js';
import {
  createOrUpdateCharacter, getCharacter, deleteCharacter, listCharacters,
  buildCharacterPrompt, loadCharacters, saveCharacters,
} from './character.js';
import {
  generateCharacterConsistent, generateCharacterSheet, listCharacterViews,
} from './character_gen.js';
import { batchGenerate, batchProcess } from './batch_gen.js';
import { generateParallaxBackground, regenerateParallaxLayer } from './background_gen.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, 'process_sprites.py');

/**
 * Main plugin entry
 */
export function apply(ctx) {
  const harness = ctx.get('harness');

  if (!harness) {
    console.warn('[sprite-gen] harness service not available');
    return;
  }

  // Try to register settings section if dsh-settings is available
  registerSettingsSection(ctx);

  // Register configuration management tool (manages API keys and defaults)
  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_config',
    description: 'Manage sprite plugin configuration: view providers, set API keys, configure defaults.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'set', 'set_key', 'set_provider', 'get_default'],
          description: 'Configuration action'
        },
        provider: {
          type: 'string',
          description: 'Provider ID (for set/set_key/set_provider actions)'
        },
        api_key: {
          type: 'string',
          description: 'API key (for set/set_key actions)'
        },
        base_url: {
          type: 'string',
          description: 'Custom base URL (for custom provider)'
        },
        model: {
          type: 'string',
          description: 'Custom model (for custom provider)'
        },
        default_provider: {
          type: 'string',
          description: 'Default provider ID (for set_provider action)'
        },
        sprite_sheet: {
          type: 'object',
          description: 'Sprite sheet defaults (for set action)'
        },
        config: {
          type: 'object',
          description: 'Full configuration object (for set action)'
        }
      },
      required: ['action']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      const config = loadConfig();

      switch (args.action) {
        case 'list':
          return {
            success: true,
            data: {
              defaultProvider: config.defaultProvider,
              providers: listProviders().map(p => ({
                ...p,
                hasKey: !!config.credentials?.[p.id]?.apiKey
              })),
              spriteSheet: config.spriteSheet || {}
            }
          };

        case 'get':
          return { success: true, data: config };

        case 'get_default':
          return {
            success: true,
            data: {
              defaultProvider: config.defaultProvider,
              ...(config.spriteSheet || {})
            }
          };

        case 'set':
          if (args.config) {
            saveConfig({ ...config, ...args.config });
            return { success: true, data: getConfigSummary() };
          }
          if (args.sprite_sheet) {
            saveConfig({ ...config, spriteSheet: { ...config.spriteSheet, ...args.sprite_sheet } });
            return { success: true, data: getConfigSummary() };
          }
          if (args.default_provider) {
            if (!IMAGE_PROVIDERS[args.default_provider]) {
              return { error: `Unknown provider: ${args.default_provider}` };
            }
            saveConfig({ ...config, defaultProvider: args.default_provider });
            return { success: true, data: getConfigSummary() };
          }
          return { error: 'Missing provider or config' };

        case 'set_key': {
          if (!args.provider || !args.api_key) {
            return { error: 'Missing provider or api_key' };
          }
          if (!IMAGE_PROVIDERS[args.provider]) {
            return { error: `Unknown provider: ${args.provider}` };
          }
          const credentials = {
            ...(config.credentials || {}),
            [args.provider]: {
              apiKey: args.api_key,
              ...(args.base_url ? { baseUrl: args.base_url } : {}),
              ...(args.model ? { model: args.model } : {})
            }
          };
          saveConfig({ ...config, credentials });
          return { success: true, data: getConfigSummary() };
        }

        case 'set_provider': {
          if (!args.provider || !IMAGE_PROVIDERS[args.provider]) {
            return { error: `Invalid or unknown provider: ${args.provider}` };
          }
          saveConfig({ ...config, defaultProvider: args.provider });
          return { success: true, data: getConfigSummary() };
        }

        default:
          return { error: `Unknown action: ${args.action}` };
      }
    }
  }));

  // Register sprite sheet tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_sheet',
    description: 'Generate a Game-engine-compatible sprite sheet from an image. Supports auto-crop, grid arrangement, and transparent edge removal.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input image path' },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        crop_mode: { type: 'string', enum: ['auto', 'fixed', 'none'], default: 'auto' },
        spacing: { type: 'integer', default: 0 },
        cell_width: { type: 'integer', default: 32 },
        cell_height: { type: 'integer', default: 32 },
        output_path: { type: 'string', default: './output/sprite_sheet.png' },
        padding: { type: 'integer', default: 0 }
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? `Sprite sheet generated: ${v.output_path}` : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          image_path: args.image_path,
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          crop_mode: args.crop_mode ?? 'auto',
          spacing: args.spacing ?? 0,
          cell_width: args.cell_width ?? 32,
          cell_height: args.cell_height ?? 32,
          output_path: args.output_path ?? './output/sprite_sheet.png',
          padding: args.padding ?? 0
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // Register image generation + sprite sheet tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_generate_image',
    description: 'Generate an AI image and convert it to a Sprite sheet. Supports multiple providers.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        provider: { type: 'string', default: 'gemini_flash' },
        negative_prompt: { type: 'string', default: '' },
        width: { type: 'integer', default: 1024 },
        height: { type: 'integer', default: 1024 },
        num_images: { type: 'integer', default: 1 },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        crop_mode: { type: 'string', enum: ['auto', 'fixed', 'none'], default: 'auto' },
        output_path: { type: 'string', default: './output/generated.png' }
      },
      required: ['prompt']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? `Generated sprite sheet: ${v.output_path}` : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      try {
        const gen = await generateImage(args, ctx);
        if (!gen.success) {
          return { success: false, ...gen };
        }

        if (!gen.images || gen.images.length === 0) {
          return { success: false, error: 'No images generated' };
        }

        // Save the first generated image to a temp file, then build the sprite sheet.
        const outPath = args.output_path || './output/generated.png';
        const tmpImagePath = path.join(__dirname, '..', 'config', '.generated_tmp.png');
        saveGeneratedImage(gen.images[0].data, gen.images[0].mimeType, tmpImagePath);

        const sheetResult = await runPythonScript({
          image_path: tmpImagePath,
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          crop_mode: args.crop_mode ?? 'auto',
          spacing: 0,
          cell_width: args.width ?? 1024,
          cell_height: args.height ?? 1024,
          output_path: outPath,
          padding: 0
        });

        if (!sheetResult.success) {
          return sheetResult;
        }

        return {
          success: true,
          output_path: outPath,
          output_size: sheetResult.output_size,
          grid_cols: sheetResult.grid_cols,
          grid_rows: sheetResult.grid_rows,
          crop_mode: sheetResult.crop_mode
        };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // Register info tool
  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_info',
    description: 'View information about the sprite plugin, including supported providers and current configuration.',
    parameters: {
      type: 'object',
      properties: {}
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}`
      }]
    },
    execute: async () => {
      const config = loadConfig();
      return {
        success: true,
        data: {
          name: 'dsh-sprite-gen',
          version: '3.0.0',
          defaultProvider: config.defaultProvider,
          providers: listProviders(),
          configured: getConfigSummary().providers.filter(p => p.configured).map(p => p.id)
        }
      };
    }
  }));

  console.log('[sprite-gen] Tools registered successfully');

  // Register cutout + validation tool (port from agnes-sprite-gen)
  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_cutout',
    description: 'Apply background cutout with distance-threshold transparency, bbox crop, scale to target size, and run validation (corner alpha, transparency ratio, border check).',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input image path' },
        output_path: { type: 'string', default: './output/cutout.png' },
        dist_threshold: { type: 'integer', default: 60, description: 'Euclidean distance threshold for background removal (0-255)' },
        corner_region: { type: 'integer', default: 30, description: 'Corner region size in pixels for background sampling' },
        target_width: { type: 'integer', default: 512 },
        target_height: { type: 'integer', default: 768 },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success
          ? `Cutout OK ? ${v.output_path}  transparent=${v.validation?.transparent_ratio ?? '?'}%  corners=${v.validation?.corners_ok ?? '?'  }  border=${v.validation?.border_ok ?? '?'}`
          : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'cutout',
          image_path: args.image_path,
          output_path: args.output_path || './output/cutout.png',
          dist_threshold: args.dist_threshold ?? 60,
          corner_region: args.corner_region ?? 30,
          target_width: args.target_width ?? 512,
          target_height: args.target_height ?? 768,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Animation Sequence Tools --------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_animation_sequence',
    description: 'Generate a multi-frame animation sequence (walk, jump, attack, idle, etc.) from a reference character image using AI.',
    parameters: {
      type: 'object',
      properties: {
        sequence: { type: 'string', description: 'Animation type key (see sprite_animation_list)' },
        reference_image_path: { type: 'string', description: 'Path to reference character image' },
        provider: { type: 'string', description: 'AI provider (default: config default)' },
        output_path: { type: 'string', description: 'Output path for the animation sprite sheet' },
      },
      required: ['sequence', 'reference_image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Animation saved: ${v.output_path} (${v.frames} frames)` : `Error: ${v.error}` }]
    },
    execute: async (args) => generateAnimationSequence(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_animation_list',
    description: 'List all available animation sequence types.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}` }]
    },
    execute: async () => ({ success: true, data: listAnimationSequences() })
  }));

  // --- Effects Tools --------------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_generate_effect',
    description: 'Generate a pixel art sprite effect (bullet, fire, explosion, smoke, spark).',
    parameters: {
      type: 'object',
      properties: {
        effect: { type: 'string', description: 'Effect type key (see sprite_effect_list)' },
        provider: { type: 'string' },
        output_path: { type: 'string', default: './output/effects/<effect>.png' },
        width: { type: 'integer', default: 64 },
        height: { type: 'integer', default: 64 },
      },
      required: ['effect']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Effect saved: ${v.output_path}` : `Error: ${v.error}` }]
    },
    execute: async (args) => generateEffect(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_effect_list',
    description: 'List all available effect types.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}` }]
    },
    execute: async () => ({ success: true, data: listEffects() })
  }));

  // --- Weapon Tools ---------------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_generate_weapon',
    description: 'Generate a pixel art weapon or equipment sprite.',
    parameters: {
      type: 'object',
      properties: {
        weapon: { type: 'string', description: 'Weapon type key (see sprite_weapon_list)' },
        provider: { type: 'string' },
        output_path: { type: 'string', default: './output/weapons/<weapon>.png' },
        width: { type: 'integer', default: 128 },
        height: { type: 'integer', default: 128 },
      },
      required: ['weapon']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Weapon saved: ${v.output_path}` : `Error: ${v.error}` }]
    },
    execute: async (args) => generateWeapon(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_weapon_list',
    description: 'List all available weapon/equipment types.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? JSON.stringify(v.data, null, 2) : `Error: ${v.error}` }]
    },
    execute: async () => ({ success: true, data: listWeapons() })
  }));

  // --- Batch Tools ----------------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_batch_generate',
    description: 'Generate multiple AI sprites in batch (one API call per item).',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of {prompt, output_path, width?, height?}',
          items: { type: 'object' }
        },
        provider: { type: 'string' },
      },
      required: ['items']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Batch done: ${v.succeeded}/${v.total} succeeded` : `Error: ${v.error}` }]
    },
    execute: async (args) => batchGenerate(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_batch_process',
    description: 'Process multiple existing images through sprite sheet pipeline (crop/grid).',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of {image_path, output_path, grid_cols?, grid_rows?, crop_mode?}',
          items: { type: 'object' }
        },
      },
      required: ['items']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Batch processed: ${v.succeeded}/${v.total}` : `Error: ${v.error}` }]
    },
    execute: async (args) => batchProcess(args)
  }));

  // --- Parallax Background Tools --------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_generate_background',
    description: 'Generate a 3-layer parallax background (sky/midground/foreground) for side-scroller games.',
    parameters: {
      type: 'object',
      properties: {
        character_prompt: { type: 'string', description: 'Description of character/world' },
        character_image_url: { type: 'string', description: 'URL of character image' },
        layer1_url: { type: 'string', description: 'Existing layer 1 URL (for regeneration)' },
        layer2_url: { type: 'string', description: 'Existing layer 2 URL' },
        regenerate_layer: { type: 'integer', description: 'Regenerate only layer 1/2/3' },
        provider: { type: 'string' },
      },
      required: ['character_prompt', 'character_image_url']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{
        type: 'text',
        text: v.success
          ? `Background generated: layer1=${(v.layers?.layer1_url||'').slice(0,60)}... layer2=${(v.layers?.layer2_url||'').slice(0,60)}...`
          : `Error: ${v.error}`
      }]
    },
    execute: async (args) => {
      if (args.regenerate_layer) return regenerateParallaxLayer(args, ctx);
      return generateParallaxBackground(args, ctx);
    }
  }));

  // --- GIF Export Tool ------------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_gif_export',
    description: 'Export a sprite sheet PNG to animated GIF. Takes a grid of frames and produces an animated GIF.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input sprite sheet PNG path' },
        output_path: { type: 'string', default: './output/sprite_sheet.gif' },
        fps: { type: 'integer', default: 12, description: 'Frames per second' },
        grid_cols: { type: 'integer', default: 4, description: 'Number of columns in the sprite sheet' },
        grid_rows: { type: 'integer', default: 4, description: 'Number of rows in the sprite sheet' },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `GIF saved: ${v.output_path} (${v.frames} frames @ ${v.fps}fps)` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'gif_export',
          image_path: args.image_path,
          output_path: args.output_path || './output/sprite_sheet.gif',
          fps: args.fps ?? 12,
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Tiled JSON Export Tool -----------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_tiled_export',
    description: 'Export a sprite sheet PNG to Tiled-compatible JSON metadata. Use for Tiled map editor integration.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input sprite sheet PNG path' },
        output_path: { type: 'string', default: './output/sprite_sheet.json' },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        cell_size: { type: 'integer', default: 32 },
        padding: { type: 'integer', default: 0 },
        animations: {
          type: 'array',
          description: 'Optional animation definitions [{name, frame_indices, fps, loop}]. Auto-assigned if omitted.',
          items: { type: 'object' }
        },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Tiled JSON saved: ${v.output_path} (${v.frames} frames, ${v.animations} animations)` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'tiled_export',
          image_path: args.image_path,
          output_path: args.output_path || './output/sprite_sheet.json',
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          cell_size: args.cell_size ?? 32,
          padding: args.padding ?? 0,
          animations: args.animations ?? [],
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Aseprite Import Tool -------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_aseprite_import',
    description: 'Import an .aseprite file and convert to sprite sheets or individual frames.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input .aseprite file path' },
        output_dir: { type: 'string', default: './output/aseprite/' },
        split: { type: 'boolean', default: false, description: 'Split into individual frame PNGs instead of grid sheets' },
        frames: { type: 'integer', description: 'Target frame count for resampling' },
        cell_size: { type: 'integer', default: 32 },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Aseprite imported: ${v.output_dir} (${v.results?.length ?? 0} tags)` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'aseprite_import',
          image_path: args.image_path,
          output_dir: args.output_dir || './output/aseprite/',
          split: args.split ?? false,
          frames: args.frames,
          cell_size: args.cell_size ?? 32,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Tileset Batch Generator Tool -----------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_tileset_batch',
    description: 'Slice a terrain atlas into per-terrain tile variants with contrast validation.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input terrain atlas PNG' },
        output_dir: { type: 'string', default: './output/tileset/' },
        terrain_rows: {
          type: 'array',
          description: '[{name, row}] e.g. [{name:"grass",row:0},{name:"dirt",row:1}]',
          items: { type: 'object' }
        },
        cols: { type: 'integer', default: 8 },
        rows: { type: 'integer', default: 4 },
        tile_size: { type: 'integer', default: 32 },
        min_contrast: { type: 'number', default: 0.05 },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Tileset: ${v.terrains} terrains, ${v.total_tiles} tiles` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'tileset_batch',
          image_path: args.image_path,
          output_dir: args.output_dir || './output/tileset/',
          terrain_rows: args.terrain_rows || [],
          cols: args.cols ?? 8,
          rows: args.rows ?? 4,
          tile_size: args.tile_size ?? 32,
          min_contrast: args.min_contrast ?? 0.05,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Video to Sprite Tool -------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_video2dsprite',
    description: 'Extract frames from video and convert to sprite sheets + animated GIF. Requires ffmpeg.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input video file (mp4, etc.)' },
        output_path: { type: 'string', default: './output/video_sprite.png' },
        fps: { type: 'integer', default: 12 },
        frame_counts: { type: 'array', default: [8, 16], description: 'Target frame counts for different density sheets' },
        grid_cols: { type: 'integer', default: 4 },
        grid_rows: { type: 'integer', default: 4 },
        cell_size: { type: 'integer', default: 64 },
        chroma_key: { type: 'array', default: [255, 0, 255], description: '[R,G,B] chroma key color to remove' },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Video→sprites: ${v.total_frames} frames, ${v.sprite_sheets?.length ?? 0} sheets, gif:${!!v.gif}` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'video2dsprite',
          image_path: args.image_path,
          output_path: args.output_path || './output/video_sprite.png',
          fps: args.fps ?? 12,
          frame_counts: args.frame_counts ?? [8, 16],
          grid_cols: args.grid_cols ?? 4,
          grid_rows: args.grid_rows ?? 4,
          cell_size: args.cell_size ?? 64,
          chroma_key: args.chroma_key ?? [255, 0, 255],
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  console.log('[sprite-gen] All tools registered successfully');

  // --- Palette Quantization Tool --------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_palette_quantize',
    description: 'Quantize a sprite sheet PNG to a retro game palette (GameBoy, NES, GBA, Pico-8, etc.) with optional dithering.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input sprite sheet PNG' },
        output_path: { type: 'string', default: './output/palettized.png' },
        palette: { type: 'string', default: 'gameboy', enum: ['gameboy', 'nes', 'gb_color', 'gamegear', 'gba', 'pico8', 'sega_sgs'], description: 'Target retro palette' },
        dither: { type: 'string', default: 'floyd-steinberg', enum: ['none', 'floyd-steinberg', 'jarvis-judice-ninke', 'stucki', 'burkes', 'atkinson'], description: 'Dithering algorithm' },
        colors: { type: 'integer', default: 16, description: 'Number of palette colors to use' },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Palette quantize: ${v.palette} (${v.colors} colors), saved to ${v.output_path}` : `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'palette_quantize',
          image_path: args.image_path,
          output_path: args.output_path || './output/palettized.png',
          palette: args.palette || 'gameboy',
          dither: args.dither || 'floyd-steinberg',
          colors: args.colors ?? 16,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Sprite Sheet Auto-Detector Tool --------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_detect',
    description: 'Auto-detect sprite grid layout from a sprite sheet PNG — returns cols, rows, cell sizes, and per-cell positions.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input sprite sheet PNG' },
        min_cell: { type: 'integer', default: 8 },
        max_cell: { type: 'integer', default: 128 },
        threshold: { type: 'integer', default: 10 },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Detected grid: ${v.detected_grid?.cols}×${v.detected_grid?.rows} = ${v.total_cells} cells (content: ${v.cells_with_content})` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'sprite_detect',
          image_path: args.image_path,
          min_cell: args.min_cell ?? 8,
          max_cell: args.max_cell ?? 128,
          threshold: args.threshold ?? 10,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  console.log('[sprite-gen] All tools registered successfully');

  // --- Character Identity Tools -----------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_create',
    description: 'Create or update a persistent character identity. Stores name, description, style, reference image, and seed for consistent multi-generation.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Unique character ID (e.g. "warrior_01")' },
        name: { type: 'string', description: 'Display name for the character' },
        description: { type: 'string', description: 'Detailed character description (appearance, clothing, colors, features) — used in all future generations' },
        reference_image: { type: 'string', description: 'Path to reference image for consistency conditioning' },
        style: { type: 'string', description: 'Art style (e.g. "pixel art 32-bit", "anime", "dark fantasy")' },
        seed: { type: 'integer', description: 'Base seed for reproducibility (auto-generated if omitted)' },
      },
      required: ['id']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Character "${v.character?.id}" created/updated: ${v.character?.name || v.character?.id}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => createOrUpdateCharacter(args.id, args)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_get',
    description: 'Get a character identity by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: JSON.stringify(v.character, null, 2) }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => ({ success: true, character: getCharacter(args.id) || { id: args.id, error: 'not found' } })
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_list',
    description: 'List all saved character identities.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? JSON.stringify(v.characters, null, 2) : `Error: ${v.error}` }]
    },
    execute: async () => ({ success: true, characters: listCharacters() })
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_delete',
    description: 'Delete a character identity by ID.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? `Deleted character "${v.id}"` : `Error: ${v.error}` }]
    },
    execute: async (args) => deleteCharacter(args.id)
  }));

  // --- Character Consistency Generation Tools ---------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_generate',
    description: 'Generate a sprite with character consistency. Uses saved character identity + reference image conditioning. Supports strength tuning (0-1) and fixed seeds.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string', description: 'Character ID from sprite_character_create (optional if not using saved identity)' },
        prompt: { type: 'string', description: 'Generation prompt' },
        reference_image_path: { type: 'string', description: 'Local path to reference image for consistency conditioning' },
        provider: { type: 'string' },
        width: { type: 'integer', default: 1024 },
        height: { type: 'integer', default: 1024 },
        strength: { type: 'number', default: 0.65, description: 'Reference image influence: 0=ignore ref, 1=strict copy. 0.5-0.7 recommended.' },
        seed: { type: 'integer', description: 'Fixed seed for reproducibility' },
        output_path: { type: 'string', default: './output/character.png' },
      },
      required: ['prompt']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Character sprite generated: ${v.output_path} (strength=${v.strength}, seed=${v.seed})` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => generateCharacterConsistent(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_sheet',
    description: 'Generate a multi-view character sheet (front/side/back/idle/attack etc.) with consistent appearance. All views use the same character identity and seed strategy.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string', description: 'Character ID for consistency' },
        prompt: { type: 'string', description: 'Base character description prompt' },
        reference_image_path: { type: 'string', description: 'Reference image for conditioning' },
        views: {
          type: 'array',
          default: ['front', 'side'],
          description: 'View types to generate',
          items: { type: 'string' }
        },
        provider: { type: 'string' },
        width: { type: 'integer', default: 512 },
        height: { type: 'integer', default: 512 },
        strength: { type: 'number', default: 0.6, description: 'Reference image influence (0-1)' },
        output_path: { type: 'string', default: './output/character_sheet.png' },
      },
      required: []
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Character sheet: ${v.views?.length || 0} views generated, saved to ${v.output_path}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => generateCharacterSheet(args, ctx)
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_character_views',
    description: 'List available view types for character sheet generation.',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: v.success ? JSON.stringify(v.views, null, 2) : `Error: ${v.error}` }]
    },
    execute: async () => ({ success: true, views: listCharacterViews() })
  }));

  // --- Prop Pack Tools ------------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_generate_prop_pack',
    description: 'Generate a batch of related scene props (rock, barrel, torch, chest, etc.) as a single sprite sheet, then extract individual PNGs with manifest.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Prop category (rock, barrel, torch, chest, tree, flower, grass_clump, sign, crate, lantern)',
        },
        image_path: {
          type: 'string',
          description: 'Path to raw prop sheet PNG (generated via sprite_generate_image), will be extracted into individual props',
        },
        output_dir: { type: 'string', default: './output/prop_pack/' },
        cell_size: { type: 'integer', default: 128 },
        chroma_key: { type: 'array', default: [255, 0, 255], description: '[R,G,B] background color to remove' },
      },
      required: ['category', 'image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Prop pack: ${v.props_extracted} props from "${v.category}", saved to ${v.output_dir}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        const result = await runPythonScript({
          command: 'prop_pack',
          image_path: args.image_path,
          output_dir: args.output_dir || './output/prop_pack/',
          props: [], // will be inferred from category in Python
          cell_size: args.cell_size ?? 128,
          chroma_key: args.chroma_key ?? [255, 0, 255],
          category: args.category,
        });
        return result;
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_extract_prop_pack',
    description: 'Extract individual props from a generated prop sheet by magenta chroma-key removal. Requires prior sprite_generate_prop_pack or manual sheet generation.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input prop sheet PNG' },
        props: {
          type: 'array',
          description: 'List of prop names in sheet order, e.g. ["rock_small","rock_large","barrel","torch"]',
          items: { type: 'string' },
        },
        output_dir: { type: 'string', default: './output/prop_pack/' },
        cell_size: { type: 'integer', default: 128 },
        chroma_key: { type: 'array', default: [255, 0, 255] },
        tolerance: { type: 'integer', default: 40 },
      },
      required: ['image_path', 'props']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Extracted ${v.props_extracted} props → ${v.output_dir}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        return await runPythonScript({
          command: 'prop_pack',
          image_path: args.image_path,
          output_dir: args.output_dir || './output/prop_pack/',
          props: args.props || [],
          cell_size: args.cell_size ?? 128,
          chroma_key: args.chroma_key ?? [255, 0, 255],
          tolerance: args.tolerance ?? 40,
        });
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Scene Object Tools ---------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_scene_object',
    description: 'Generate or extract a single game-ready scene object (door, table, bush, etc.) with collision metadata. Returns PNG + collision shape/bbox.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input object sheet PNG' },
        object_type: {
          type: 'string',
          enum: Object.keys({
            door:1,window:1,table:1,chair:1,bed:1,fountain:1,well:1,arch:1,pillar:1,
            grave:1,tombstone:1,bush:1,hedge:1,fence_section:1,gate:1,bridge_piece:1,
            wall_section:1,torch_bracket:1,banner:1,tapestry:1,cauldron:1,anvil:1,
            barrel:1,crate:1,rock_small:1,rock_large:1,tree_small:1,tree_large:1,
            flower_cluster:1,grass_tuft:1,lamp_post:1,bench:1,urn:1,barrier_rope:1,
          }).reduce((a,k)=>({...a,[k]:k}),{}),
          description: 'Object type from predefined list',
        },
        output_path: { type: 'string', default: './output/scene_object.png' },
        style: { type: 'string', default: 'pixel_art', enum: ['pixel_art', 'clean_hd', 'retro_pixel'] },
        cell_size: { type: 'integer', default: 128 },
        chroma_key: { type: 'array', default: [255, 0, 255] },
        tolerance: { type: 'integer', default: 40 },
      },
      required: ['image_path', 'object_type']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Scene object "${v.object_type}": ${v.final_size}px, collision=${v.metadata?.shape}, saved to ${v.output_path}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        return await runPythonScript({
          command: 'scene_object',
          image_path: args.image_path,
          object_type: args.object_type,
          output_path: args.output_path || './output/scene_object.png',
          style: args.style || 'pixel_art',
          cell_size: args.cell_size ?? 128,
          chroma_key: args.chroma_key ?? [255, 0, 255],
          tolerance: args.tolerance ?? 40,
        });
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_scene_object_batch',
    description: 'Extract multiple scene objects from a single sheet (one object per cell). Each gets collision metadata based on its type.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input multi-object sheet PNG' },
        object_types: {
          type: 'array',
          description: 'Object type per cell, left-to-right top-to-bottom',
          items: { type: 'string' },
        },
        output_dir: { type: 'string', default: './output/scene_objects/' },
        cell_size: { type: 'integer', default: 128 },
        chroma_key: { type: 'array', default: [255, 0, 255] },
        tolerance: { type: 'integer', default: 40 },
      },
      required: ['image_path', 'object_types']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Scene objects: ${v.objects_processed} extracted → ${v.output_dir}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        return await runPythonScript({
          command: 'scene_object_batch',
          image_path: args.image_path,
          object_types: args.object_types || [],
          output_dir: args.output_dir || './output/scene_objects/',
          cell_size: args.cell_size ?? 128,
          chroma_key: args.chroma_key ?? [255, 0, 255],
          tolerance: args.tolerance ?? 40,
        });
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

  // --- Anchor Layout Tool ---------------------------------------------------

  harness.registerTool(ctx, harness.defineTool({
    name: 'sprite_anchor_layout',
    description: 'Build a fixed-scale anchor template from an accepted character frame. Repeats the subject into a grid with shared feet anchor — use as reference for consistent multi-view generation.',
    parameters: {
      type: 'object',
      properties: {
        image_path: { type: 'string', description: 'Input accepted master frame PNG' },
        rows: { type: 'integer', default: 2, description: 'Rows in anchor grid' },
        cols: { type: 'integer', default: 3, description: 'Columns in anchor grid' },
        cell_width: { type: 'integer', default: 512 },
        cell_height: { type: 'integer', default: 512 },
        subject_height_ratio: { type: 'number', default: 0.66, description: 'Subject height / cell height' },
        subject_width_ratio: { type: 'number', default: 0.72, description: 'Subject width / cell width' },
        feet_ratio: { type: 'number', default: 0.82, description: 'Feet position from top (0-1)' },
        threshold: { type: 'integer', default: 100 },
        output_path: { type: 'string', default: './output/anchor_layout.png' },
      },
      required: ['image_path']
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => v.success
        ? [{ type: 'text', text: `Anchor layout: ${v.grid.cols}×${v.grid.rows} cells, scale=${v.scale}, feet_y=${v.feet_y}px → ${v.output_path}` }]
        : [{ type: 'text', text: `Error: ${v.error}` }]
    },
    execute: async (args) => {
      try {
        return await runPythonScript({
          command: 'anchor_layout',
          image_path: args.image_path,
          rows: args.rows ?? 2,
          cols: args.cols ?? 3,
          cell_width: args.cell_width ?? 512,
          cell_height: args.cell_height ?? 512,
          subject_height_ratio: args.subject_height_ratio ?? 0.66,
          subject_width_ratio: args.subject_width_ratio ?? 0.72,
          feet_ratio: args.feet_ratio ?? 0.82,
          threshold: args.threshold ?? 100,
          output_path: args.output_path || './output/anchor_layout.png',
        });
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  }));

}

export const name = 'sprite-gen';
export const inject = ['harness'];
