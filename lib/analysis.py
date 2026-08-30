"""
Quality-control analysis for sprite assets.

Performs comprehensive QC on RGBA sprite images:
- Alpha transparency ratio and bounding box
- Edge contact detection
- Connected component analysis (isolated fragments)
- Alpha-edge color decontamination (white fringe)
- Checkerboard pattern detection in background
- Per-frame metrics for sprite sheets
- Grid alignment validation

Usage (called via process_sprites.py):
    analyze({'image_path': '...', 'cell_size': 32, 'grid_cols': 4, 'grid_rows': 4, 'regions': [...]})
"""

import json
import sys
import base64
import math
from PIL import Image
import numpy as np
from collections import deque


def _rgb_dist(a, b):
    """Euclidean RGB distance between two 3-element iterables."""
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _lab_dist(lab1, lab2):
    """Approximate CIE76 Delta-E in Lab space.
    Fast approximation suitable for sprite work; does not require colour-science deps.
    """
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(lab1, lab2)))


def _rgb_to_lab(rgb):
    """Convert an [r,g,b] uint8 triplet to approximate Lab (L,a,b) using the
    simple IPT approximation (no heavy deps). Returns a 3-element list."""
    r, g, b = [v / 255.0 for v in rgb]

    def _f(t):
        return t ** (1 / 3) if t > 0.008856 else (7.787 * t) + (16 / 116)

    x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b

    xn, yn, zn = 0.95047, 1.0, 1.08883
    fx = _f(x / xn)
    fy = _f(y / yn)
    fz = _f(z / zn)

    L = 116 * fy - 16
    a = 500 * (fx - fy)
    b_lab = 200 * (fy - fz)
    return [L, a, b_lab]


def _flood_fill(mask, start, fill_value=255):
    """BFS flood fill on a 2D uint8 mask (0/255). Returns the set of filled coords."""
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    queue = deque([start])
    filled = []
    visited[start[0], start[1]] = True

    while queue:
        y, x = queue.popleft()
        filled.append((y, x))
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and mask[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))
    return filled


def _connected_components(mask):
    """Find all connected components in a binary mask. Returns list of component pixel lists."""
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    components = []

    for y in range(h):
        for x in range(w):
            if mask[y, x] and not visited[y, x]:
                filled = _flood_fill(mask, (y, x), 255)
                for cy, cx in filled:
                    visited[cy, cx] = True
                if filled:
                    components.append(filled)
    return components


def _check_edges(arr, alpha_thresh=13):
    """Check if content touches the four image edges.
    Returns dict with per-edge booleans and overall border_ratio."""
    h, w = arr.shape[:2]
    touches = {'top': False, 'bottom': False, 'left': False, 'right': False}
    border_px = 0
    total_edge = 2 * w + 2 * (h - 2)

    for x in range(w):
        if arr[0, x, 3] >= alpha_thresh:
            touches['top'] = True
            border_px += 1
        if arr[h - 1, x, 3] >= alpha_thresh:
            touches['bottom'] = True
            border_px += 1
    for y in range(1, h - 1):
        if arr[y, 0, 3] >= alpha_thresh:
            touches['left'] = True
            border_px += 1
        if arr[y, w - 1, 3] >= alpha_thresh:
            touches['right'] = True
            border_px += 1

    return {
        'touches': touches,
        'border_ratio': border_px / total_edge if total_edge else 0
    }


def _alpha_fringe_score(arr, alpha_thresh=13, fringe_width=3):
    """Estimate white-fringe / colour-spill on semi-transparent edges.
    Pixels near transparent pixels that are bright-white are flagged as fringe.
    Returns fraction of edge pixels that are fringe."""
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]

    edge_mask = np.zeros_like(alpha, dtype=bool)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if alpha[y, x] >= alpha_thresh:
                neighbor_alpha = [alpha[ny, nx] for ny, nx in
                                  [(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)]]
                if any(na < alpha_thresh for na in neighbor_alpha):
                    edge_mask[y, x] = True

    fringe_count = 0
    edge_total = int(edge_mask.sum())

    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if edge_mask[y, x]:
                r, g, b = arr[y, x, 0], arr[y, x, 1], arr[y, x, 2]
                brightness = (int(r) + int(g) + int(b)) / 3
                if brightness >= 230:
                    fringe_count += 1

    return fringe_count / edge_total if edge_total else 0.0


