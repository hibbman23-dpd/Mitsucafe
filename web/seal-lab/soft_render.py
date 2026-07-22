#!/usr/bin/env python3
"""Soft variant: matrices -> centerline strokes (round cap/join) in screen space.
Silhouette-touching ends extend to face border so hexagon stays crisp."""
import subprocess, pathlib
import seal_lab as L

D = pathlib.Path(__file__).parent
U, S, N = L.U, L.S, L.N
W = N * U

# Soft register: 2x2-evenness relaxed — fewer, longer strokes; no fragment nubs.
# Diff vs L.TOP: no c3 tip r0; 力 legs = one long c8 vertical + short foot (r9/r11 nubs gone).
SOFT_TOP = """
.#...#..####.
########.#.#.
.#...#...#.#.
########.#.#.
.#...#...#.#.
########.#.#.
...#....##.#.
#######.#..#.
...#....#..#.
#######.#..#.
...#....#..#.
#######.#.##.
.............
"""

def runs(mat):
    """Return (h_segments, v_segments, singles) in cell indices."""
    m = L.parse(mat)
    rows, cols = len(m), max(len(r) for r in m)
    get = lambda x, y: 0 <= y < rows and x < len(m[y]) and m[y][x] == '#'
    hsegs, vsegs, covered = [], [], set()
    for y in range(rows):
        x = 0
        while x < cols:
            if get(x, y):
                x0 = x
                while get(x, y):
                    x += 1
                if x - x0 >= 2:
                    hsegs.append((x0, x - 1, y))
                    covered.update((xi, y) for xi in range(x0, x))
            else:
                x += 1
    for x in range(cols):
        y = 0
        while y < rows:
            if get(x, y):
                y0 = y
                while get(x, y):
                    y += 1
                if y - y0 >= 2:
                    vsegs.append((x, y0, y - 1))
                    covered.update((x, yi) for yi in range(y0, y))
            else:
                y += 1
    singles = [(x, y) for y in range(rows) for x in range(len(m[y]))
               if m[y][x] == '#' and (x, y) not in covered]
    return hsegs, vsegs, singles

def face_soft(mat, a, b, c, d, e, f, w, sil):
    """sil: subset of {'left','top','right','bottom'} = silhouette borders.
    All segments drawn with butt caps; interior ends get a cap-circle (round),
    silhouette-touching ends stay flat AT the border -> hexagon edges razor-crisp."""
    tx = lambda x, y: (a * x + c * y + e, b * x + d * y + f)
    hsegs, vsegs, singles = runs(mat)
    lines, caps = [], []
    def emit(p_from, p_to, flat_from, flat_to):
        (X1, Y1), (X2, Y2) = tx(*p_from), tx(*p_to)
        lines.append(f'<line x1="{X1:.1f}" y1="{Y1:.1f}" x2="{X2:.1f}" y2="{Y2:.1f}"/>')
        for (P, flat) in [((X1, Y1), flat_from), ((X2, Y2), flat_to)]:
            if not flat:
                caps.append(f'<circle cx="{P[0]:.1f}" cy="{P[1]:.1f}" r="{w/2:.1f}"/>')
    for (x0, x1, y) in hsegs:
        yy = (y + 0.5) * U
        fa = x0 == 0 and 'left' in sil
        fb = x1 == N - 1 and 'right' in sil
        xa = 0.0 if fa else (x0 + 0.5) * U
        xb = N * U if fb else (x1 + 0.5) * U
        emit((xa, yy), (xb, yy), fa, fb)
    for (x, y0, y1) in vsegs:
        xx = (x + 0.5) * U
        fa = y0 == 0 and 'top' in sil
        fb = y1 == N - 1 and 'bottom' in sil
        ya = 0.0 if fa else (y0 + 0.5) * U
        yb = N * U if fb else (y1 + 0.5) * U
        emit((xx, ya), (xx, yb), fa, fb)
    for (x, y) in singles:
        X, Y = tx((x + 0.5) * U, (y + 0.5) * U)
        caps.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="{w/2:.1f}"/>')
    return lines, caps

def cube_soft(w, ox, oy):
    """Whole cube, top vertex origin offset (ox,oy). Returns svg elements."""
    topv = (ox, oy)
    ulv = (ox - S * W, oy + 0.5 * W)
    cx, cy = ox, oy + W
    lines, caps = [], []
    for mat, mtx, sil in [(SOFT_TOP, (S, 0.5, -S, 0.5, *topv), {'left', 'top'}),
                          (L.LEFT,  (S, 0.5, 0, 1, *ulv),      {'left', 'bottom'}),
                          (L.RIGHT, (S, -0.5, 0, 1, cx, cy),   {'right', 'bottom'})]:
        ln, cp = face_soft(mat, *mtx, w=w, sil=sil)
        lines += ln
        caps += cp
    return (f'<g stroke="{L.RED}" stroke-width="{w:.1f}" stroke-linecap="butt" fill="none">'
            + "".join(lines) + '</g>'
            + f'<g fill="{L.RED}">' + "".join(caps) + '</g>')

if __name__ == "__main__":
    # compare 2 weights side by side
    hw = S * W
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="700" viewBox="0 0 1300 700">',
           f'<rect width="1300" height="700" fill="{L.CREAM}"/>']
    for i, w in enumerate([0.62 * U, 0.74 * U]):
        svg.append(cube_soft(w, 330 + i * 640, 60))
        svg.append(f'<text x="{330+i*640}" y="650" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#666">w = {w/U:.2f}U</text>')
    svg.append('</svg>')
    (D / "soft_compare.svg").write_text("\n".join(svg))
    subprocess.run(["rsvg-convert", "-w", "1300", str(D / "soft_compare.svg"),
                    "-o", str(D / "soft_compare.png")], check=True)
    print("rendered soft_compare.png")
