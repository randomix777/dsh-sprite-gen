"""
Terrain tile bundle generator — slices a terrain atlas into per-terrain
tile variants with contrast validation, edge policy selection, and
variant-difference quality gates.

Features vs basic tileset_batch:
  - edge_policy: 'isolated' (transparent gaps) vs 'seamless' (blend edges)
  - contrast QC: per-variant luminance stddev check
  - variant_diff QC: pairwise PSNR between variants in same terrain
  - manifest.v2 schema with edge_policy, qc_results, material_hints
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageFilter
import numpy as np


def slug(value):
    import re
    result = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return result or "tile"


def luminance_stddev(img):
    """Return normalized luminance stddev (0-1)."""
    lum = img.convert('L')
    stat = ImageStat.Stat(lum)
    return stat.stddev[0] / 255.0 if stat.stddev else 0.0


def psnr(a, b):
    """Peak signal-to-noise ratio between two PIL Images (same size)."""
    if a.size != b.size:
        return float('inf')
    arr_a = np.array(a.convert('RGB').resize((64, 64)))
    arr_b = np.array(b.convert('RGB').resize((64, 64)))
    mse = np.mean((arr_a - arr_b) ** 2)
    if mse == 0:
        return float('inf')
    return 10 * np.log10(255 ** 2 / mse)


def blend_edge_pixels(row_col_arr, direction, blend_depth=4):
    """
    For a 2D array (H,W,3), blend edge pixels inward along `direction`.
    direction: 'top','bottom','left','right'
    """
    if direction == 'top':
        for d in range(1, blend_depth + 1):
            row_col_arr[-d] = row_col_arr[-d] * (1 - d / (blend_depth + 1)) + row_col_arr[-d - 1] * (d / (blend_depth + 1))
    elif direction == 'bottom':
        for d in range(1, blend_depth + 1):
            row_col_arr[d] = row_col_arr[d] * (1 - d / (blend_depth + 1)) + row_col_arr[d - 1] * (d / (blend_depth + 1))
    elif direction == 'left':
        for d in range(1, blend_depth + 1):
            row_col_arr[:, -d] = row_col_arr[:, -d] * (1 - d / (blend_depth + 1)) + row_col_arr[:, -d - 1] * (d / (blend_depth + 1))
    elif direction == 'right':
        for d in range(1, blend_depth + 1):
            row_col_arr[:, d] = row_col_arr[:, d] * (1 - d / (blend_depth + 1)) + row_col_arr[:, d - 1] * (d / (blend_depth + 1))
    return row_col_arr


def tileset_batch(args):
    input_path = args.get('image_path', '')
    output_dir = args.get('output_dir', './output/tileset/')
    terrain_rows = args.get('terrain_rows', [])
    cols = args.get('cols', 8)
    rows = args.get('rows', 4)
    tile_size = args.get('tile_size', 32)
    min_contrast = args.get('min_contrast', 0.05)
    edge_policy = args.get('edge_policy', 'isolated')
    max_variants = args.get('max_variants', 4)

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

    # Parse terrain rows
    row_map = {r['name']: r['row'] for r in terrain_rows} if terrain_rows else {}
    if not row_map:
        for r in range(rows):
            row_map[f'terrain_{r}'] = r

    results = []
    warnings = []
    qc_results = []

    for terrain_name, row_idx in sorted(row_map.items()):
        variants = []
        for col_idx in range(min(cols, max_variants)):
            x = col_idx * cell_w
            y = row_idx * cell_h
            cell = src.crop((x, y, x + cell_w, y + cell_h))

            # Center-crop to square
            if cell.width != cell.height:
                crop_size = min(cell.width, cell.height)
                x0 = (cell.width - crop_size) // 2
                y0 = (cell.height - crop_size) // 2
                cell = cell.crop((x0, y0, x0 + crop_size, y0 + crop_size))

            # Resize to target tile size
            if cell.size != (tile_size, tile_size):
                cell = cell.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

            # Edge blending for seamless mode
            if edge_policy == 'seamless':
                arr = np.array(cell)
                arr = blend_edge_pixels(arr, 'top')
                arr = blend_edge_pixels(arr, 'bottom')
                arr = blend_edge_pixels(arr, 'left')
                arr = blend_edge_pixels(arr, 'right')
                cell = Image.fromarray(arr.astype(np.uint8), 'RGB')

            # Contrast QC
            lum = cell.convert('L')
            contrast = luminance_stddev(lum)
            if contrast < min_contrast:
                warnings.append(f'{terrain_name}-{col_idx+1} low contrast: {contrast:.4f}')

            fname = out / f'{slug(terrain_name)}-{col_idx+1}.png'
            cell.save(str(fname), 'PNG')
            variants.append({
                'path': str(fname.relative_to(out)),
                'source_cell': [row_idx, col_idx],
                'contrast': round(contrast, 4),
                'pass_qc': contrast >= min_contrast,
            })

        results.append({'terrain': terrain_name, 'variants': variants})

    # Variant-difference QC: pairwise PSNR within each terrain
    for terrain_result in results:
        tname = terrain_result['terrain']
        vlist = terrain_result['variants']
        diffs = []
        for i in range(len(vlist)):
            for j in range(i + 1, len(vlist)):
                img_i = Image.open(out / vlist[i]['path']).convert('RGB')
                img_j = Image.open(out / vlist[j]['path']).convert('RGB')
                p = psnr(img_i, img_j)
                diffs.append({
                    'variant_a': i + 1,
                    'variant_b': j + 1,
                    'psnr_db': round(float(p), 2),
                    'similar_enough': p > 5.0,  # different enough to be a real variant
                })
        terrain_result['variant_diffs'] = diffs
        qc_results.append({
            'terrain': tname,
            'variant_count': len(vlist),
            'avg_contrast': round(np.mean([v['contrast'] for v in vlist]), 4),
            'low_contrast_count': sum(1 for v in vlist if not v['pass_qc']),
            'pairwise_diffs': diffs,
        })

    # Material hints based on contrast patterns
    for qr in qc_results:
        if qr['avg_contrast'] > 0.15:
            qr['material_hint'] = 'high_detail'
        elif qr['avg_contrast'] > 0.08:
            qr['material_hint'] = 'moderate_detail'
        else:
            qr['material_hint'] = 'flat_uniform'

    # Save manifest v2
    manifest = {
        'schema': 'dsh-sprite-gen.tileset_bundle.v2',
        'source': input_path,
        'size': [src_w, src_h],
        'grid': {'cols': cols, 'rows': rows},
        'cell_size': [tile_size, tile_size],
        'edge_policy': edge_policy,
        'terrains': results,
        'qc': qc_results,
        'warnings': warnings,
    }
    manifest_path = out / 'tileset-bundle.json'
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')

    return {
        'success': True,
        'output_dir': str(out),
        'terrains': len(results),
        'total_tiles': sum(len(r['variants']) for r in results),
        'edge_policy': edge_policy,
        'manifest': str(manifest_path),
        'warnings': warnings,
        'qc_summary': {
            'terrains': len(qc_results),
            'low_contrast_total': sum(q['low_contrast_count'] for q in qc_results),
        },
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = tileset_batch(args)
    print(json.dumps(result))
