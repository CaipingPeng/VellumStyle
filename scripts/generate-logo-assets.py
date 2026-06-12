#!/usr/bin/env python3
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
LOGO_ROOT = ROOT / "logos" / "vellumstyle"
ROUND_DIR = LOGO_ROOT / "round-1"
FINAL_DIR = LOGO_ROOT / "final"
SVG_DIR = FINAL_DIR / "svg"

INK = "#1A1A1E"
MUTED = "#6B6B76"
INDIGO = "#5E6AD2"
INDIGO_DARK = "#4F5BC4"
GREEN = "#2BA471"
PAPER = "#F8F9FC"
WHITE = "#FFFFFF"

FONT_CN = Path("C:/Windows/Fonts/msyhbd.ttc")
FONT_CN_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
FONT_LATIN = Path("C:/Windows/Fonts/seguisb.ttf")
FONT_LATIN_REGULAR = Path("C:/Windows/Fonts/segoeui.ttf")


def ensure_dirs() -> None:
    for path in (ROUND_DIR, FINAL_DIR, SVG_DIR):
        path.mkdir(parents=True, exist_ok=True)


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


def scale_points(points: list[tuple[float, float]], s: int) -> list[tuple[int, int]]:
    return [(round(x * s), round(y * s)) for x, y in points]


def cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 72,
) -> list[tuple[float, float]]:
    out = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        x = (u**3 * p0[0]) + (3 * u * u * t * p1[0]) + (3 * u * t * t * p2[0]) + (t**3 * p3[0])
        y = (u**3 * p0[1]) + (3 * u * u * t * p1[1]) + (3 * u * t * t * p2[1]) + (t**3 * p3[1])
        out.append((x, y))
    return out


def draw_round_polyline(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[float, float]],
    s: int,
    width: int,
    fill: str,
) -> None:
    sp = scale_points(points, s)
    sw = round(width * s)
    draw.line(sp, fill=rgba(fill), width=sw, joint="curve")
    radius = sw // 2
    for x, y in (sp[0], sp[-1]):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=rgba(fill))


def new_canvas(size: int = 1024, scale: int = 4, bg: str | None = None) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
    fill = (0, 0, 0, 0) if bg is None else rgba(bg)
    img = Image.new("RGBA", (size * scale, size * scale), fill)
    return img, ImageDraw.Draw(img), scale


def downsample(img: Image.Image, size: int = 1024) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def draw_document_outline(draw: ImageDraw.ImageDraw, s: int, color: str, width: int = 54) -> None:
    box = tuple(round(v * s) for v in (238, 132, 786, 872))
    draw.rounded_rectangle(box, radius=88 * s, outline=rgba(color), width=width * s)
    fold = [(672, 136), (790, 252), (690, 252), (690, 154)]
    draw.line(scale_points(fold, s), fill=rgba(color), width=width * s, joint="curve")


def candidate_flow_page() -> Image.Image:
    img, draw, s = new_canvas()
    draw_document_outline(draw, s, INK, 58)
    waves = [
        cubic((338, 360), (444, 282), (538, 432), (650, 356), 86),
        cubic((338, 508), (470, 430), (540, 590), (704, 502), 86),
        cubic((338, 656), (448, 600), (568, 720), (706, 636), 86),
    ]
    for pts in waves:
        draw_round_polyline(draw, pts, s, 44, INK)
    return downsample(img)


def candidate_layout_ripple() -> Image.Image:
    img, draw, s = new_canvas()
    for box in [(262, 252, 450, 344), (262, 410, 392, 488), (262, 556, 450, 648)]:
        draw.rounded_rectangle(tuple(v * s for v in box), radius=18 * s, fill=rgba(INK))
    for y in (298, 452, 598):
        pts = cubic((508, y), (588, y - 64), (668, y + 64), (758, y), 72)
        draw_round_polyline(draw, pts, s, 38, INK)
    draw.rounded_rectangle(tuple(v * s for v in (210, 188, 814, 820)), radius=110 * s, outline=rgba(INK), width=50 * s)
    return downsample(img)


def candidate_wen_current() -> Image.Image:
    img, draw, s = new_canvas()
    draw_round_polyline(draw, cubic((318, 266), (430, 206), (590, 206), (706, 266), 90), s, 54, INK)
    draw_round_polyline(draw, [(512, 282), (512, 730)], s, 62, INK)
    draw_round_polyline(draw, cubic((330, 456), (440, 536), (452, 638), (340, 746), 90), s, 58, INK)
    draw_round_polyline(draw, cubic((694, 456), (580, 536), (570, 640), (684, 746), 90), s, 58, INK)
    draw.rounded_rectangle(tuple(v * s for v in (224, 166, 800, 858)), radius=136 * s, outline=rgba(INK), width=48 * s)
    return downsample(img)


