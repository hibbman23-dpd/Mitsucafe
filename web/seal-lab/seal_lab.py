#!/usr/bin/env python3
"""seal-lab: grid matrices -> sheared iso cube SVG -> PNG. Edit matrices, run, LOOK."""
import subprocess, pathlib

D = pathlib.Path(__file__).parent
RED, CREAM = "#B4382B", "#F2EBDD"
U = 20  # cell unit px in local coords

# '#'=red '.'=white  — each string row = one grid row (y), chars = cols (x)
# TOP face 勤 = 堇 (c0-6, bars extend c7 at r1/r3/r5) + 力 (c8-11); col12+row12 = white channels
TOP = """
.#.#.#..####.
########.#.#.
.#...#...#.#.
########.#.#.
.#...#...#.#.
########.#.#.
...#....##.#.
#######.#..#.
...#....##.#.
#######.#.##.
...#....#..#.
#######.#.##.
.............
"""
# LEFT face 律 = 彳 (c0-2) + 聿 (c4-11, stem c8); col3 divider; col12 = white channel
LEFT = """
..#.#####.##.
###.....#....
..#.########.
###.....#....
..#.########.
#.#.....#....
#.#.########.
#.#.....#....
#.#.########.
#.#.....#....
#.#.########.
#.#.....#....
###.########.
"""
# RIGHT face 創 = 倉 (c0-8) + 刂 (c10-12); col9 divider; full 13x13
RIGHT = """
#########.#.#
#.......#.#.#
#.#####.#.#.#
#.#...#.#.#.#
#.#####.#.#.#
#.......#.#.#
#########.#.#
#.......#.#.#
#.#####.#.#.#
#.#...#.#.#.#
#.#.#.#.#.#.#
#.#...#.#.#.#
#########..##
"""

def parse(s):
    rows = [r for r in s.strip().splitlines()]
    return rows

def cells(mat):
    out = []
    for y, row in enumerate(mat):
        for x, c in enumerate(row):
            if c == '#':
                out.append((x, y))
    return out

# face transforms: local (x,y) in px -> screen. matrix(a,b,c,d,e,f)
S = 0.866
N = 13
W = N * U
CX, CY = 500, 420  # center vertex of cube on canvas
# top: origin top vertex; ex=(S,.5) ey=(-S,.5); top vertex = center - (0,2*W*0.5) => center + ex*(-W)?? compute: center = top + W*ex + W*ey = top + (0, W)
TOPV = (CX, CY - W)          # top face local origin (top vertex)
# left: origin ul = top + W*ey
ULV = (TOPV[0] - S * W, TOPV[1] + 0.5 * W)
# right: origin center vertex
def face_group(mat, a, b, c, d, e, f, eps=0.3):
    """Merge horizontal runs + overlap eps to kill antialias seams."""
    g = [f'<g transform="matrix({a},{b},{c},{d},{e},{f})">']
    for y, row in enumerate(parse(mat)):
        x = 0
        while x < len(row):
            if row[x] == '#':
                x0 = x
                while x < len(row) and row[x] == '#':
                    x += 1
                g.append(f'<rect x="{x0*U-eps}" y="{y*U-eps}" width="{(x-x0)*U+2*eps}" height="{U+2*eps}"/>')
            else:
                x += 1
    g.append('</g>')
    return "\n".join(g)

def render():
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">',
           f'<rect width="1000" height="1000" fill="{CREAM}"/>',
           f'<g fill="{RED}" shape-rendering="crispEdges">']
    svg.append(face_group(TOP,  S, 0.5, -S, 0.5, *TOPV))
    svg.append(face_group(LEFT, S, 0.5,  0,  1,  *ULV))
    svg.append(face_group(RIGHT, S, -0.5, 0,  1,  CX, CY))
    svg.append('</g></svg>')
    (D / "cube.svg").write_text("\n".join(svg))

    # flat debug: 3 faces side by side with grid lines
    fw = N * U
    fl = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{3*fw+80}" height="{fw+60}" viewBox="0 0 {3*fw+80} {fw+60}">',
          f'<rect width="100%" height="100%" fill="{CREAM}"/>']
    for i, (mat, name) in enumerate([(TOP, "TOP 勤"), (LEFT, "LEFT 律"), (RIGHT, "RIGHT 創")]):
        ox = 20 + i * (fw + 20)
        fl.append(f'<g transform="translate({ox},40)"><g fill="{RED}" shape-rendering="crispEdges">')
        for (x, y) in cells(parse(mat)):
            fl.append(f'<rect x="{x*U}" y="{y*U}" width="{U}" height="{U}"/>')
        fl.append('</g>')
        for k in range(N + 1):
            fl.append(f'<line x1="{k*U}" y1="0" x2="{k*U}" y2="{fw}" stroke="#0002"/>')
            fl.append(f'<line x1="0" y1="{k*U}" x2="{fw}" y2="{k*U}" stroke="#0002"/>')
        fl.append(f'<text x="0" y="-14" font-size="20" font-family="sans-serif">{name}</text></g>')
    fl.append('</svg>')
    (D / "flat.svg").write_text("\n".join(fl))

    for n in ["cube", "flat"]:
        subprocess.run(["rsvg-convert", "-w", "900", str(D / f"{n}.svg"), "-o", str(D / f"{n}.png")], check=True)
    print("rendered cube.png flat.png")

# lint: report 2-thick red/white runs violations (均) per face
def lint():
    for mat, name, freecols in [(TOP, "TOP", None), (LEFT, "LEFT", None), (RIGHT, "RIGHT", None)]:
        m = parse(mat)
        bad = []
        for y in range(len(m)):
            for x in range(len(m[0]) - 1):
                # 2x2 same-color block = thickness violation
                if y < len(m) - 1:
                    q = {m[y][x], m[y][x+1], m[y+1][x], m[y+1][x+1]}
                    if len(q) == 1:
                        bad.append((x, y, m[y][x]))
        print(name, "2x2 blocks:", bad[:20], f"({len(bad)} total)")

if __name__ == "__main__":
    lint()
    render()
