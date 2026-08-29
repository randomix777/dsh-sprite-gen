"""
Scene object generator — generates individual game-ready scene objects
with collision bounding boxes and placement metadata.

Objects: door, window, table, chair, bed, fountain, well, arch, pillar,
        grave, tombstone, bush, hedge, fence_section, gate, bridge_piece,
        wall_section, torch_bracket, banner, tapestry, cauldron, anvil.
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np

# Collision shape types and their typical aspect ratios
OBJECT_DEFS = {
    "door": {"shape": "rectangle", "w_ratio": 0.5, "h_ratio": 0.8, "occlusion": "none", "walkable": False},
    "window": {"shape": "rectangle", "w_ratio": 0.4, "h_ratio": 0.4, "occlusion": "none", "walkable": False},
    "table": {"shape": "rectangle", "w_ratio": 0.7, "h_ratio": 0.35, "occlusion": "rear_shift", "walkable": True},
    "chair": {"shape": "rectangle", "w_ratio": 0.3, "h_ratio": 0.4, "occlusion": "none", "walkable": True},
    "bed": {"shape": "rectangle", "w_ratio": 0.7, "h_ratio": 0.35, "occlusion": "none", "walkable": True},
    "fountain": {"shape": "circle", "radius_ratio": 0.35, "occlusion": "rear_shift", "walkable": False},
    "well": {"shape": "circle", "radius_ratio": 0.25, "occlusion": "none", "walkable": False},
    "arch": {"shape": "rectangle", "w_ratio": 0.6, "h_ratio": 0.7, "occlusion": "none", "walkable": True},
    "pillar": {"shape": "rectangle", "w_ratio": 0.2, "h_ratio": 0.7, "occlusion": "none", "walkable": False},
    "grave": {"shape": "rectangle", "w_ratio": 0.3, "h_ratio": 0.25, "occlusion": "rear_shift", "walkable": True},
    "tombstone": {"shape": "rectangle", "w_ratio": 0.2, "h_ratio": 0.3, "occlusion": "rear_shift", "walkable": True},
    "bush": {"shape": "circle", "radius_ratio": 0.3, "occlusion": "rear_shift", "walkable": True},
    "hedge": {"shape": "rectangle", "w_ratio": 0.6, "h_ratio": 0.3, "occlusion": "rear_shift", "walkable": True},
    "fence_section": {"shape": "rectangle", "w_ratio": 0.5, "h_ratio": 0.25, "occlusion": "none", "walkable": True},
    "gate": {"shape": "rectangle", "w_ratio": 0.4, "h_ratio": 0.5, "occlusion": "none", "walkable": True},
    "bridge_piece": {"shape": "rectangle", "w_ratio": 0.8, "h_ratio": 0.2, "occlusion": "none", "walkable": True},
    "wall_section": {"shape": "rectangle", "w_ratio": 0.6, "h_ratio": 0.4, "occlusion": "none", "walkable": False},
    "torch_bracket": {"shape": "rectangle", "w_ratio": 0.15, "h_ratio": 0.25, "occlusion": "none", "walkable": False},
    "banner": {"shape": "rectangle", "w_ratio": 0.2, "h_ratio": 0.4, "occlusion": "none", "walkable": False},
    "tapestry": {"shape": "rectangle", "w_ratio": 0.3, "h_ratio": 0.5, "occlusion": "none", "walkable": False},
    "cauldron": {"shape": "circle", "radius_ratio": 0.2, "occlusion": "rear_shift", "walkable": False},
    "anvil": {"shape": "rectangle", "w_ratio": 0.35, "h_ratio": 0.25, "occlusion": "rear_shift", "walkable": True},
    "barrel": {"shape": "circle", "radius_ratio": 0.2, "occlusion": "rear_shift", "walkable": False},
    "crate": {"shape": "rectangle", "w_ratio": 0.3, "h_ratio": 0.3, "occlusion": "rear_shift", "walkable": False},
    "rock_small": {"shape": "circle", "radius_ratio": 0.15, "occlusion": "rear_shift", "walkable": False},
    "rock_large": {"shape": "circle", "radius_ratio": 0.3, "occlusion": "rear_shift", "walkable": False},
    "tree_small": {"shape": "circle", "radius_ratio": 0.25, "occlusion": "none", "walkable": False},
    "tree_large": {"shape": "circle", "radius_ratio": 0.4, "occlusion": "none", "walkable": False},
    "flower_cluster": {"shape": "circle", "radius_ratio": 0.2, "occlusion": "none", "walkable": False},
    "grass_tuft": {"shape": "circle", "radius_ratio": 0.15, "occlusion": "none", "walkable": False},
    "lamp_post": {"shape": "rectangle", "w_ratio": 0.1, "h_ratio": 0.6, "occlusion": "none", "walkable": False},
    "bench": {"shape": "rectangle", "w_ratio": 0.5, "h_ratio": 0.25, "occlusion": "rear_shift", "walkable": True},
    "urn": {"shape": "circle", "radius_ratio": 0.15, "occlusion": "rear_shift", "walkable": False},
    "barrier_rope": {"shape": "rectangle", "w_ratio": 0.5, "h_ratio": 0.15, "occlusion": "none", "walkable": True},
}

STYLE_HINTS = {
    "pixel_art": "pixel art, 16-bit RPG style, crisp outlines, saturated colors, solid magenta background (#FF00FF)",
    "clean_hd": "clean hand-painted 2D game asset, flat colors, soft shading, solid magenta background (#FF00FF)",
    "retro_pixel": "retro 8-bit pixel art, limited palette, blocky, solid magenta background (#FF00FF)",
}


def scene_object(args):
    input_path = args.get('image_path', '')
    obj_type = args.get('object_type', '')
    output_path = args.get('output_path', './output/scene_object.png')
    style = args.get('style', 'pixel_art')
    cell_size = args.get('cell_size', 128)
    chroma_key = args.get('chroma_key', [255, 0, 255])
    tolerance = args.get('tolerance', 40)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}
    if not obj_type:
        return {'success': False, 'error': 'object_type is required'}

    obj_def = OBJECT_DEFS.get(obj_type)
    if not obj_def:
        available = list(OBJECT_DEFS.keys())
        return {'success': False, 'error': f'Unknown object type: {obj_type}. Available: {", ".join(available)}'}

    style_text = STYLE_HINTS.get(style, STYLE_HINTS['pixel_art'])

    # Open and process
    img = Image.open(input_path).convert('RGBA')
    arr = np.array(img)

    # Chroma key removal
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    tr, tg, tb = chroma_key
    dist = np.sqrt(((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2))
    mask = dist > tolerance
    result_arr = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    result_arr[:, :, :3] = arr[:, :, :3]
    result_arr[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    result = Image.fromarray(result_arr, 'RGBA')

    # Auto-crop to bbox
    alpha = result_arr[:, :, 3]
    pixels = alpha >= 20
    if not pixels.any():
        return {'success': False, 'error': 'No opaque content found after background removal'}

    rows = np.any(pixels, axis=1)
    cols = np.any(pixels, axis=0)
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    cropped = result.crop((xmin, ymin, xmax + 1, ymax + 1))

    # Resize to target cell size while preserving aspect
    cw, ch = cropped.size
    target = cell_size
    scale = target / max(cw, ch)
    new_w = max(1, int(cw * scale))
    new_h = max(1, int(ch * scale))
    final = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

    # Pad to square cell
    padded = Image.new('RGBA', (target, target), (0, 0, 0, 0))
    ox = (target - new_w) // 2
    oy = (target - new_h) // 2
    padded.paste(final, (ox, oy))

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    padded.save(str(out), 'PNG')

    # Build collision metadata
    # Normalize to [0,1] relative to cell size
    rel_x = ox / target
    rel_y = oy / target
    rel_w = new_w / target
    rel_h = new_h / target

    collision = obj_def.copy()
    collision['bbox_normalized'] = [round(rel_x, 4), round(rel_y, 4), round(rel_w, 4), round(rel_h, 4)]
    collision['bbox_pixels'] = [ox, oy, new_w, new_h]
    collision['cell_size'] = target

    return {
        'success': True,
        'output_path': str(out),
        'object_type': obj_type,
        'style': style,
        'final_size': list(padded.size),
        'collision': collision,
        'metadata': {
            'shape': obj_def['shape'],
            'occlusion_policy': obj_def['occlusion'],
            'walkable': obj_def['walkable'],
        },
    }


def scene_object_batch(args):
    """
    Process multiple cells from a prop sheet into individual scene objects.
    Args: image_path, object_types (list), output_dir, cell_size, chroma_key
    """
    input_path = args.get('image_path', '')
    output_dir = args.get('output_dir', './output/scene_objects/')
    object_types = args.get('object_types', [])
    cell_size = args.get('cell_size', 128)
    chroma_key = args.get('chroma_key', [255, 0, 255])
    tolerance = args.get('tolerance', 40)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}
    if not object_types:
        return {'success': False, 'error': 'object_types list is required'}

    src = Image.open(input_path).convert('RGBA')
    sw, sh = src.size
    cols = max(1, sw // cell_size)
    rows = max(1, sh // cell_size)

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    results = []
    for i, obj_type in enumerate(object_types):
        obj_type = obj_type.strip().lower()
        col = i % cols
        row = i // cols
        x0, y0 = col * cell_size, row * cell_size
        cell = src.crop((x0, y0, min(x0 + cell_size, sw), min(y0 + cell_size, sh)))

        obj_result = scene_object({
            'image_path': None,  # already cropped
            'object_type': obj_type,
            'output_path': str(out / f'{obj_type}.png'),
            'cell_size': cell_size,
            'chroma_key': chroma_key,
            'tolerance': tolerance,
        })
        # Override with pre-cropped cell
        obj_result['source_cell'] = [row, col]
        obj_result['pre_cropped'] = True
        results.append(obj_result)

    manifest = {
        'schema': 'dsh-sprite-gen.scene_object_bundle.v1',
        'source': input_path,
        'objects': results,
    }
    (out / 'scene-bundle.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_dir': str(out),
        'objects_processed': len(results),
        'manifest': str(out / 'scene-bundle.json'),
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    cmd = args.pop('command', 'scene_object')
    if cmd == 'scene_object_batch':
        result = scene_object_batch(args)
    else:
        result = scene_object(args)
    print(json.dumps(result))