def candidate_preview_sync() -> Image.Image:
    img, draw, s = new_canvas()
    draw.rounded_rectangle(tuple(v * s for v in (182, 188, 842, 836)), radius=104 * s, outline=rgba(INK), width=52 * s)
    draw.line(scale_points([(512, 212), (512, 812)], s), fill=rgba(INK), width=42 * s)
    for y in (330, 432, 534):
        draw_round_polyline(draw, [(278, y), (424, y)], s, 35, INK)
    for box in [(596, 308, 744, 364), (596, 430, 754, 486), (596, 552, 706, 608)]:
        draw.rounded_rectangle(tuple(v * s for v in box), radius=20 * s, fill=rgba(INK))
    arc = cubic((382, 680), (462, 620), (560, 746), (646, 682), 80)
    draw_round_polyline(draw, arc, s, 36, INK)
    return downsample(img)


def candidate_publish_ripple() -> Image.Image:
    img, draw, s = new_canvas()
    draw.rounded_rectangle(tuple(v * s for v in (236, 170, 788, 854)), radius=120 * s, outline=rgba(INK), width=54 * s)
    for y in (362, 488, 614):
        pts = cubic((344, y), (454, y - 66), (570, y + 66), (680, y), 74)
        draw_round_polyline(draw, pts, s, 40, INK)
    draw.ellipse(tuple(v * s for v in (644, 632, 778, 766)), fill=rgba(INK))
    draw_round_polyline(draw, [(678, 699), (742, 699), (714, 672), (742, 699), (714, 726)], s, 22, WHITE)
    return downsample(img)


def save_round_one() -> None:
    candidates = {
        "logomark-flow-page": candidate_flow_page(),
        "logomark-layout-ripple": candidate_layout_ripple(),
        "logomark-wen-current": candidate_wen_current(),
        "logomark-preview-sync": candidate_preview_sync(),
        "logomark-publish-ripple": candidate_publish_ripple(),
    }
    for name, img in candidates.items():
        img.save(ROUND_DIR / f"{name}.png")


def final_symbol(size: int = 1024, colored: bool = True, tile: bool = False) -> Image.Image:
    img, draw, s = new_canvas(size=1024, scale=4, bg=INDIGO if tile else None)
    outline = WHITE if tile else INDIGO
    lines = WHITE if tile else INK
    signal = GREEN

    if tile:
        draw.rounded_rectangle(tuple(v * s for v in (96, 96, 928, 928)), radius=204 * s, fill=rgba(INDIGO))

    draw.rounded_rectangle(tuple(v * s for v in (248, 142, 776, 862)), radius=92 * s, outline=rgba(outline), width=50 * s)

    wave_specs = [
        ((340, 365), (446, 296), (548, 436), (666, 360), 42),
        ((340, 510), (470, 434), (552, 584), (704, 506), 42),
        ((340, 652), (456, 592), (574, 716), (696, 646), 42),
    ]
    for p0, p1, p2, p3, width in wave_specs:
        draw_round_polyline(draw, cubic(p0, p1, p2, p3, 90), s, width, lines)

    if colored:
        draw.ellipse(tuple(v * s for v in (644, 632, 790, 778)), fill=rgba(signal))
        draw_round_polyline(draw, [(682, 705), (748, 705)], s, 20, WHITE)
        draw_round_polyline(draw, [(724, 676), (752, 705), (724, 734)], s, 20, WHITE)

    return downsample(img, size)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if path.exists():
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def text_bbox(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> tuple[int, int]:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=fnt)
    return right - left, bottom - top


