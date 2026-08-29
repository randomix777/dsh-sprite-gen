"""
Platform strip generator — creates reusable side-scrolling platform assets
(left cap / middle repeat / right cap) with collision metadata.

Usage:
    python platform_strip.py --input sheet.png --type grass --output ./output/platforms/
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np


# Platform type definitions
PLATFORM_TYPES = {
    "grass": {
        "caption": "grass_platform",
        "styles": ["dirt_grass", "snow_grass", "sand_grass", "lava_grass"],
        "strip_layout": "left_cap + 2_middle + right_cap",
        "collision": "top_surface",
    },
    "stone": {
        "caption": "stone_platform",
        "styles": ["gray_stone", "cracked_stone", "mossy_stone"],
        "strip_layout": "left_cap + 2_middle + right_cap",
        "collision": "top_surface",
    },
    "wood": {
        "caption": "wood_platform",
        "styles": ["plank_wood", "rotten_wood", "bridge_wood"],
        "strip_layout": "left_cap + middle + right_cap",
        "collision": "top_surface",
    },
    "ice": {
        "caption": "ice_platform",
        "styles": ["frozen_ice", "cracked_ice"],
        "strip_layout": "left_cap + 2_middle + right_cap",
        "collision": "top_surface",
    },
    "danger": {
        "caption": "hazard_platform",
        "styles": ["spikes", "lava", "poison"],
        "strip_layout": "left_cap + middle + right_cap",
        "collision": "full_block",
    },
}


def build_strip(args):
    input_path = args.get('image_path', '')
    platform_type = args.get('platform_type', 'grass')
    style = args.get('style', None)
    output_dir = args.get('output_dir', './output/platforms/')
    cell_width = args.get('cell_width', 256)
    cell_height = args.get('cell_height', 64)
    chroma_key = args.get('chroma_key', [255, 0, 255])
    tolerance = args.get('tolerance', 40)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    plat_def = PLATFORM_TYPES.get(platform_type)
    if not plat_def:
        return {'success': False, 'error': f'Unknown platform type: {platform_type}. Available: {list(PLATFORM_TYPES.keys())}'}

    if style and style not in plat_def['styles']:
        return {'success': False, 'error': f'Unknown style "{style}" for {platform_type}. Available: {plat_def["styles"]}'}

    src = Image.open(input_path).convert('RGBA')

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Chroma key removal helper
    def remove_bg(img):
        arr = np.array(img)
        r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
        tr, tg, tb = chroma_key
        dist = np.sqrt(((r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2))
        mask = dist > tolerance
        result = np.zeros_like(arr)
        result[:, :, :3] = arr[:, :, :3]
        result[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
        return Image.fromarray(result, 'RGBA')

    # Detect cells in source image
    sw, sh = src.size
    num_cols = max(1, round(sw / cell_width))
    num_rows = max(1, round(sh / cell_height))

    cells = []
    for row in range(num_rows):
        for col in range(num_cols):
            x0, y0 = col * cell_width, row * cell_height
            cell = src.crop((x0, y0, min(x0 + cell_width, sw), y0 + cell_height))
            cell_no_bg = remove_bg(cell)
            # Auto-crop to content
            alpha = np.array(cell_no_bg)[:, :, 3]
            pixels = alpha >= 20
            if pixels.any():
                rows_idx = np.any(pixels, axis=1)
                cols_idx = np.any(pixels, axis=0)
                ymin, ymax = np.where(rows_idx)[0][[0, -1]]
                xmin, xmax = np.where(cols_idx)[0][[0, -1]]
                cell_cropped = cell_no_bg.crop((xmin, ymin, xmax + 1, ymax + 1))
            else:
                cell_cropped = cell_no_bg
            cells.append({
                'index': len(cells),
                'position': [row, col],
                'cropped': cell_cropped,
                'size': cell_cropped.size,
            })

    # Assign cells to strip positions
    # Expected: left_cap, middle(×N), right_cap
    needed = 2 + (num_cols - 2)  # at least left+right + middle repeats
    if len(cells) < 2:
        return {'success': False, 'error': f'Not enough cells detected (got {len(cells)}, need at least 2 for left/right caps)'}

    strip_pieces = []
    positions = []

    # Left cap = first cell
    left = cells[0]
    positions.append(('left_cap', left['size']))
    strip_pieces.append({
        'role': 'left_cap',
        'path': str(out / f'{slug(platform_type)}_left.png'),
        'size': left['size'],
    })
    left['cropped'].save(str(out / f'{slug(platform_type)}_left.png'), 'PNG')

    # Right cap = last cell
    right = cells[-1]
    positions.append(('right_cap', right['size']))
    strip_pieces.append({
        'role': 'right_cap',
        'path': str(out / f'{slug(platform_type)}_right.png'),
        'size': right['size'],
    })
    right['cropped'].save(str(out / f'{slug(platform_type)}_right.png'), 'PNG')

    # Middle cells = all remaining
    middle_cells = cells[1:-1]
    for i, mid in enumerate(middle_cells):
        role = f'middle_{i+1}'
        positions.append((role, mid['size']))
        p = out / f'{slug(platform_type)}_{role}.png'
        mid['cropped'].save(str(p), 'PNG')
        strip_pieces.append({
            'role': role,
            'path': str(p.relative_to(out)),
            'size': mid['size'],
        })

    # Build collision metadata
    collision = {
        'type': plat_def['collision'],
        'surface_alignment': 'top',
        'repeatable': True,
        'segments': [
            {'role': 'left_cap', 'width': left['size'][0]},
            * [{'role': p[0], 'width': p[1][0]} for p in positions[1:-1]],
            {'role': 'right_cap', 'width': right['size'][0]},
        ],
    }

    # Combined strip image
    total_w = sum(p['size'][0] for p in strip_pieces)
    max_h = max(p['size'][1] for p in strip_pieces)
    combined = Image.new('RGBA', (total_w, max_h), (0, 0, 0, 0))
    cx = 0
    for piece in strip_pieces:
        pw, ph = piece['size']
        combined.paste(piece['cropped'] if False else Image.open(str(out / Path(piece['path']).name)), (cx, (max_h - ph) // 2))
        cx += pw

    combined.save(str(out / f'{slug(platform_type)}_strip.png'), 'PNG')

    manifest = {
        'schema': 'dsh-sprite-gen.platform_strip.v1',
        'platform_type': platform_type,
        'style': style or plat_def['styles'][0],
        'source': input_path,
        'cell_size': [cell_width, cell_height],
        'strip_layout': plat_def['strip_layout'],
        'collision': collision,
        'pieces': [
            {'role': p['role'], 'path': p['path'], 'size': p['size']}
            for p in strip_pieces
        ],
        'combined': str(out / f'{slug(platform_type)}_strip.png'),
    }
    (out / 'platform-strip.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_dir': str(out),
        'platform_type': platform_type,
        'style': style or plat_def['styles'][0],
        'pieces_extracted': len(strip_pieces),
        'manifest': str(out / 'platform-strip.json'),
        'collision': collision,
    }


def slug(value):
    import re
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-") or "strip"


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = build_strip(args)
    print(json.dumps(result))