def _bimodality_coefficient(values):
    """Sarvesh-Wang bimodality coefficient.
    BC = (skewness^2 + 1) / (kurtosis + 3*(n-1)^2/((n-2)*(n-3))).
    BC > 0.555 indicates a bimodal distribution (two peaks)."""
    n = len(values)
    if n < 8:
        return 0.0
    mean = float(values.mean())
    var = float(values.var())
    if var < 1e-6:
        return 0.0
    std = float(var ** 0.5)
    centered = values - mean
    skew = float((centered ** 3).mean()) / (std ** 3)
    kurt_raw = float((centered ** 4).mean()) / (var ** 2)
    if n < 4:
        kurt_excess = kurt_raw - 3.0
    else:
        kurt_excess = kurt_raw - 3.0 * (n - 1) ** 2 / ((n - 2) * (n - 3))
    return (skew ** 2 + 1.0) / (kurt_excess + 3.0 * (n - 1) ** 2 / max(1.0, ((n - 2) * (n - 3))))


def _checkerboard_score(arr, alpha_thresh=13):
    """Detect regular alternating checkerboard background.
    Returns a score 0-1 (0 = no checkerboard, 1 = clear checkerboard).
    Analyzes non-transparent pixels to find periodic brightness alternation.
    Skips detection if >80% of pixels are transparent (genuine-alpha assets)."""
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]

    content_mask = alpha >= alpha_thresh
    transparent_ratio = 1.0 - (int(content_mask.sum()) / max(1, h * w))
    if transparent_ratio > 0.80:
        return 0.0
    if not content_mask.any():
        return 0.0

    rgb = arr[:, :, :3].astype(np.float32)
    brightness = rgb.mean(axis=2)

    nonzero_mask = alpha >= alpha_thresh
    if not nonzero_mask.any():
        return 0.0

    nb = brightness[nonzero_mask]
    std_brightness = nb.std()
    if std_brightness < 5:
        return 0.0

    semi_mask = (alpha > 0) & (alpha < 255)
    has_semi = bool(semi_mask.any())
    if has_semi:
        semi_bc = _bimodality_coefficient(brightness[semi_mask])
        if semi_bc < 0.55:
            return 0.0
    else:
        opaque_bc = _bimodality_coefficient(brightness[alpha == 255])
        if opaque_bc < 0.55:
            return 0.0
    mean_brightness = nb.mean()

    normalized = (brightness - mean_brightness) / (std_brightness + 1e-6)

    h_period = 0
    for row in range(0, h):
        if not nonzero_mask[row, :].any():
            continue
        row_slice = normalized[row, :]
        if len(row_slice) < 4:
            continue
        signs = np.sign(row_slice)
        changes = np.sum(np.abs(np.diff(signs)))
        if changes >= 2:
            h_period += 1

    v_period = 0
    for col in range(0, w):
        if not nonzero_mask[:, col].any():
            continue
        col_slice = normalized[:, col]
        if len(col_slice) < 4:
            continue
        signs = np.sign(col_slice)
        changes = np.sum(np.abs(np.diff(signs)))
        if changes >= 2:
            v_period += 1

    h_period_ratio = h_period / max(1, h)
    v_period_ratio = v_period / max(1, w)

    grid_edge_rows = 0
    for row in range(1, h):
        if (content_mask[row - 1] != content_mask[row]).any():
            grid_edge_rows += 1
    grid_edge_cols = 0
    for col in range(1, w):
        if (content_mask[:, col - 1] != content_mask[:, col]).any():
            grid_edge_cols += 1

    edge_ratio_h = grid_edge_rows / max(1, h)
    edge_ratio_v = grid_edge_cols / max(1, w)

    period_score = (h_period_ratio + v_period_ratio) / 2
    edge_score = (edge_ratio_h + edge_ratio_v) / 2

    is_checkerboard = (
        (h_period_ratio > 0.15 and v_period_ratio > 0.15) or
        (edge_ratio_h > 0.3 and edge_ratio_v > 0.3)
    )

    total_score = (period_score * 0.5 + edge_score * 0.5)
    return min(1.0, total_score) if is_checkerboard else 0.0


