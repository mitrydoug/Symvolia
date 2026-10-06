#!/usr/bin/env python3
"""Generate two logo variations for Symvolia."""
import math
import os


def pt(cx, cy, r, deg):
    """Point on circle at angle (0°=right, clockwise in SVG coords)."""
    a = math.radians(deg)
    return (cx + r * math.cos(a), cy + r * math.sin(a))


# ─────────────────────────────────────────────────────────────
# VARIATION A — MOSAIC RING
# Six thick arc segments forming a ring with gaps between them.
# Represents many individual contributions assembled into a whole.
# ─────────────────────────────────────────────────────────────

COLORS_A = [
    "#0E2A4F",  # deep navy
    "#1A3C6E",  # primary blue
    "#2E6B8A",  # teal-blue
    "#7A6242",  # warm transition
    "#C4713B",  # primary terracotta
    "#D89860",  # light terracotta
]


def ring_arcs(cx, cy, r, sw, n=6, gap_deg=12):
    """Generate <path> elements for n arc segments."""
    seg_deg = 360 / n - gap_deg
    paths = []
    for i in range(n):
        start = i * (360 / n) + gap_deg / 2 - 90  # top-start
        end = start + seg_deg
        sx, sy = pt(cx, cy, r, start)
        ex, ey = pt(cx, cy, r, end)
        large = 1 if seg_deg > 180 else 0
        paths.append(
            f'  <path d="M {sx:.2f},{sy:.2f} A {r},{r} 0 {large},1 '
            f'{ex:.2f},{ey:.2f}" fill="none" stroke="{COLORS_A[i]}" '
            f'stroke-width="{sw}" stroke-linecap="round"/>'
        )
    return "\n".join(paths)


def ring_icon(size, r, sw):
    cx = cy = size / 2
    # Small central dot — the collective that emerges
    dot_r = sw * 0.35
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">\n'
        f"  <title>Symvolia — Mosaic Ring</title>\n"
        f"  <desc>Six arc segments forming a ring — many contributions, one whole.</desc>\n"
        f"{ring_arcs(cx, cy, r, sw)}\n"
        f'  <circle cx="{cx}" cy="{cy}" r="{dot_r:.1f}" fill="#1A3C6E"/>\n'
        f"</svg>"
    )


def ring_logo(icon_size, r, sw, total_w):
    cx = cy = icon_size / 2
    dot_r = sw * 0.35
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {icon_size}">\n'
        f"  <title>Symvolia — Mosaic Ring</title>\n"
        f"{ring_arcs(cx, cy, r, sw)}\n"
        f'  <circle cx="{cx}" cy="{cy}" r="{dot_r:.1f}" fill="#1A3C6E"/>\n'
        f'  <text x="{icon_size + 8}" y="{icon_size * 0.66:.0f}" '
        f"font-family=\"Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif\" "
        f'font-size="36" font-weight="400" fill="#1A3C6E" '
        f'letter-spacing="1.5">Symvolia</text>\n'
        f"</svg>"
    )


# ─────────────────────────────────────────────────────────────
# VARIATION B — CONVERGENCE
# Seven leaf/petal shapes pointing inward toward a shared center.
# Represents many voices converging on collective expression.
# ─────────────────────────────────────────────────────────────

COLORS_B = [
    "#1A3C6E",  # primary blue
    "#2A5A8E",  # steel blue
    "#3A82AE",  # bright blue
    "#4A8A6E",  # sage green
    "#8A7040",  # golden brown
    "#C4713B",  # primary terracotta
    "#D49565",  # light terracotta
]


def petal_path(cx, cy, inner_r, outer_r, half_w, angle_deg, color):
    """
    Draw a leaf/petal as two quadratic Bézier curves.
    Points toward center, widest around the middle.
    """
    a = math.radians(angle_deg)
    rx, ry = math.cos(a), math.sin(a)
    px, py = -math.sin(a), math.cos(a)  # perpendicular

    # Four key points
    ix, iy = cx + inner_r * rx, cy + inner_r * ry  # inner tip (near center)
    ox, oy = cx + outer_r * rx, cy + outer_r * ry  # outer tip

    # Control points at ~55% of the way from inner to outer
    mid_r = inner_r + (outer_r - inner_r) * 0.50
    c1x = cx + mid_r * rx + half_w * px
    c1y = cy + mid_r * ry + half_w * py
    c2x = cx + mid_r * rx - half_w * px
    c2y = cy + mid_r * ry - half_w * py

    return (
        f'  <path d="M {ix:.2f},{iy:.2f} '
        f"Q {c1x:.2f},{c1y:.2f} {ox:.2f},{oy:.2f} "
        f'Q {c2x:.2f},{c2y:.2f} {ix:.2f},{iy:.2f} Z" '
        f'fill="{color}"/>'
    )


def convergence_petals(cx, cy, inner_r, outer_r, half_w, n=7):
    paths = []
    for i in range(n):
        angle = i * (360 / n) - 90  # start from top
        paths.append(petal_path(cx, cy, inner_r, outer_r, half_w, angle, COLORS_B[i]))
    return "\n".join(paths)


def convergence_icon(size, inner_r, outer_r, half_w):
    cx = cy = size / 2
    dot_r = inner_r * 0.55
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">\n'
        f"  <title>Symvolia — Convergence</title>\n"
        f"  <desc>Seven petals converging on a shared center — many voices, one expression.</desc>\n"
        f"{convergence_petals(cx, cy, inner_r, outer_r, half_w)}\n"
        f'  <circle cx="{cx}" cy="{cy}" r="{dot_r:.1f}" fill="#1A3C6E" opacity="0.85"/>\n'
        f"</svg>"
    )


def convergence_logo(icon_size, inner_r, outer_r, half_w, total_w):
    cx = cy = icon_size / 2
    dot_r = inner_r * 0.55
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w} {icon_size}">\n'
        f"  <title>Symvolia — Convergence</title>\n"
        f"{convergence_petals(cx, cy, inner_r, outer_r, half_w)}\n"
        f'  <circle cx="{cx}" cy="{cy}" r="{dot_r:.1f}" fill="#1A3C6E" opacity="0.85"/>\n'
        f'  <text x="{icon_size + 8}" y="{icon_size * 0.66:.0f}" '
        f"font-family=\"Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif\" "
        f'font-size="36" font-weight="400" fill="#1A3C6E" '
        f'letter-spacing="1.5">Symvolia</text>\n'
        f"</svg>"
    )


# ─────────────────────────────────────────────────────────────
# GENERATE ALL FILES
# ─────────────────────────────────────────────────────────────


def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print(f"  ✓ {path}")


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))

    print("Variation A — Mosaic Ring")
    write(f"{base}/variation-a/icon.svg", ring_icon(64, 22, 9))
    write(f"{base}/variation-a/favicon.svg", ring_icon(32, 11, 4.5))
    write(f"{base}/variation-a/logo.svg", ring_logo(64, 22, 9, 280))

    print("\nVariation B — Convergence")
    write(f"{base}/variation-b/icon.svg", convergence_icon(64, 6, 28, 5))
    write(f"{base}/variation-b/favicon.svg", convergence_icon(32, 3, 14, 2.5))
    write(f"{base}/variation-b/logo.svg", convergence_logo(64, 6, 28, 5, 280))

    print("\nDone! Open the SVGs in a browser to preview.")
