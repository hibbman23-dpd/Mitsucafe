#!/usr/bin/env python3
"""Export soft (rounded-stroke) seal variant + cream preview."""
import subprocess, pathlib
import seal_lab as L
from soft_render import cube_soft

D = pathlib.Path(__file__).parent
OUT = pathlib.Path("/Users/dpd/Projects/lamha-kissaten/web/mitsu-seal-tam-mat-soft.svg")
U, S = L.U, L.S
W = L.N * U
w = 0.84 * U
M = w / 2 + 2
hw = S * W
total_w, total_h = 2 * (M + hw), 2 * M + 2 * W
body = cube_soft(w, M + hw, M)
OUT.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total_w:.1f} {total_h:.1f}">\n'
               f'<!-- Mitsu seal "Tam Mật Khối" (soft) — rounded strokes, 勤/律/創 -->\n'
               + body + '\n</svg>\n')

prev = D / "soft_preview.svg"
prev.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1000" viewBox="0 0 900 1000">'
                f'<rect width="900" height="1000" fill="{L.CREAM}"/>'
                f'<svg x="170" y="140" width="560" height="620" viewBox="0 0 {total_w:.1f} {total_h:.1f}">{body}</svg>'
                f'<text x="450" y="860" text-anchor="middle" font-family="Georgia,serif" font-size="64" letter-spacing="18" fill="{L.RED}">MITSU</text>'
                f'<text x="450" y="905" text-anchor="middle" font-family="Georgia,serif" font-size="22" letter-spacing="8" fill="#8a6a3f">LÂM HÀ KISSATEN</text>'
                f'</svg>')
subprocess.run(["rsvg-convert", "-w", "900", str(prev), "-o", str(prev.with_suffix(".png"))], check=True)
print("exported", OUT)
