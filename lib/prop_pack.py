"""
Prop pack generator — batch generate groups of related scene props
with consistent style, extract them from a raw sheet, and output
per-prop PNGs + extraction manifest JSON.

Usage:
    python prop_pack.py <sheet.png> --props rock,barrel,torch --output ./output/props/
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np


# Predefined prop categories with style hints
PROP_CATEGORIES = {
    "rock": {
        "style": "pixel art rock, flat magenta background (#FF00FF), no shadows",
        "variations": ["small", "medium", "large", "cracked"],
        "grid": "2x2",
    },
    "barrel": {
        "style": "pixel art wooden barrel with metal bands, flat magenta background (#FF00FF)",
        "variations": ["full", "broken", "upside-down"],
        "grid": "2x2",
    },
    "torch": {
        "style": "pixel art stone torch with flame, flat magenta background (#FF00FF)",
        "variations": ["lit", "extinguished"],
        "grid": "1x2",
    },
    "chest": {
        "style": "pixel art treasure chest, closed, flat magenta background (#FF00FF)",
        "variations": ["closed", "open", "locked"],
        "grid": "2x1",
    },
    "tree": {
        "style": "pixel art deciduous tree, flat magenta background (#FF00FF)",
        "variations": ["oak", "pine", "dead"],
        "grid": "2x2",
    },
    "flower": {
        "style": "pixel art wildflower cluster, flat magenta background (#FF00FF)",
        "variations": ["daisy", "rose", "tulip", "poppy"],
        "grid": "2x2",
    },
    "grass_clump": {
        "style": "pixel art grass tuft, flat magenta background (#FF00FF)",
        "variations": ["tall", "short", "wavy"],
        "grid": "2x2",
    },
    "sign": {
        "style": "pixel art wooden signpost with blank plaque, flat magenta background (#FF00FF)",
        "variations": ["empty", "arrows", "text"],
        "grid": "1x2",
    },
    "crate": {
        "style": "pixel art wooden crate, flat magenta background (#FF00FF)",
        "variations": ["full", "open", "broken"],
        "grid": "2x2",
    },
    "lantern": {
        "style": "pixel art hanging lantern with flame, flat magenta background (#FF00FF)",
        "variations": ["lit", "out"],
        "grid": "1x2",
    },
}

DEFAULT_PROMPT_TEMPLATES = {
    "rock": "A pixel art rock sprite. Small to medium boulder with rough texture. Flat solid magenta (#FF00FF) background. No shadows. No text.",
    "barrel": "A pixel art wooden barrel sprite with iron bands. Standing upright. Flat solid magenta (#FF00FF) background. No shadows.",
    "torch": "A pixel art stone torch with a bright orange flame. Flat solid magenta (#FF00FF) background.",
    "chest": "A pixel art treasure chest, closed and locked. Wooden planks with metal hinges and a gold lock. Flat solid magenta (#FF00FF) background.",
    "tree": "A pixel art deciduous tree. Full canopy, brown trunk, green leaves. Flat solid magenta (#FF00FF) background.",
    "flower": "A pixel art cluster of wildflowers. Various colors, green stems. Flat solid magenta (#FF00FF) background.",
    "grass_clump": "A pixel art tuft of grass. 3-5 blades curving naturally. Flat solid magenta (#FF00FF) background.",
    "sign": "A pixel art wooden signpost. Rectangular board on a post. Blank plaque ready for text. Flat solid magenta (#FF00FF) background.",
    "crate": "A pixel art wooden shipping crate. Board planks with nail details. Flat solid magenta (#FF00FF) background.",
    "lantern": "A pixel art wrought-iron hanging lantern with a warm glowing flame inside. Flat solid magenta (#FF00FF) background.",
}


def _chroma_key_remove(img, target_color=(255, 0, 255), tolerance=40):
    """Remove magenta background using chroma key, return RGBA."""
    arr = np.array(img.convert('RGBA'))
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    tr, tg, tb = target_color
    dist = np.sqrt(((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2))
    mask = dist > tolerance
    result = np.zeros((arr.shape[0], arr.shape[1], 4), dtype=np.uint8)
    result[:, :, :3] = arr[:, :, :3]
    result[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    return Image.fromarray(result, 'RGBA')


def _auto_crop_to_bbox(img, min_alpha=20):
    """Crop to bounding box of non-transparent pixels."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    pixels = alpha >= min_alpha
    if not pixels.any():
        return img
    rows = np.any(pixels, axis=1)
    cols = np.any(pixels, axis=0)
    ymin, ymax = np.where(rows)[0][[0, -1]]
    xmin, xmax = np.where(cols)[0][[0, -1]]
    return img.crop((xmin, ymin, xmax + 1, ymax + 1))


