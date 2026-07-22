#!/usr/bin/env python3
"""Export final tight-viewBox SVG mark + cream preview PNG."""
import subprocess, pathlib
import seal_lab as L

OUT = pathlib.Path("/Users/dpd/Projects/lamha-kissaten/web/mitsu-seal-tam-mat.svg")
S, U, N = L.S, L.U, L.N
W = N * U
M = 12  # margin
hw = S * W          # half width of hexagon
CX, CY = M + hw, M + W
TOPV = (CX, CY - W)
ULV = (TOPV[0] - S * W, TOPV[1] + 0.5 * W)
total_w = 2 * (M + hw)
total_h = 2 * (M + W)

body = [L.face_group(L.TOP,  S, 0.5, -S, 0.5, *TOPV),
        L.face_group(L.LEFT, S, 0.5,  0,  1,  *ULV),
        L.face_group(L.RIGHT, S, -0.5, 0,  1,  CX, CY)]
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.1f} {total_h:.1f}">\n'
       f'<!-- Mitsu seal "Tam Mật Khối" — isometric cube, 3 faces = 勤 Kin / 律 Ritsu / 創 Sō -->\n'
       f'<g fill="{L.RED}">\n' + "\n".join(body) + '\n</g>\n</svg>\n')
OUT.write_text(svg)

# cream preview
prev = pathlib.Path(__file__).parent / "final_preview.svg"
prev.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000" viewBox="0 0 900 1000">'
                f'<rect width="900" height="1000" fill="{L.CREAM}"/>'
                f'<svg x="170" y="140" width="560" height="620" viewBox="0 0 {total_w:.1f} {total_h:.1f}">'
                f'<g fill="{L.RED}">' + "".join(body) + '</g></svg>'
                f'<text x="450" y="860" text-anchor="middle" font-family="Georgia,serif" font-size="64" letter-spacing="18" fill="{L.RED}">MITSU</text>'
                f'<text x="450" y="905" text-anchor="middle" font-family="Georgia,serif" font-size="22" letter-spacing="8" fill="#8a6a3f">LÂM HÀ KISSATEN</text>'
                f'</svg>')
subprocess.run(["rsvg-convert", "-w", "900", str(prev), "-o", str(prev.with_suffix(".png"))], check=True)
print("exported", OUT)
