/**
 * ComfyUI integration — local Stable Diffusion generation.
 */

/**
 * Generate image via ComfyUI API (local SD).
 * @param {object} args
 * @param {string} args.prompt
 * @param {number} [args.width=512]
 * @param {number} [args.height=512]
 * @param {number} [args.steps=20]
 * @param {number} [args.cfg=7]
 * @param {string} [args.comfy_url] — default http://127.0.0.1:8188
 * @returns {Promise<{success:boolean, images?:Array, error?:string}>}
 */
export async function generateWithComfyUI(args) {
  const {
    prompt,
    width = 512,
    height = 512,
    steps = 20,
    cfg = 7,
    comfy_url = 'http://127.0.0.1:8188',
  } = args;

  if (!prompt) return { success: false, error: 'prompt is required' };

  // ComfyUI API payload for SDXL
  const workflow = {
    1: {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 2 ** 31),
        steps,
        cfg,
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
    4: { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    5: { class_type: 'VAEDecode', inputs: { samples: ['1', 0], vae: ['2', 2] } },
    6: { class_type: 'SaveImage', inputs: { images: ['5', 0], filename_prefix: 'sprite' } },
    // negative prompt
    7: { class_type: 'CLIPTextEncode', inputs: { text: 'blurry, low quality, distorted', clip: ['2', 1] } },
  };

  try {
    // Queue prompt
    const queueResp = await fetch(`${comfy_url}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    });
    if (!queueResp.ok) {
      const err = await queueResp.text();
      return { success: false, error: `ComfyUI queue failed: ${err}` };
    }
    const queueData = await queueResp.json();
    const clientId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const promptId = queueData.prompt_id;

    // Wait for completion
    const result = await waitForComfyResult(comfy_url, promptId, clientId, timeout = 120);
    if (!result.success) return result;

    // Get image from output
    const outputs = result.outputs;
    const images = [];
    for (const [nodeId, nodeData] of Object.entries(outputs)) {
      if (nodeData.images) {
        for (const img of nodeData.images) {
          const imgResp = await fetch(`${comfy_url}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type}`, {
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

    return { success: true, images, metadata: { provider: 'comfy', width, height, steps } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function waitForComfyResult(comfyUrl, promptId, clientId, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`${comfyUrl}/history/${promptId}`);
      const data = await resp.json();
      const result = data[promptId];
      if (result) {
        return { success: true, outputs: result.outputs || {} };
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { success: false, error: 'ComfyUI generation timed out' };
}
