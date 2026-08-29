/**
 * Image generation module for dsh-sprite-gen
 *
 * Supports multiple AI image generation services.
 */

import { getProviderConfig } from './config.js';
/** Generate image using specified AI provider.
 * Supports: gemini_flash, stable_diffusion, agnes, comfy
 */
export async function generateImage(args, ctx) {
  const {
    provider = 'gemini_flash',
    prompt,
    negative_prompt = '',
    width = 1024,
    height = 1024,
    num_images = 1,
    style = 'vivid',
    imageUrls,
    gemini_images,
    sd_image,
    strength,
    seed,
  } = args;

  if (!prompt) {
    return { success: false, error: 'prompt is required' };
  }

  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return {
      success: false,
      error: `Unknown provider: ${provider}` };
  }

  // Check API key
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return {
      success: false,
      error: `API key required for ${providerConfig.name}`,
      hint: 'Use sprite_config tool to set up your API key'
    };
  }

  try {
    let result;

    switch (provider) {
      case 'gemini_flash':
        result = await generateWithGemini(prompt, providerConfig, { width, height, num_images, gemini_images, seed });
        break;
      case 'stable_diffusion':
        result = await generateWithStableDiffusion(prompt, providerConfig, { width, height, num_images, negative_prompt, sd_image, strength, seed });
        break;
      case 'agnes':
        result = await generateWithAgnes(prompt, providerConfig, { width, height, num_images, imageUrls, seed });
        break;
      case 'comfy':
        result = await generateWithComfy(prompt, providerConfig, { width, height, num_images, seed });
        break;
      default:
        return { success: false, error: `Unsupported provider: ${provider}` };
    }

    return {
      success: true,
      provider,
      images: result.images,
      metadata: result.metadata
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      provider
    };
  }
}
/**
 * Generate image using Google Gemini
 */
async function generateWithGemini(prompt, config, options) {
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl;
  const model = config.model;

  // Build content parts: text + optional images
  const contentParts = [{ text: prompt }];
  if (options.gemini_images && options.gemini_images.length > 0) {
    for (const img of options.gemini_images) {
      contentParts.push({ inlineData: { mimeType: img.mimeType, data: img.inlineData } });
    }
  }

  const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: contentParts
      }],
      generationConfig: {
        responseModalities: 'image',
        seed: options.seed,
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const imageData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  const mimeType = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType || 'image/png';
  
  if (!imageData) {
    throw new Error('No image data in response');
  }

  return {
    images: [{
      data: imageData,
      mimeType: mimeType,
      format: mimeType.split('/')[1]
    }],
    metadata: { provider: 'gemini_flash', width: options.width, height: options.height }
  };
}

/**
 * Generate image using Stable Diffusion API
 */
async function generateWithStableDiffusion(prompt, config, options) {
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl;

  const body = {
    prompt: prompt,
    negative_prompt: options.negative_prompt || '',
    width: options.width,
    height: options.height,
    steps: 25,
    guidance_scale: 7.5,
  };

  // Add img2img reference image if provided
  if (options.sd_image) {
    body.image = options.sd_image;
    body.strength = options.strength ?? 0.65;
  }

  // Add seed for reproducibility
  if (options.seed !== undefined) {
    body.seed = options.seed;
  }

  const response = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Stable Diffusion API error: ${error}`);
  }

  const data = await response.json();
  
  return {
    images: data.images?.map(img => ({
      data: img,
      mimeType: 'image/png',
      format: 'png'
    })) || [],
    metadata: { provider: 'stable_diffusion', width: options.width, height: options.height }
  };
}

/**
 * Generate image using Agnes AI (free forever)
 */
async function generateWithAgnes(prompt, config, options) {
  const apiKey = config.apiKey;
  const baseUrl = config.baseUrl;
  const model = config.model;
  const isEdit = Array.isArray(options.imageUrls) && options.imageUrls.length > 0;

  // Map pixel dimensions to Agnes size
  const maxSize = Math.max(options.width, options.height);
  let size;
  if (maxSize <= 512) {
    size = '1K';
  } else if (maxSize <= 1024) {
    size = '2K';
  } else if (maxSize <= 2048) {
    size = '3K';
  } else {
    size = '4K';
  }

  const body = {
    model: isEdit ? `${model}/edit` : model,
    prompt,
    size,
    return_base64: true,
  };

  // Add image URLs for reference/edit mode
  if (isEdit) body.image_urls = options.imageUrls;

  // Add seed for reproducibility
  if (options.seed !== undefined) {
    body.seed = options.seed;
  }

  // Add strength control (how much the reference influences output)
  if (options.strength !== undefined) {
    body.strength = options.strength;
  }

  const response = await fetch(`${baseUrl}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Agnes AI API error: ${error}`);
  }

  const data = await response.json();

  return {
    images: data.data?.map(img => ({
      data: img.b64_json,
      mimeType: 'image/png',
      format: 'png'
    })) || [],
    metadata: { provider: 'agnes', width: options.width, height: options.height }
  };
}

/**
 * Generate image using ComfyUI (local Stable Diffusion)
 */
async function generateWithComfy(prompt, config, options) {
  const comfyUrl = config.baseUrl || 'http://127.0.0.1:8188';

  const workflow = {
    1: {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 31),
        steps: options.steps ?? 20,
        cfg: options.cfg ?? 7,
        sampler_name: 'euler_ancestral',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    2: { class_type: 'CheckpointLoader', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    3: { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 1] } },
    4: { class_type: 'EmptyLatentImage', inputs: { width: options.width, height: options.height, batch_size: 1 } },
    5: { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    6: { class_type: 'SaveImage', inputs: { images: ['5', 0], filename_prefix: 'sprite' } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, low quality, distorted', clip: ['2', 1] } },
  };

  // Queue prompt
  const queueResp = await fetch(`${comfyUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queueResp.ok) {
    const err = await queueResp.text();
    throw new Error(`ComfyUI queue failed: ${err}`);
  }
  const queueData = await queueResp.json();
  const promptId = queueData.prompt_id;

  // Wait for completion
  const start = Date.now();
  let result = null;
  while (Date.now() - start < (options.timeout ?? 120000)) {
    try {
      const resp = await fetch(`${comfyUrl}/history/${promptId}`);
      const data = await resp.json();
      if (data[promptId]) {
        result = data[promptId];
        break;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!result || !result.outputs) {
    throw new Error('ComfyUI generation timed out');
  }

  // Collect images from outputs
  const images = [];
  for (const [nodeId, nodeData] of Object.entries(result.outputs)) {
    if (nodeData.images) {
      for (const img of nodeData.images) {
        const imgResp = await fetch(`${comfyUrl}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type}`, {
          headers: { 'Accept': 'image/png' },
        });
        if (imgResp.ok) {
          const buf = Buffer.from(await imgResp.arrayBuffer());
          images.push({
            data: buf.toString('base64'),
            mimeType: 'image/png',
            format: 'png',
          });
        }
      }
    }
  }

  if (images.length === 0) {
    throw new Error('No images returned from ComfyUI');
  }

  return {
    images,
    metadata: { provider: 'comfy', width: options.width, height: options.height },
  };
}
