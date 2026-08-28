/**
 * Image generation module for dsh-godot-sprite
 * 
 * Supports multiple AI image generation services.
 */

import { getProviderConfig } from './config.js';

/** Generate image using specified AI provider.
 * Supports: gemini_flash, stable_diffusion, agnes
 */
export async function generateImage(args, ctx) {
  const {
    provider = 'gemini_flash',
    prompt,
    negative_prompt = '',
    width = 1024,
    height = 1024,
    num_images = 1,
    style = 'vivid'
  } = args;

  if (!prompt) {
    return { success: false, error: 'prompt is required' };
  }

  const providerConfig = getProviderConfig(provider);
  if (!providerConfig) {
    return { success: false, error: `Unknown provider: ${provider}` };
  }

  // Check API key
  if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
    return {
      success: false,
      error: `API key required for ${providerConfig.name}`,
      hint: 'Use godot_sprite_config tool to set up your API key'
    };
  }

  try {
    let result;

    switch (provider) {
      case 'gemini_flash':
        result = await generateWithGemini(prompt, providerConfig, { width, height, num_images });
        break;
      case 'stable_diffusion':
        result = await generateWithStableDiffusion(prompt, providerConfig, { width, height, num_images, negative_prompt });
        break;
      case 'agnes':
        result = await generateWithAgnes(prompt, providerConfig, { width, height, num_images });
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
  
  const response = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: 'image'
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
  
  const response = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: prompt,
      negative_prompt: options.negative_prompt,
      width: options.width,
      height: options.height,
      steps: 25,
      guidance_scale: 7.5
    })
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

  // Map pixel dimensions to Agnes size档位
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

  const response = await fetch(`${baseUrl}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      prompt: prompt,
      size: size,
      return_base64: true
    })
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
