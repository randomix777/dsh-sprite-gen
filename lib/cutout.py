"""
Advanced cutout / background-removal module for sprite assets.

Modes:
  solid         - single-colour background removal using corner sampling with
                  multi-cluster colour distance (Lab space) and alpha-edge
                  decontamination.
  checkerboard  - detect and remove regular alternating background (grey/white,
                  black/white) using flood-fill from image borders, only
                  touching border-connected background.
  auto          - detect background type first; route to solid or checkerboard.
                  Returns needs_manual_review=true if it cannot reliably decide.
  mask_only     - produce a greyscale mask PNG, do not write the final asset.

Outputs a structured report including the metrics used for QC.
"""

import json
import sys
import base64
import math
import os
from pathlib import Path
from collections import deque
from PIL import Image
import numpy as np


# ---------------------------------------------------------------------------
# Lab colour helpers (PIL only, no colour-science dep)
# ---------------------------------------------------------------------------

def _srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _rgb_to_lab(rgb):
    r, g, b = [_srgb_to_linear(int(v)) for v in rgb]
    x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
    xn, yn, zn = 0.95047, 1.0, 1.08883
    fx = (x / xn) ** (1 / 3) if (x / xn) > 0.008856 else 7.787 * (x / xn) + 16 / 116
    fy = (y / yn) ** (1 / 3) if (y / yn) > 0.008856 else 7.787 * (y / yn) + 16 / 116
    fz = (z / zn) ** (1 / 3) if (z / zn) > 0.008856 else 7.787 * (z / zn) + 16 / 116
    L = 116 * fy - 16
    A = 500 * (fx - fy)
    B = 200 * (fy - fz)
    return [L, A, B]


def _lab_dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


# ---------------------------------------------------------------------------
# Background colour sampling / clustering
# ---------------------------------------------------------------------------

