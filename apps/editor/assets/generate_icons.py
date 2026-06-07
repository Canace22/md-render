from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

CANVAS_SIZE = 1024
CORNER_RADIUS = 210
ROOT = Path(__file__).resolve().parent
ICONS_DIR = ROOT / "icons"

BACKGROUND_TOP = (13, 48, 70)
BACKGROUND_BOTTOM = (36, 122, 111)
ACCENT_GLOW = (255, 188, 92, 72)
PAPER_FILL = (247, 244, 235, 255)
PAPER_BORDER = (255, 255, 255, 120)
LEFT_PANEL_FILL = (16, 55, 85, 255)
LEFT_GLYPH = (219, 236, 230, 255)
RIGHT_TEXT = (57, 84, 99, 255)
RIGHT_MUTED = (121, 142, 155, 255)
RIGHT_ACCENT = (236, 125, 58, 255)
CARD_SHADOW = (5, 24, 37, 76)

PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
ICONSET_SIZES = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
}


def interpolate_color(start, end, progress):
    return tuple(
        round(start[index] + (end[index] - start[index]) * progress)
        for index in range(3)
    )


def build_background():
    background = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    rounded_mask = Image.new("L", (CANVAS_SIZE, CANVAS_SIZE), 0)
    ImageDraw.Draw(rounded_mask).rounded_rectangle(
        (48, 48, CANVAS_SIZE - 48, CANVAS_SIZE - 48),
        radius=CORNER_RADIUS,
        fill=255,
    )

    gradient = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(CANVAS_SIZE):
        progress = y / (CANVAS_SIZE - 1)
        color = interpolate_color(BACKGROUND_TOP, BACKGROUND_BOTTOM, progress)
        gradient_draw.line((0, y, CANVAS_SIZE, y), fill=(*color, 255))

    accent = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    accent_draw = ImageDraw.Draw(accent)
    accent_draw.ellipse((510, 70, 970, 530), fill=ACCENT_GLOW)
    accent = accent.filter(ImageFilter.GaussianBlur(60))
    gradient.alpha_composite(accent)

    shadow = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (58, 64, CANVAS_SIZE - 40, CANVAS_SIZE - 28),
        radius=CORNER_RADIUS,
        fill=(0, 0, 0, 52),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))

    background.alpha_composite(shadow)
    background.alpha_composite(gradient)
    background.putalpha(rounded_mask)
    return background


def draw_hash(draw, x, y, size):
    stroke = 26
    gap = 54
    horizontal_y = [y + size * 0.33, y + size * 0.63]
    vertical_x = [x + size * 0.34, x + size * 0.62]

    for line_y in horizontal_y:
        draw.rounded_rectangle(
            (x, line_y - stroke / 2, x + size, line_y + stroke / 2),
            radius=stroke / 2,
            fill=LEFT_GLYPH,
        )

    for line_x in vertical_x:
        draw.rounded_rectangle(
            (line_x - stroke / 2, y - gap / 2, line_x + stroke / 2, y + size + gap / 2),
            radius=stroke / 2,
            fill=LEFT_GLYPH,
        )


def draw_icon():
    image = build_background()

    card_shadow = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    card_shadow_draw = ImageDraw.Draw(card_shadow)
    card_shadow_draw.rounded_rectangle(
        (212, 190, 808, 838),
        radius=120,
        fill=CARD_SHADOW,
    )
    card_shadow = card_shadow.filter(ImageFilter.GaussianBlur(26))
    image.alpha_composite(card_shadow)

    draw = ImageDraw.Draw(image)
    paper_bounds = (228, 168, 796, 824)
    draw.rounded_rectangle(
        paper_bounds,
        radius=116,
        fill=PAPER_FILL,
        outline=PAPER_BORDER,
        width=4,
    )

    left_bounds = (266, 208, 466, 784)
    draw.rounded_rectangle(left_bounds, radius=70, fill=LEFT_PANEL_FILL)

    divider_x = 500
    draw.rounded_rectangle(
        (divider_x - 4, 242, divider_x + 4, 752),
        radius=4,
        fill=(216, 224, 226, 255),
    )

    draw_hash(draw, 300, 310, 128)

    left_line_width = 118
    for index, line_y in enumerate((516, 594, 672)):
        length = left_line_width - index * 18
        draw.rounded_rectangle(
            (306, line_y, 306 + length, line_y + 22),
            radius=11,
            fill=(163, 198, 193, 255),
        )

    draw.rounded_rectangle(
        (546, 252, 724, 284),
        radius=16,
        fill=RIGHT_ACCENT,
    )
    draw.rounded_rectangle(
        (548, 330, 704, 356),
        radius=13,
        fill=RIGHT_TEXT,
    )
    draw.rounded_rectangle(
        (548, 390, 654, 414),
        radius=12,
        fill=RIGHT_MUTED,
    )

    preview_box = (548, 468, 726, 634)
    draw.rounded_rectangle(
        preview_box,
        radius=28,
        fill=(255, 255, 255, 132),
        outline=(180, 198, 204, 255),
        width=4,
    )
    draw.rounded_rectangle(
        (580, 506, 694, 534),
        radius=14,
        fill=(120, 193, 164, 255),
    )
    draw.rounded_rectangle(
        (580, 560, 674, 582),
        radius=11,
        fill=RIGHT_MUTED,
    )
    draw.rounded_rectangle(
        (580, 604, 640, 624),
        radius=10,
        fill=RIGHT_MUTED,
    )

    draw.rounded_rectangle(
        (546, 694, 704, 720),
        radius=13,
        fill=RIGHT_TEXT,
    )
    draw.rounded_rectangle(
        (546, 742, 664, 766),
        radius=12,
        fill=RIGHT_MUTED,
    )

    sparkle = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    sparkle_draw = ImageDraw.Draw(sparkle)
    sparkle_draw.polygon(
        [(744, 172), (774, 232), (836, 262), (774, 292), (744, 352), (714, 292), (652, 262), (714, 232)],
        fill=(255, 214, 121, 216),
    )
    sparkle = sparkle.filter(ImageFilter.GaussianBlur(4))
    image.alpha_composite(sparkle)

    return image


def export_sizes(master):
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for size in PNG_SIZES:
        output_path = ICONS_DIR / f"{size}x{size}.png"
        master.resize((size, size), Image.Resampling.LANCZOS).save(output_path)

    master.save(ROOT / "icon.png")


def export_icns(master):
    master.save(
        ROOT / "icon.icns",
        format="ICNS",
        sizes=[(size, size) for size in sorted(set(ICONSET_SIZES.values()))],
    )


def export_ico(master):
    master.save(
        ROOT / "icon.ico",
        format="ICO",
        sizes=[(size, size) for size in PNG_SIZES[:-1]],
    )


def main():
    master = draw_icon()
    export_sizes(master)
    export_icns(master)
    export_ico(master)


if __name__ == "__main__":
    main()
