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
import { saveGeneratedImage, runPythonScript as _runPythonScript } from './utils.js';
import { generateAnimationSequence, listAnimationSequences } from './animation_gen.js';
import { generateEffect, listEffects } from './effects_gen.js';
import { generateWeapon, listWeapons } from './weapon_gen.js';
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
    name: 'sprite__config',
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
    name: 'sprite__sheet',
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
    name: 'sprite__info',
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

  console.log('[sprite-gen] All tools registered successfully');
}

export const name = 'sprite-gen';
export const inject = ['harness'];