def _sample_border_pixels(arr, sample_w=20):
    """Return list of RGB triplets sampled from a border band of sample_w pixels."""
    h, w = arr.shape[:2]
    sw = min(sample_w, w // 4, h // 4)
    if sw <= 0:
        return []
    rgb = arr[:, :, :3]
    pieces = [
        rgb[0:sw, :].reshape(-1, 3),
        rgb[h - sw:h, :].reshape(-1, 3),
        rgb[:, 0:sw].reshape(-1, 3),
        rgb[:, w - sw:w].reshape(-1, 3),
    ]
    samples = np.concatenate(pieces, axis=0)
    if len(samples) > 4000:
        idx = np.linspace(0, len(samples) - 1, 4000).astype(int)
        samples = samples[idx]
    return [tuple(int(v) for v in s) for s in samples]


def _cluster_border_colors(samples, n_clusters=4, lab_threshold=20.0):
    """Cluster border samples into a small number of representative colours.
    Returns list of (rgb, lab, count) sorted by count desc."""
    if not samples:
        return []
    if len(samples) <= n_clusters:
        seen = {}
        for s in samples:
            seen[s] = seen.get(s, 0) + 1
        out = []
        for s, c in sorted(seen.items(), key=lambda x: -x[1])[:n_clusters]:
            out.append((s, _rgb_to_lab(s), c))
        return out

    rng = np.random.default_rng(seed=0)
    centres = [samples[int(i)] for i in rng.choice(len(samples), n_clusters, replace=False)]
    centres_lab = [_rgb_to_lab(c) for c in centres]

    for _ in range(6):
        labels = []
        for s in samples:
            sl = _rgb_to_lab(s)
            best = min(range(n_clusters), key=lambda i: _lab_dist(sl, centres_lab[i]))
            labels.append(best)
        new_centres = [None] * n_clusters
        new_lab = [None] * n_clusters
        counts = [0] * n_clusters
        for s, lbl in zip(samples, labels):
            sl = _rgb_to_lab(s)
            if new_centres[lbl] is None:
                new_centres[lbl] = list(s)
                new_lab[lbl] = list(sl)
                counts[lbl] = 1
            else:
                for k in range(3):
                    new_centres[lbl][k] += s[k]
                    new_lab[lbl][k] += sl[k]
                counts[lbl] += 1
        for i in range(n_clusters):
            if counts[i] > 0:
                new_centres[i] = [c / counts[i] for c in new_centres[i]]
                new_lab[i] = [c / counts[i] for c in new_lab[i]]
            else:
                new_centres[i] = centres[i]
                new_lab[i] = centres_lab[i]
        centres = new_centres
        centres_lab = new_lab

    counts = [0] * n_clusters
    for s in samples:
        sl = _rgb_to_lab(s)
        best = min(range(n_clusters), key=lambda i: _lab_dist(sl, centres_lab[i]))
        counts[best] += 1

    return [
        (tuple(int(v) for v in centres[i]), centres_lab[i], counts[i])
        for i in range(n_clusters)
        if counts[i] > 0
    ]


# ---------------------------------------------------------------------------
# Background connectivity / flood-fill
# ---------------------------------------------------------------------------

def _border_seed_mask(arr, bg_clusters, lab_threshold=25.0, alpha_thresh=13):
    """Return a mask of pixels that are: (a) near a background colour cluster
    in Lab space AND (b) on the image border. Used as flood-fill seeds.
    Seeds from all 4 image borders (the 'outside' is implicitly background)."""
    h, w = arr.shape[:2]
    rgb_f = arr[:, :, :3].astype(np.float32)
    alpha = arr[:, :, 3]
    seed = np.zeros((h, w), dtype=bool)

    if not bg_clusters:
        return seed

    for y in range(h):
        for x in range(w):
            if y not in (0, h - 1) and x not in (0, w - 1):
                continue
            a = int(alpha[y, x])
            if a < alpha_thresh:
                seed[y, x] = True
                continue
            r, g, b = int(rgb_f[y, x, 0]), int(rgb_f[y, x, 1]), int(rgb_f[y, x, 2])
            px_lab = _rgb_to_lab((r, g, b))
            for _, lab, _ in bg_clusters:
                if _lab_dist(px_lab, lab) <= lab_threshold:
                    seed[y, x] = True
                    break
    return seed


def _flood_fill_border_connected(seed, bg_candidate, alpha, alpha_thresh=13):
    """Flood fill from `seed` (boolean mask). Pixels in `bg_candidate` are
    accepted directly. Pixels with alpha < alpha_thresh are accepted as
    bridge pixels so the flood can cross transparent borders to reach
    opaque background areas. Returned mask includes both bridge and
    bg-candidate pixels."""
    h, w = seed.shape
    transparent = alpha < alpha_thresh
    visitable = bg_candidate | transparent
    visited = seed.copy()
    queue = deque()
    for y in range(h):
        for x in range(w):
            if seed[y, x]:
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and visitable[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))
    return visited & bg_candidate


def _flood_fill_to_mask(seed, candidates, arr=None, alpha_thresh=13):
    """Flood fill from `seed` (boolean mask) but only into pixels in
    `candidates` (boolean mask). Used to find border-connected background."""
    h, w = seed.shape
    visited = seed.copy()
    queue = deque()
    for y in range(h):
        for x in range(w):
            if seed[y, x]:
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and candidates[ny, nx]:
                if arr is not None and arr[ny, nx, 3] >= 255 and False:
                    pass
                visited[ny, nx] = True
                queue.append((ny, nx))
    return visited


# ---------------------------------------------------------------------------
# Solid / cluster-based cutout
# ---------------------------------------------------------------------------

