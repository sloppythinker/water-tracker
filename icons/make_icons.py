"""icon.svg と同じデザインの水滴アイコンを PIL で描画し PNG を出力する。
SVG ラスタライザが無い環境向け。4倍supersamplingしてLANCZOS縮小で滑らかにする。"""
import math
from PIL import Image, ImageDraw

OUT = {"icon-192.png": 192, "icon-512.png": 512, "icon-180.png": 180}
SS = 4  # supersampling


def rounded_rect_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def draw_drop(size):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def sc(v):
        return v * S / 512.0

    # 背景（角丸 #e0f2fe）
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=sc(112), fill=(224, 242, 254, 255))

    # 水滴（円 + 接線三角形で滑らかなティアドロップ）
    cx, cy, r = 256.0, 312.0, 112.0
    apex = (256.0, 100.0)
    dist = cy - apex[1]
    theta = math.acos(r / dist)
    ux, uy = 0.0, -1.0  # C→apex 方向
    def rot(vx, vy, t):
        return (vx * math.cos(t) - vy * math.sin(t), vx * math.sin(t) + vy * math.cos(t))
    d1 = rot(ux, uy, theta)
    d2 = rot(ux, uy, -theta)
    t1 = (cx + r * d1[0], cy + r * d1[1])
    t2 = (cx + r * d2[0], cy + r * d2[1])

    deep = (14, 165, 233, 255)   # #0ea5e9
    light = (56, 189, 248, 255)  # #38bdf8

    d.ellipse([sc(cx - r), sc(cy - r), sc(cx + r), sc(cy + r)], fill=deep)
    d.polygon([(sc(apex[0]), sc(apex[1])), (sc(t1[0]), sc(t1[1])), (sc(t2[0]), sc(t2[1]))], fill=deep)

    # 左側の明るいハイライト（同じ形を少し左上にずらして薄く）
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    off = 14
    hd.ellipse([sc(cx - r - off), sc(cy - r), sc(cx + r - off), sc(cy + r)], fill=light)
    hd.polygon([(sc(apex[0] - off), sc(apex[1])), (sc(t1[0] - off), sc(t1[1])), (sc(t2[0] - off), sc(t2[1]))], fill=light)
    # 水滴内だけに乗せるためマスク
    dropmask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(dropmask)
    dm.ellipse([sc(cx - r), sc(cy - r), sc(cx + r), sc(cy + r)], fill=255)
    dm.polygon([(sc(apex[0]), sc(apex[1])), (sc(t1[0]), sc(t1[1])), (sc(t2[0]), sc(t2[1]))], fill=255)
    img.paste(hl, (0, 0), Image.composite(hl.split()[3], Image.new("L", (S, S), 0), dropmask))

    # 白い光沢の丸
    d.ellipse([sc(212 - 18), sc(300 - 18), sc(212 + 18), sc(300 + 18)], fill=(255, 255, 255, 180))

    return img.resize((size, size), Image.LANCZOS)


for name, size in OUT.items():
    draw_drop(size).save("icons/" + name)
    print("wrote icons/" + name, size)