def make_wordmark() -> Image.Image:
    img = Image.new("RGBA", (1600, 500), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cn_font = font(FONT_CN, 156)
    en_font = font(FONT_LATIN_REGULAR, 54)
    cn = "文澜排版"
    en = "VellumStyle"
    cn_w, cn_h = text_bbox(draw, cn, cn_font)
    en_w, en_h = text_bbox(draw, en, en_font)
    x = (1600 - cn_w) // 2
    y = 134
    draw.text((x, y), cn, font=cn_font, fill=rgba(INK))
    draw.text(((1600 - en_w) // 2, y + cn_h + 34), en, font=en_font, fill=rgba(MUTED))
    return img


def make_combo(horizontal: bool = True) -> Image.Image:
    if horizontal:
        img = Image.new("RGBA", (2000, 720), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        symbol = final_symbol(520, colored=True, tile=False)
        img.alpha_composite(symbol, (220, 100))
        cn_font = font(FONT_CN, 158)
        en_font = font(FONT_LATIN_REGULAR, 58)
        draw.text((835, 222), "文澜排版", font=cn_font, fill=rgba(INK))
        draw.text((842, 408), "VellumStyle", font=en_font, fill=rgba(MUTED))
        return img

    img = Image.new("RGBA", (1200, 1400), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    symbol = final_symbol(560, colored=True, tile=False)
    img.alpha_composite(symbol, (320, 154))
    cn_font = font(FONT_CN, 142)
    en_font = font(FONT_LATIN_REGULAR, 54)
    cn_w, cn_h = text_bbox(draw, "文澜排版", cn_font)
    en_w, en_h = text_bbox(draw, "VellumStyle", en_font)
    draw.text(((1200 - cn_w) // 2, 782), "文澜排版", font=cn_font, fill=rgba(INK))
    draw.text(((1200 - en_w) // 2, 782 + cn_h + 28), "VellumStyle", font=en_font, fill=rgba(MUTED))
    return img


def make_favicon() -> Image.Image:
    return final_symbol(256, colored=True, tile=True)


def svg_symbol(tile: bool = False) -> str:
    bg = f'<rect width="1024" height="1024" rx="224" fill="{INDIGO}"/>' if tile else ""
    outline = WHITE if tile else INDIGO
    lines = WHITE if tile else INK
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  {bg}
  <path d="M340 365 C446 296 548 436 666 360" fill="none" stroke="{lines}" stroke-width="42" stroke-linecap="round"/>
  <path d="M340 510 C470 434 552 584 704 506" fill="none" stroke="{lines}" stroke-width="42" stroke-linecap="round"/>
  <path d="M340 652 C456 592 574 716 696 646" fill="none" stroke="{lines}" stroke-width="42" stroke-linecap="round"/>
  <rect x="248" y="142" width="528" height="720" rx="92" fill="none" stroke="{outline}" stroke-width="50"/>
  <circle cx="717" cy="705" r="73" fill="{GREEN}"/>
  <path d="M682 705 H748" fill="none" stroke="{WHITE}" stroke-width="20" stroke-linecap="round"/>
  <path d="M724 676 L752 705 L724 734" fill="none" stroke="{WHITE}" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
'''


def svg_wordmark() -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500">
  <text x="800" y="250" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="156" font-weight="700" fill="{INK}">文澜排版</text>
  <text x="800" y="360" text-anchor="middle" font-family="Segoe UI, Inter, sans-serif" font-size="54" font-weight="400" fill="{MUTED}">VellumStyle</text>
</svg>
'''


def svg_combo(horizontal: bool = True) -> str:
    if horizontal:
        return f'''<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="720" viewBox="0 0 2000 720">
  <g transform="translate(220 100) scale(0.5078125)">{svg_symbol(False).split(">", 1)[1].rsplit("</svg>", 1)[0]}</g>
  <text x="835" y="340" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="158" font-weight="700" fill="{INK}">文澜排版</text>
  <text x="842" y="475" font-family="Segoe UI, Inter, sans-serif" font-size="58" font-weight="400" fill="{MUTED}">VellumStyle</text>
</svg>
'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1400" viewBox="0 0 1200 1400">
  <g transform="translate(320 154) scale(0.546875)">{svg_symbol(False).split(">", 1)[1].rsplit("</svg>", 1)[0]}</g>
  <text x="600" y="890" text-anchor="middle" font-family="Microsoft YaHei, Noto Sans SC, sans-serif" font-size="142" font-weight="700" fill="{INK}">文澜排版</text>
  <text x="600" y="1000" text-anchor="middle" font-family="Segoe UI, Inter, sans-serif" font-size="54" font-weight="400" fill="{MUTED}">VellumStyle</text>
</svg>
'''


def save_final() -> None:
    final_symbol(1024, colored=True, tile=False).save(FINAL_DIR / "vellumstyle-logomark.png")
    make_wordmark().save(FINAL_DIR / "vellumstyle-wordmark.png")
    make_combo(horizontal=True).save(FINAL_DIR / "vellumstyle-combo-horizontal.png")
    make_combo(horizontal=False).save(FINAL_DIR / "vellumstyle-combo-vertical.png")
    final_symbol(1024, colored=True, tile=True).save(FINAL_DIR / "vellumstyle-app-icon.png")
    make_favicon().save(FINAL_DIR / "vellumstyle-favicon.png")

    (SVG_DIR / "vellumstyle-logomark.svg").write_text(svg_symbol(False), encoding="utf-8")
    (SVG_DIR / "vellumstyle-app-icon.svg").write_text(svg_symbol(True), encoding="utf-8")
    (SVG_DIR / "vellumstyle-wordmark.svg").write_text(svg_wordmark(), encoding="utf-8")
    (SVG_DIR / "vellumstyle-combo-horizontal.svg").write_text(svg_combo(True), encoding="utf-8")
    (SVG_DIR / "vellumstyle-combo-vertical.svg").write_text(svg_combo(False), encoding="utf-8")

    final_symbol(512, colored=True, tile=True).save(ROOT / "app-icon.png")
    make_favicon().save(ROOT / "public" / "favicon.png")


def main() -> None:
    ensure_dirs()
    save_round_one()
    save_final()
    print(f"Generated logo assets in {LOGO_ROOT}")


if __name__ == "__main__":
    main()