def prop_pack(args):
    input_path = args.get('image_path', '')
    output_dir = args.get('output_dir', './output/prop_pack/')
    props = args.get('props', [])
    category = args.get('category', '')
    cell_size = args.get('cell_size', 128)
    chroma_key = args.get('chroma_key', [255, 0, 255])
    tolerance = args.get('tolerance', 40)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    # If no props specified, try to auto-populate from category
    if not props and category:
        cat_info = PROP_CATEGORIES.get(category, {})
        variations = cat_info.get('variations', ['default'])
        props = [f'{category}_{v}' for v in variations]
        if category not in PROP_CATEGORIES:
            props = [category]
    elif not props:
        return {
            'success': False,
            'error': 'props list is required. Provide either "props" or "category".',
            'hint': 'Use sprite_generate_prop_pack with a category like "rock" or "barrel"'
        }

    src = Image.open(input_path).convert('RGBA')
    sw, sh = src.size

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Estimate grid from image size and cell_size
    cols = max(1, sw // cell_size)
    rows = max(1, sh // cell_size)

    if cols * rows < len(props):
        return {'success': False, 'error': f'Image too small for {len(props)} props (need {cols}x{rows}+ cells)'}

    results = []
    for i, prop_name in enumerate(props):
        prop_name = prop_name.strip().lower()
        col = i % cols
        row = i // cols

        # Crop cell
        x0, y0 = col * cell_size, row * cell_size
        cell = src.crop((x0, y0, min(x0 + cell_size, sw), min(y0 + cell_size, sh)))

        # Remove magenta background
        ck_color = tuple(chroma_key)
        cell_no_bg = _chroma_key_remove(cell, ck_color, tolerance)
        cell_cropped = _auto_crop_to_bbox(cell_no_bg)

        # Save
        fname = out / f'{prop_name}.png'
        cell_cropped.save(str(fname), 'PNG')

        results.append({
            'name': prop_name,
            'path': str(fname.relative_to(out)),
            'source_cell': [row, col],
            'final_size': list(cell_cropped.size),
            'has_content': cell_cropped.getbbox() is not None,
        })

    # Save manifest
    manifest = {
        'schema': 'dsh-sprite-gen.prop_bundle.v1',
        'source': input_path,
        'size': [sw, sh],
        'grid': {'cols': cols, 'rows': rows},
        'cell_size': [cell_size, cell_size],
        'chroma_key': chroma_key,
        'props': results,
    }
    manifest_path = out / 'prop-bundle.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_dir': str(out),
        'props_extracted': len(results),
        'manifest': str(manifest_path),
        'props': results,
    }


def prop_pack_generate(args):
    """
    Generate a prop pack: create AI prompts for a category, generate the sheet,
    then extract individual props.
    Returns both the raw sheet path and the extraction result.
    """
    input_path = args.get('image_path', '')
    category = args.get('category', 'rock')
    output_dir = args.get('output_dir', f'./output/prop_pack_{category}/')
    prompt_override = args.get('prompt')
    cell_size = args.get('cell_size', 128)

    if not input_path:
        return {'success': False, 'error': 'image_path is required (use sprite_generate_image first)'}

    cat_info = PROP_CATEGORIES.get(category, {})
    variations = cat_info.get('variations', ['default'])
    base_style = cat_info.get('style', DEFAULT_PROMPT_TEMPLATES.get(category, ''))

    # Build per-variation prompts
    prop_names = []
    for v in variations:
        prop_names.append(f'{category}_{v}')

    # Run extraction
    result = prop_pack({
        'image_path': input_path,
        'output_dir': output_dir,
        'props': prop_names,
        'cell_size': cell_size,
    })

    result['category'] = category
    result['variations'] = variations
    result['style_hint'] = base_style
    return result


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    cmd = args.pop('command', 'prop_pack')
    if cmd == 'prop_pack_generate':
        result = prop_pack_generate(args)
    else:
        result = prop_pack(args)
    print(json.dumps(result))