def _color_diversity(arr, alpha_thresh=13):
    """Count unique colours among non-transparent pixels (sampled)."""
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    content_mask = alpha >= alpha_thresh

    if not content_mask.any():
        return 0

    content_pixels = arr[content_mask][:, :3]
    if len(content_pixels) > 10000:
        content_pixels = content_pixels[::len(content_pixels) // 10000 + 1]

    unique_colors = set()
    for px in content_pixels:
        unique_colors.add((int(px[0]), int(px[1]), int(px[2])))
    return len(unique_colors)


def _bounding_box(mask):
    """Return (x_min, y_min, x_max, y_max) of a binary mask."""
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any() or not cols.any():
        return None
    y_min, y_max = np.where(rows)[0][[0, -1]]
    x_min, x_max = np.where(cols)[0][[0, -1]]
    return (x_min, y_min, x_max, y_max)


def analyze_frame(arr):
    """Run full QC on a single RGBA frame (numpy uint8, shape [h,w,4]).
    Returns per-frame metrics dict."""
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    alpha_thresh = 13

    content_mask = alpha >= alpha_thresh
    total_pixels = h * w
    non_transparent = int(content_mask.sum())
    trans_ratio = non_transparent / total_pixels

    bbox = _bounding_box(content_mask)
    if bbox:
        x_min, y_min, x_max, y_max = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
        content_w = x_max - x_min + 1
        content_h = y_max - y_min + 1
    else:
        x_min = y_min = x_max = y_max = 0
        content_w = content_h = 0

    edges = _check_edges(arr, alpha_thresh)
    fringe_score = _alpha_fringe_score(arr, alpha_thresh)
    checkerboard = _checkerboard_score(arr, alpha_thresh)
    color_div = _color_diversity(arr, alpha_thresh)

    foreground_mask = content_mask.astype(np.uint8) * 255
    components = _connected_components(foreground_mask)
    if components:
        component_sizes = [len(c) for c in components]
        max_component = int(max(component_sizes))
        small_count = int(sum(1 for s in component_sizes
                         if s < (0.01 * total_pixels)))
    else:
        component_sizes = []
        max_component = 0
        small_count = 0

    return {
        'transparent_ratio': round(float(trans_ratio), 4),
        'non_transparent_pixels': int(non_transparent),
        'content_bbox': [x_min, y_min, content_w, content_h] if bbox else None,
        'edge_touches': edges['touches'],
        'border_ratio': round(float(edges['border_ratio']), 4),
        'alpha_fringe_score': round(float(fringe_score), 4),
        'checkerboard_score': round(float(checkerboard), 4),
        'color_diversity': int(color_div),
        'connected_components': int(len(components)),
        'max_component_pixels': int(max_component),
        'small_isolated_count': int(small_count),
    }


def _validate_grid(arr, grid_cols, grid_rows, cell_size, alpha_thresh=13):
    """Validate that an image can be evenly divided into a grid.
    Returns warnings for non-divisible dimensions."""
    h, w = arr.shape[:2]
    warnings = []
    failures = []

    if w % cell_size != 0:
        warnings.append(f"Width {w} not divisible by cell_size {cell_size}")
    if h % cell_size != 0:
        warnings.append(f"Height {h} not divisible by cell_size {cell_size}")

    if grid_cols * cell_size > w:
        failures.append(f"Grid cols {grid_cols} × cell_size {cell_size} exceeds image width {w}")
    if grid_rows * cell_size > h:
        failures.append(f"Grid rows {grid_rows} × cell_size {cell_size} exceeds image height {h}")

    return {'warnings': warnings, 'failures': failures}


def analyze(args):
    """Main entry point. Handles sprite sheets and single images."""
    input_path = args.get('image_path', '')
    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    cell_size = args.get('cell_size', 32)
    grid_cols = args.get('grid_cols', 0)
    grid_rows = args.get('grid_rows', 0)
    explicit_regions = args.get('regions', None)

    try:
        img = Image.open(input_path)
    except Exception as e:
        return {'success': False, 'error': f'Cannot open image: {e}'}

    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    arr = np.array(img, dtype=np.uint8)
    h, w = arr.shape[:2]
    channels = 4

    grid_validation = {'warnings': [], 'failures': []}
    if grid_cols > 0 and grid_rows > 0:
        grid_validation = _validate_grid(arr, grid_cols, grid_rows, cell_size)

    frames = []
    overall_passed = True
    all_warnings = list(grid_validation['warnings'])
    all_failures = list(grid_validation['failures'])

    if explicit_regions:
        for region in explicit_regions:
            x, y, rw, rh = region.get('x', 0), region.get('y', 0), region.get('w', cell_size), region.get('h', cell_size)
            frame_arr = arr[y:y + rh, x:x + rw]
            fm = analyze_frame(frame_arr)
            fm['region'] = region.get('name', f'x{x}_y{y}')
            frames.append(fm)
    elif grid_cols > 0 and grid_rows > 0:
        cw = w // grid_cols
        ch = h // grid_rows
        for row in range(grid_rows):
            for col in range(grid_cols):
                y0, x0 = row * ch, col * cw
                frame_arr = arr[y0:y0 + ch, x0:x0 + cw]
                fm = analyze_frame(frame_arr)
                fm['region'] = f'r{row}c{col}'
                frames.append(fm)
    else:
        fm = analyze_frame(arr)
        fm['region'] = 'full'
        frames.append(fm)

    severity_counts = {'P0': 0, 'P1': 0, 'P2': 0}
    alpha_thresh = 13

    for fm in frames:
        trans_ratio = fm['transparent_ratio']
        checkerboard = fm.get('checkerboard_score', 0)
        border_ratio = fm.get('border_ratio', 0)
        fringe = fm.get('alpha_fringe_score', 0)
        small_count = fm.get('small_isolated_count', 0)
        edge_touches = fm.get('edge_touches', {})

        if trans_ratio < 0.05:
            all_failures.append(f"[{fm['region']}] Almost fully opaque ({trans_ratio:.1%}) — likely no transparency at all")
            severity_counts['P0'] += 1
        elif checkerboard > 0.35:
            all_failures.append(f"[{fm['region']}] Checkerboard background detected (score={checkerboard:.2f}) — needs cutout")
            severity_counts['P0'] += 1
        elif checkerboard > 0.15:
            all_warnings.append(f"[{fm['region']}] Possible checkerboard pattern (score={checkerboard:.2f})")
            severity_counts['P1'] += 1

        if border_ratio > 0.05:
            all_failures.append(f"[{fm['region']}] Content touches border (ratio={border_ratio:.2f})")
            severity_counts['P0'] += 1
        elif border_ratio > 0.01:
            all_warnings.append(f"[{fm['region']}] Content near border (ratio={border_ratio:.2f})")
            severity_counts['P1'] += 1

        if any(edge_touches.values()):
            all_warnings.append(f"[{fm['region']}] Content touches image edge: {[k for k,v in edge_touches.items() if v]}")
            severity_counts['P2'] += 1

        if fringe > 0.25:
            all_warnings.append(f"[{fm['region']}] Significant white/colour fringe ({fringe:.1%} of edge pixels)")
            severity_counts['P1'] += 1

        if small_count > 3:
            all_warnings.append(f"[{fm['region']}] {small_count} small isolated fragments detected")
            severity_counts['P2'] += 1

        if fm.get('color_diversity', 0) < 3:
            all_failures.append(f"[{fm['region']}] Very low colour diversity ({fm.get('color_diversity', 0)} colours) — likely blank/empty")
            severity_counts['P0'] += 1

        if severity_counts['P0'] > 0:
            overall_passed = False

    severity = 'P0' if severity_counts['P0'] > 0 else 'P1' if severity_counts['P1'] > 0 else 'P2' if severity_counts['P2'] > 0 else 'OK'

    recommended = 'PASS'
    if severity_counts['P0'] > 0:
        recommended = 'FAIL — fix P0 issues before use'
    elif severity_counts['P1'] > 0:
        recommended = 'REVIEW — address P1 warnings; may need manual QC'
    elif severity_counts['P2'] > 0:
        recommended = 'ACCEPT_WITH_NOTES — minor issues present'

    return {
        'success': True,
        'passed': overall_passed,
        'severity': severity,
        'severity_counts': severity_counts,
        'warnings': all_warnings,
        'failures': all_failures,
        'recommended_action': recommended,
        'image_size': [w, h],
        'channels': channels,
        'frames': frames,
        'grid_validation': grid_validation,
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = analyze(args)
    print(json.dumps(result))
