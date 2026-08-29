"""
Tileset batch generator — slices a terrain atlas into per-terrain tile variants.

Usage:
    python tileset_batch.py <atlas.png> --terrain plain=0,dirt=1 --output ./output/tiles/
"""
import sys
import json
import base64
import re
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import numpy as np


def slug(value):
    result = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return result or "tile"


def tileset_batch(args):
    input_path = args.get('image_path', '')
    output_dir = args.get('output_dir', './output/tileset/')
    terrain_rows = args.get('terrain_rows', [])
    cols = args.get('cols', 8)
    rows = args.get('rows', 4)
    tile_size = args.get('tile_size', 32)
    min_contrast = args.get('min_contrast', 0.05)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    src = Image.open(input_path).convert('RGB')
    src_w, src_h = src.size

    if src_w % cols or src_h % rows:
        return {
            'success': False,
            'error': f'Atlas {src_w}x{src_h} not evenly divisible by {cols}x{rows}'
        }

    cell_w = src_w // cols
    cell_h = src_h // rows
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Parse terrain rows: [{"name": "plain", "row": 0}, {"name": "dirt", "row": 1}]
    row_map = {r['name']: r['row'] for r in terrain_rows} if terrain_rows else {}
    if not row_map:
        # Default: each row is a terrain named after its index
        for r in range(rows):
            row_map[f'terrain_{r}'] = r

    results = []
    warnings = []
    for terrain_name, row_idx in sorted(row_map.items()):
        variants = []
        for col_idx in range(cols):
            x = col_idx * cell_w
            y = row_idx * cell_h
            cell = src.crop((x, y, x + cell_w, y + cell_h))

            # Center-crop to square if needed
            if cell.width != cell.height:
                crop_size = min(cell.width, cell.height)
                x0 = (cell.width - crop_size) // 2
                y0 = (cell.height - crop_size) // 2
                cell = cell.crop((x0, y0, x0 + crop_size, y0 + crop_size))

            # Resize to target tile size
            if cell.size != (tile_size, tile_size):
                cell = cell.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

            # Check contrast
            lum = cell.convert('L')
            stat = ImageStat.Stat(lum)
            contrast = stat.stddev[0] / 255.0
            if contrast < min_contrast:
                warnings.append(f'{terrain_name}-{col_idx+1} low contrast: {contrast:.4f}')

            fname = out / f'{slug(terrain_name)}-{col_idx+1}.png'
            cell.save(fname, 'PNG')
            variants.append({
                'path': str(fname.relative_to(out)),
                'source_cell': [row_idx, col_idx],
                'contrast': round(contrast, 4)
            })

        results.append({'terrain': terrain_name, 'variants': variants})

    # Save manifest
    manifest = {
        'schema': 'dsh-sprite-gen.tileset_bundle.v1',
        'source': input_path,
        'size': [src_w, src_h],
        'grid': {'cols': cols, 'rows': rows},
        'cell_size': [tile_size, tile_size],
        'terrains': results,
        'warnings': warnings
    }
    manifest_path = out / 'tileset-bundle.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_dir': str(out),
        'terrains': len(results),
        'total_tiles': sum(len(r['variants']) for r in results),
        'manifest': str(manifest_path),
        'warnings': warnings
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = tileset_batch(args)
    print(json.dumps(result))
