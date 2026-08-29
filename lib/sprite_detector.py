"""
Sprite sheet auto-detector — finds grid size and cell positions from a sprite sheet image.

Usage:
    python sprite_detector.py <input.png> [--min-cell 8] [--max-cell 128]
"""
import sys
import json
import base64
from pathlib import Path
from PIL import Image
import numpy as np


def sprite_detect(args):
    input_path = args.get('image_path', '')
    min_cell = args.get('min_cell', 8)
    max_cell = args.get('max_cell', 128)
    threshold = args.get('threshold', 10)

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    img = Image.open(input_path).convert('RGBA')
    arr = np.array(img)
    h, w = arr.shape[:2]

    # Get alpha channel
    alpha = arr[:, :, 3]
    # Content mask: pixels with alpha > threshold
    mask = alpha > threshold

    # Find rows and columns with content
    row_has_content = mask.any(axis=1)
    col_has_content = mask.any(axis=0)

    if not row_has_content.any() or not col_has_content.any():
        return {'success': False, 'error': 'No content detected in image'}

    # Find contiguous content regions
    rows = np.where(row_has_content)[0]
    cols = np.where(col_has_content)[0]

    # Estimate grid by finding gaps in content
    # Look for rows/cols that are mostly empty
    content_rows = set(rows.tolist())
    content_cols = set(cols.tolist())

    # Find row boundaries (where content starts/stops)
    row_groups = _find_groups(row_has_content)
    col_groups = _find_groups(col_has_content)

    if len(row_groups) < 1 or len(col_groups) < 1:
        return {'success': False, 'error': 'Could not detect grid structure'}

    # Estimate cell sizes
    row_sizes = [g[1] - g[0] for g in row_groups]
    col_sizes = [g[1] - g[0] for g in col_groups]

    # Filter to reasonable sizes
    row_sizes = [s for s in row_sizes if min_cell <= s <= max_cell]
    col_sizes = [s for s in col_sizes if min_cell <= s <= max_cell]

    if not row_sizes or not col_sizes:
        # Try to infer from image dimensions
        # Assume square cells, find best grid
        estimated_cells = _estimate_grid(w, h, min_cell, max_cell)
        if estimated_cells:
            cols, rows = estimated_cells
            return {
                'success': True,
                'detected_grid': {'cols': cols, 'rows': rows},
                'cell_size': {'width': w // cols, 'height': h // rows},
                'total_cells': cols * rows,
                'image_size': [w, h],
            }
        return {'success': False, 'error': 'Could not detect grid'}

    # Use most common cell size
    from collections import Counter
    row_counts = Counter(row_sizes)
    col_counts = Counter(col_sizes)
    avg_row = row_counts.most_common(1)[0][0]
    avg_col = col_counts.most_common(1)[0][0]

    cols = len(col_groups)
    rows = len(row_groups)

    cells = []
    for gi, (r0, r1) in enumerate(row_groups):
        for gj, (c0, c1) in enumerate(col_groups):
            cell = img.crop((c0, r0, c1, r1))
            cells.append({
                'index': gi * cols + gj,
                'row': gi,
                'col': gj,
                'position': [c0, r0],
                'size': [c1 - c0, r1 - r0],
                'has_content': bool(cell.getbbox()),
            })

    return {
        'success': True,
        'detected_grid': {'cols': cols, 'rows': rows},
        'cell_size': {'width': avg_col, 'height': avg_row},
        'total_cells': len(cells),
        'cells_with_content': sum(1 for c in cells if c['has_content']),
        'image_size': [w, h],
        'cells': cells[:20]  # Return first 20 for preview
    }


def _find_groups(bool_array):
    """Find contiguous True groups in a boolean array."""
    groups = []
    in_group = False
    start = 0
    for i, v in enumerate(bool_array):
        if v and not in_group:
            start = i
            in_group = True
        elif not v and in_group:
            groups.append((start, i))
            in_group = False
    if in_group:
        groups.append((start, len(bool_array)))
    return groups


def _estimate_grid(w, h, min_cell, max_cell):
    """Estimate grid from image dimensions assuming roughly square cells."""
    for cols in range(1, 17):
        for rows in range(1, 17):
            cw = w // cols
            ch = h // rows
            if min_cell <= cw <= max_cell and min_cell <= ch <= max_cell:
                return (cols, rows)
    return None


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = sprite_detect(args)
    print(json.dumps(result))