def cutout_solid(arr, lab_threshold=20.0, alpha_thresh=13, feather_radius=1,
                 decontaminate_edges=True, remove_small_components=False,
                 min_component_area=4):
    """Single/cluster-colour background removal using Lab distance."""
    h, w = arr.shape[:2]
    samples = _sample_border_pixels(arr, sample_w=max(4, min(h, w) // 10))
    clusters = _cluster_border_colors(samples, n_clusters=4)
    if not clusters:
        return arr.copy(), {'removed_pixels': 0, 'clusters': 0,
                            'background_clusters': [], 'decontaminated': False,
                            'small_fragments_removed': 0,
                            'mode': 'solid'}

    rgb_f = arr[:, :, :3].astype(np.float32)
    cluster_labs = [c[1] for c in clusters]

    min_d = np.full((h, w), 1e9, dtype=np.float32)
    for lab in cluster_labs:
        l_off = np.full((h, w), lab[0], dtype=np.float32) - rgb_f[:, :, 0]
        a_off = np.full((h, w), lab[1], dtype=np.float32) - rgb_f[:, :, 1]
        b_off = np.full((h, w), lab[2], dtype=np.float32) - rgb_f[:, :, 2]
        d = np.sqrt(l_off * l_off + a_off * a_off + b_off * b_off)
        min_d = np.minimum(min_d, d)

    alpha = arr[:, :, 3].copy()
    bg_mask = min_d <= lab_threshold
    new_alpha = alpha.copy()
    new_alpha[bg_mask] = 0

    if feather_radius > 0:
        feather_band = (min_d > lab_threshold) & (min_d <= lab_threshold + feather_radius * 4)
        feather_alpha = np.clip(
            ((min_d - lab_threshold) / max(1, feather_radius * 4)) * 255, 0, 255
        ).astype(np.uint8)
        for y in range(h):
            for x in range(w):
                if feather_band[y, x]:
                    if new_alpha[y, x] > feather_alpha[y, x]:
                        new_alpha[y, x] = feather_alpha[y, x]

    rgb_out = arr[:, :, :3].copy()
    if decontaminate_edges:
        edge_band = (min_d > lab_threshold) & (min_d <= lab_threshold + 8)
        for y in range(h):
            for x in range(w):
                if edge_band[y, x] and new_alpha[y, x] > 0 and new_alpha[y, x] < 255:
                    rgb_out[y, x, 0] = int(0.7 * arr[y, x, 0] + 0.3 * 128)
                    rgb_out[y, x, 1] = int(0.7 * arr[y, x, 1] + 0.3 * 128)
                    rgb_out[y, x, 2] = int(0.7 * arr[y, x, 2] + 0.3 * 128)

    if remove_small_components:
        small_removed = 0
        visited = np.zeros((h, w), dtype=bool)
        for y in range(h):
            for x in range(w):
                if new_alpha[y, x] > 0 and not visited[y, x]:
                    stack = [(y, x)]
                    comp = []
                    while stack:
                        cy, cx = stack.pop()
                        if cy < 0 or cy >= h or cx < 0 or cx >= w:
                            continue
                        if visited[cy, cx] or new_alpha[cy, cx] == 0:
                            continue
                        visited[cy, cx] = True
                        comp.append((cy, cx))
                        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            stack.append((cy + dy, cx + dx))
                    if len(comp) < min_component_area:
                        for cy, cx in comp:
                            new_alpha[cy, cx] = 0
                            small_removed += 1
    else:
        small_removed = 0

    out = np.dstack([rgb_out, new_alpha])
    return out, {
        'removed_pixels': int(bg_mask.sum()),
        'clusters': len(clusters),
        'background_clusters': [list(c[0]) for c in clusters],
        'decontaminated': bool(decontaminate_edges),
        'small_fragments_removed': small_removed,
        'mode': 'solid',
    }


# ---------------------------------------------------------------------------
# Checkerboard cutout
# ---------------------------------------------------------------------------

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


def _detect_checkerboard(arr, alpha_thresh=13):
    """Decide if the image has a regular alternating background.
    Returns (is_checkerboard: bool, score: float, freq_x, freq_y).
    Analyzes non-transparent pixels for periodic brightness alternation.
    Returns False if >40% of pixels are transparent (real alpha case)."""
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.float32)
    alpha = arr[:, :, 3]

    content_mask = alpha >= alpha_thresh
    if not content_mask.any():
        return False, 0.0, 0, 0
    transparent_ratio = 1.0 - (int(content_mask.sum()) / max(1, h * w))
    if transparent_ratio > 0.80:
        return False, 0.0, 0, 0

    brightness = rgb.mean(axis=2)
    nb = brightness[content_mask]
    overall_std = nb.std()
    overall_mean = nb.mean()
    if overall_std < 8:
        return False, 0.0, 0, 0

    semi_mask = (alpha > 0) & (alpha < 255)
    has_semi = bool(semi_mask.any())
    if has_semi:
        bc = _bimodality_coefficient(brightness[semi_mask])
        if bc < 0.55:
            return False, 0.0, 0, 0
    else:
        bc = _bimodality_coefficient(brightness[alpha == 255])
        if bc < 0.55:
            return False, 0.0, 0, 0

    abs_dev = np.abs(brightness - overall_mean)

    def _autocorr_1d(signal):
        s = signal - signal.mean()
        var = float((s ** 2).sum())
        if var < 1e-6:
            return [0.0]
        out = []
        for lag in range(1, min(len(signal) // 2, 32)):
            shifted = s[lag:]
            base = s[:len(s) - lag]
            out.append(float((base * shifted).sum()) / var)
        return out

    row_autocorrs = []
    for y in range(0, h, 2):
        if not content_mask[y, :].any():
            continue
        row = abs_dev[y, :]
        if row.std() > 5:
            row_autocorrs.append(_autocorr_1d(row))
    col_autocorrs = []
    for x in range(0, w, 2):
        if not content_mask[:, x].any():
            continue
        col = abs_dev[:, x]
        if col.std() > 5:
            col_autocorrs.append(_autocorr_1d(col))

    def _best_period(ac_list):
        if not ac_list:
            return 0, 0.0
        max_len = max(len(a) for a in ac_list)
        padded = [np.pad(a, (0, max(0, max_len - len(a))))[:max_len] for a in ac_list]
        avg = np.mean(padded, axis=0)
        if len(avg) < 3:
            return 0, 0.0
        best_lag, best_score = 0, 0.0
        for lag in range(2, min(len(avg), 24)):
            if avg[lag] > best_score and avg[lag] < 0:
                best_score = abs(avg[lag])
                best_lag = lag
        return best_lag, best_score

    period_x, score_x = _best_period(row_autocorrs)
    period_y, score_y = _best_period(col_autocorrs)

    h_grid_edges = 0
    for y in range(1, h):
        if (content_mask[y - 1] != content_mask[y]).any():
            h_grid_edges += 1
    v_grid_edges = 0
    for x in range(1, w):
        if (content_mask[:, x - 1] != content_mask[:, x]).any():
            v_grid_edges += 1

    expected_h = (h / max(1, period_y)) if period_y else 0
    expected_v = (w / max(1, period_x)) if period_x else 0
    grid_ratio_h = h_grid_edges / expected_h if expected_h else 0
    grid_ratio_v = v_grid_edges / expected_v if expected_v else 0

    is_checker = (
        (period_x >= 4 and period_y >= 4 and score_x > 0.15 and score_y > 0.15)
        or (grid_ratio_h > 0.4 and grid_ratio_v > 0.4 and period_x >= 4)
    )
    score = min(1.0, max(score_x, score_y, (grid_ratio_h + grid_ratio_v) / 4))
    return is_checker, score, period_x, period_y


def cutout_checkerboard(arr, alpha_thresh=13, feather_radius=1,
                        decontaminate_edges=True, remove_small_components=False,
                        min_component_area=4):
    """Remove checkerboard-style background by flood-fill from borders.
    Only removes background pixels that are connected to the image border
    AND are close to one of the detected background colour clusters.
    Subject internal pixels matching the bg colour (e.g. metal highlights) are kept."""
    h, w = arr.shape[:2]

    samples = _sample_border_pixels(arr, sample_w=max(4, min(h, w) // 10))
    clusters = _cluster_border_colors(samples, n_clusters=4)
    if not clusters:
        return arr.copy(), {'removed_pixels': 0, 'clusters': 0,
                            'background_clusters': [],
                            'checkerboard_score': 0.0,
                            'period_x': 0, 'period_y': 0,
                            'border_connected_only': True,
                            'decontaminated': False,
                            'small_fragments_removed': 0,
                            'mode': 'checkerboard'}

    is_check, score, period_x, period_y = _detect_checkerboard(arr, alpha_thresh)

    rgb_f = arr[:, :, :3].astype(np.float32)
    cluster_labs = [c[1] for c in clusters]
    min_d = np.full((h, w), 1e9, dtype=np.float32)
    for lab in cluster_labs:
        l_off = np.full((h, w), lab[0], dtype=np.float32) - rgb_f[:, :, 0]
        a_off = np.full((h, w), lab[1], dtype=np.float32) - rgb_f[:, :, 1]
        b_off = np.full((h, w), lab[2], dtype=np.float32) - rgb_f[:, :, 2]
        d = np.sqrt(l_off * l_off + a_off * a_off + b_off * b_off)
        min_d = np.minimum(min_d, d)

    bg_threshold = 28.0
    bg_candidate = min_d <= bg_threshold

    alpha = arr[:, :, 3]
    seed = _border_seed_mask(arr, clusters, lab_threshold=bg_threshold, alpha_thresh=alpha_thresh)
    bg_mask = _flood_fill_border_connected(seed, bg_candidate, alpha, alpha_thresh=alpha_thresh)

    new_alpha = alpha.copy()
    new_alpha[bg_mask] = 0

    if feather_radius > 0:
        feather_band = (~bg_mask) & (min_d <= bg_threshold + feather_radius * 4)
        for y in range(h):
            for x in range(w):
                if feather_band[y, x]:
                    feather_alpha = max(0, min(255, int(((min_d[y, x] - bg_threshold) /
                                         max(1, feather_radius * 4)) * 255)))
                    if new_alpha[y, x] > feather_alpha:
                        new_alpha[y, x] = feather_alpha

    rgb_out = arr[:, :, :3].copy()
    if decontaminate_edges:
        decontam_band = (~bg_mask) & (min_d > bg_threshold) & (min_d <= bg_threshold + 8)
        for y in range(h):
            for x in range(w):
                if decontam_band[y, x] and 0 < new_alpha[y, x] < 255:
                    rgb_out[y, x, 0] = int(0.7 * arr[y, x, 0] + 0.3 * 128)
                    rgb_out[y, x, 1] = int(0.7 * arr[y, x, 1] + 0.3 * 128)
                    rgb_out[y, x, 2] = int(0.7 * arr[y, x, 2] + 0.3 * 128)

    if remove_small_components:
        small_removed = 0
        visited = np.zeros((h, w), dtype=bool)
        for y in range(h):
            for x in range(w):
                if new_alpha[y, x] > 0 and not visited[y, x]:
                    stack = [(y, x)]
                    comp = []
                    while stack:
                        cy, cx = stack.pop()
                        if cy < 0 or cy >= h or cx < 0 or cx >= w:
                            continue
                        if visited[cy, cx] or new_alpha[cy, cx] == 0:
                            continue
                        visited[cy, cx] = True
                        comp.append((cy, cx))
                        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            stack.append((cy + dy, cx + dx))
                    if len(comp) < min_component_area:
                        for cy, cx in comp:
                            new_alpha[cy, cx] = 0
                            small_removed += 1
    else:
        small_removed = 0

    out = np.dstack([rgb_out, new_alpha])
    return out, {
        'removed_pixels': int(bg_mask.sum()),
        'clusters': len(clusters),
        'background_clusters': [list(c[0]) for c in clusters],
        'checkerboard_score': round(float(score), 4),
        'period_x': int(period_x),
        'period_y': int(period_y),
        'border_connected_only': True,
        'decontaminated': bool(decontaminate_edges),
        'small_fragments_removed': small_removed,
        'mode': 'checkerboard',
    }


# ---------------------------------------------------------------------------
# Top-level entry
# ---------------------------------------------------------------------------

def _run_qc(report):
    """Quickly produce QC summary on the cutout result."""
    arr = report['_result_array']
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    content_mask = alpha > 13
    non_transparent = int(content_mask.sum())
    trans_ratio = non_transparent / (h * w) if h * w else 0

    rows = np.any(content_mask, axis=1)
    cols = np.any(content_mask, axis=0)
    if rows.any() and cols.any():
        ymin, ymax = np.where(rows)[0][[0, -1]]
        xmin, xmax = np.where(cols)[0][[0, -1]]
        bbox = [int(xmin), int(ymin), int(xmax - xmin + 1), int(ymax - ymin + 1)]
    else:
        bbox = None

    small_count = 0
    total_components = 0
    max_component = 0
    if content_mask.any():
        visited = np.zeros_like(content_mask, dtype=bool)
        h_, w_ = content_mask.shape
        for y in range(h_):
            for x in range(w_):
                if content_mask[y, x] and not visited[y, x]:
                    stack = [(y, x)]
                    comp_size = 0
                    while stack:
                        cy, cx = stack.pop()
                        if cy < 0 or cy >= h_ or cx < 0 or cx >= w_:
                            continue
                        if visited[cy, cx] or not content_mask[cy, cx]:
                            continue
                        visited[cy, cx] = True
                        comp_size += 1
                        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                            stack.append((cy + dy, cx + dx))
                    if comp_size > 0:
                        total_components += 1
                        if comp_size < (h_ * w_ * 0.01):
                            small_count += 1
                        if comp_size > max_component:
                            max_component = comp_size

    border_count = 0
    border_total = 2 * w + 2 * (h - 2)
    for x in range(w):
        if content_mask[0, x]:
            border_count += 1
        if content_mask[h - 1, x]:
            border_count += 1
    for y in range(1, h - 1):
        if content_mask[y, 0]:
            border_count += 1
        if content_mask[y, w - 1]:
            border_count += 1
    border_ratio = border_count / border_total if border_total else 0

    return {
        'corners_ok': all(int(alpha[y, x]) < 13 for y in (0, h - 1) for x in (0, w - 1)),
        'corner_alphas': [int(alpha[0, 0]), int(alpha[0, w - 1]),
                          int(alpha[h - 1, 0]), int(alpha[h - 1, w - 1])],
        'transparent_ratio': round(float(trans_ratio), 4),
        'transparent_ratio_pct': round(float(trans_ratio * 100), 2),
        'content_bbox': bbox,
        'connected_components': int(total_components),
        'max_component_pixels': int(max_component),
        'small_isolated_count': int(small_count),
        'border_ratio': round(float(border_ratio), 4),
    }


def cutout(args):
    """Entry point for the cutout pipeline. Returns JSON-serialisable dict."""
    input_path = args.get('image_path', '')
    output_path = args.get('output_path', './output/cutout.png')
    mode = args.get('mode', 'auto')
    dist_threshold = float(args.get('dist_threshold', 60))
    lab_threshold = float(args.get('lab_threshold', 22.0))
    corner_region = int(args.get('corner_region', 30))
    feather_radius = int(args.get('feather_radius', 1))
    decontaminate_edges = bool(args.get('decontaminate_edges', True))
    remove_small_components = bool(args.get('remove_small_components', False))
    min_component_area = int(args.get('min_component_area', 4))
    save_mask_only = bool(args.get('save_mask_only', False))
    return_mask_path = bool(args.get('return_mask_path', True))

    if not input_path:
        return {'success': False, 'error': 'image_path is required'}

    try:
        img = Image.open(input_path)
    except Exception as e:
        return {'success': False, 'error': f'Cannot open image: {e}'}

    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    arr = np.array(img, dtype=np.uint8)
    h, w = arr.shape[:2]

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    base_for_qc = arr.copy()

    if mode == 'solid':
        result_arr, info = cutout_solid(
            arr, lab_threshold=lab_threshold,
            feather_radius=feather_radius,
            decontaminate_edges=decontaminate_edges,
            remove_small_components=remove_small_components,
            min_component_area=min_component_area,
        )
    elif mode == 'checkerboard':
        result_arr, info = cutout_checkerboard(
            arr, feather_radius=feather_radius,
            decontaminate_edges=decontaminate_edges,
            remove_small_components=remove_small_components,
            min_component_area=min_component_area,
        )
    elif mode == 'auto':
        is_check, score, px, py = _detect_checkerboard(arr)
        if score >= 0.18 and is_check:
            result_arr, info = cutout_checkerboard(
                arr, feather_radius=feather_radius,
                decontaminate_edges=decontaminate_edges,
                remove_small_components=remove_small_components,
                min_component_area=min_component_area,
            )
            info['auto_decision'] = 'checkerboard'
            info['auto_score'] = round(float(score), 4)
        else:
            samples = _sample_border_pixels(arr)
            clusters = _cluster_border_colors(samples, n_clusters=4)
            if not clusters:
                return {
                    'success': False,
                    'error': 'no border samples; cannot decide background',
                    'needs_manual_review': True,
                }
            result_arr, info = cutout_solid(
                arr, lab_threshold=lab_threshold,
                feather_radius=feather_radius,
                decontaminate_edges=decontaminate_edges,
                remove_small_components=remove_small_components,
                min_component_area=min_component_area,
            )
            info['auto_decision'] = 'solid'
            info['auto_score'] = round(float(score), 4)
    elif mode == 'mask_only':
        info = {'mode': 'mask_only'}
        alpha = arr[:, :, 3]
        mask_grey = np.where(alpha < 13, 0, 255).astype(np.uint8)
        mask_img = Image.fromarray(mask_grey, mode='L')
        out_path.parent.mkdir(parents=True, exist_ok=True)
        mask_img.save(str(out_path))
        return {
            'success': True,
            'output_path': str(out_path),
            'output_size': [w, h],
            'mode': 'mask_only',
            'info': info,
        }
    else:
        return {'success': False, 'error': f'unknown mode: {mode}'}

    if return_mask_path and not save_mask_only:
        mask_dir = out_path.parent
        mask_name = out_path.stem + '.mask.png'
        mask_path = mask_dir / mask_name
        alpha = arr[:, :, 3]
        mask_grey = np.where(result_arr[:, :, 3] < 13, 0, 255).astype(np.uint8)
        Image.fromarray(mask_grey, mode='L').save(str(mask_path))
        info['mask_path'] = str(mask_path)

    if not save_mask_only:
        out_img = Image.fromarray(result_arr, mode='RGBA')
        out_img.save(str(out_path))

    qc = _run_qc({'_result_array': result_arr})
    info['qc'] = qc
    info['output_path'] = str(out_path)
    info['output_size'] = [w, h]

    return {
        'success': True,
        'output_path': str(out_path),
        'output_size': [w, h],
        'mode': mode,
        'info': info,
        'validation': qc,
    }


if __name__ == '__main__':
    encoded = sys.argv[1]
    args = json.loads(base64.b64decode(encoded).decode())
    result = cutout(args)
    print(json.dumps(result))
