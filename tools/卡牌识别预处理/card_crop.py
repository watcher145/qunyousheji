# -*- coding: utf-8 -*-
"""
卡牌识别预处理 —— 武将卡图文字识别的前置裁剪工具。

把一张武将卡（社区卡框架，如 732x1028 的子子杯卡）按固定区域裁剪、放大、
增强对比度，输出一组供视觉精读的 PNG 裁剪图 + 一份识别模板，并打印核验清单。
配合 AI 会话使用：先跑本脚本，再让 AI 逐张 Read 裁剪图转写文字。

用法:
    python card_crop.py <图片或目录>... [-o 输出目录] [--preset none] [--extra 名=x0,y0,x1,y1[,倍数]]...
    例:
        python card_crop.py "C:\\Users\\25040\\Downloads\\第二届子子杯轮首"
        python card_crop.py IMG.jpg --extra line2=150,745,690,790,4

区域倍率按“社区卡框架”（宽高比约 0.712，如 732x1028）标定，按比例缩放适配
其它分辨率的同框架卡。非该框架的卡用 --preset none + --extra 手工指定。
"""
import argparse
import os
import shutil
import sys

from PIL import Image, ImageOps

# 预设区域（x0, y0, x1, y1, 放大倍数），坐标为 732x1028 框架下的比例
PRESET = {
    "full":      (0.0,   0.0,   1.0,   1.0,   1.0),
    "hp":        (0.137, 0.019, 0.820, 0.107, 3),     # 血量点数条
    "left":      (0.027, 0.185, 0.314, 0.710, 2.8),   # 左侧竖列：称号(篆)+名字(楷)
    "title":     (0.082, 0.195, 0.205, 0.447, 6),     # 称号特写（篆书，逐部件核对用）
    "name":      (0.082, 0.418, 0.287, 0.710, 4),     # 名字特写（书法体）
    "skilltext": (0.075, 0.681, 0.956, 0.958, 3),     # 技能描述面板
    "skillname": (0.075, 0.671, 0.260, 0.958, 6),     # 技能名框条（隶书，最易误读）
    "footer":    (0.178, 0.949, 0.902, 0.983, 4),     # 落款：插画/设计
}
BIN_REGIONS = {"title", "skillname"}  # 这两处字最小、字体最花，额外出二值化版

# 需要二值化的区域再出一份 otsu 阈值版
TEMPLATE = """# {stem} 识别模板（由卡牌识别预处理生成，按清单逐项填写，禁止标疑问）

- 文件：{source}
- 势力（左上角书法字）：
- 血量（数 hp 条上的宝珠数）：
- 角色名（name/name 特写；双头武将名中间用“&”连接）：
- 称号（title 特写，篆书：先描部件再定字）：
- 技能1 名（skillname；隶书，走四步核验）：
- 技能1 描述（skilltext 逐行转写，保留原文标点）：
- 技能2 名：
- 技能2 描述：
- 设计师（footer“设计：”）：
- 插画（footer“插画：”，如卡面无则留空）：

## 核验清单（识别完成后逐条自检）
1. 先描形后定字：每个难字先客观记录结构（左右/上下）与判别性笔画，此阶段禁止出现“这是某字”的判断。
2. 候选穷举：按部件组合列出所有常见候选字（歧义时至少 2-3 个），不停在第一个讲得通的词上。
3. 判别笔画核对：对候选字互异的关键笔画逐一回到裁剪图找“存在/缺失”证据。
4. 语义只做终审：字形证据获胜但读起来不顺的候选照样定案；“像某个常用词”不构成证据。
   （教训：釁 的皿式通栏长横曾被读成 難 的隹部——常见词的语义锚定会提前终止搜索。）
"""


def otsu(gray_img):
    hist = gray_img.histogram()
    total = sum(hist)
    sum_all = sum(i * h for i, h in enumerate(hist))
    sum_b = 0.0
    weight_b = 0.0
    best = 0.0
    threshold = 128
    for t in range(256):
        weight_b += hist[t]
        if weight_b == 0:
            continue
        weight_f = total - weight_b
        if weight_f == 0:
            break
        sum_b += t * hist[t]
        mean_b = sum_b / weight_b
        mean_f = (sum_all - sum_b) / weight_f
        between = weight_b * weight_f * (mean_b - mean_f) ** 2
        if between > best:
            best = between
            threshold = t
    return threshold


def crop_region(im, region):
    w, h = im.size
    x0, y0, x1, y1, zoom = region
    box = (
        max(0, min(w, int(x0 * w))),
        max(0, min(h, int(y0 * h))),
        max(0, min(w, int(x1 * w))),
        max(0, min(h, int(y1 * h))),
    )
    if box[2] - box[0] <= 0 or box[3] - box[1] <= 0:
        return None
    part = im.crop(box)
    scale = int(round(zoom * max(1.0, 732.0 / w)))
    if scale > 1:
        part = part.resize((part.width * scale, part.height * scale), Image.LANCZOS)
    return part


def save_variant(part, path, binary=False):
    out = part.convert("L")
    out = ImageOps.autocontrast(out)
    if binary:
        threshold = otsu(out)
        out = out.point(lambda p: 255 if p > threshold else 0)
    out.save(path)


def main():
    parser = argparse.ArgumentParser(description="武将卡图识别预处理：定区裁剪+放大增强+输出识别模板")
    parser.add_argument("inputs", nargs="+", help="图片文件或目录")
    parser.add_argument("-o", "--outdir", help="输出目录（默认：输入目录下 card_crops/）")
    parser.add_argument("--preset", default="zizi", help="区域预设：zizi（默认，社区卡框架）或 none（只用 --extra）")
    parser.add_argument("--extra", action="append", default=[], metavar="名=x0,y0,x1,y1[,倍数]",
                        help="追加区域，坐标为绝对像素（原图坐标系），倍数默认 4")
    parser.add_argument("--no-template", action="store_true", help="不生成识别模板 md")
    args = parser.parse_args()

    regions = {}
    if args.preset != "none":
        regions.update(PRESET)
    for extra in args.extra:
        name, _, coords = extra.partition("=")
        parts = [p.strip() for p in coords.split(",")]
        if len(parts) not in (4, 5):
            sys.exit(f"--extra 格式错误：{extra}（应为 名=x0,y0,x1,y1[,倍数]）")
        zoom = float(parts[4]) if len(parts) == 5 else 4.0
        regions[name.strip()] = (float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3]), zoom)

    files = []
    for path in args.inputs:
        if os.path.isdir(path):
            for entry in sorted(os.listdir(path)):
                if entry.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".bmp")):
                    files.append(os.path.join(path, entry))
        elif os.path.isfile(path):
            files.append(path)
        else:
            sys.exit(f"路径不存在：{path}")
    if not files:
        sys.exit("没有找到图片。")

    for source in files:
        stem = os.path.splitext(os.path.basename(source))[0]
        outdir = args.outdir or os.path.join(os.path.dirname(source), "card_crops", stem)
        os.makedirs(outdir, exist_ok=True)
        im = Image.open(source)
        im.load()
        print(f"\n== {os.path.basename(source)} ({im.width}x{im.height}) -> {outdir}")

        for name, region in regions.items():
            part = crop_region(im, region)
            if part is None:
                print(f"   跳过空区域：{name}")
                continue
            base = os.path.join(outdir, f"{stem}_{name}.png")
            if name == "full":
                shutil.copyfile(source, base)
            else:
                save_variant(part, base)
                if name in BIN_REGIONS:
                    save_variant(part, os.path.join(outdir, f"{stem}_{name}_bin.png"), binary=True)
            print(f"   {os.path.basename(base)}")

        if not args.no_template:
            template_path = os.path.join(outdir, f"{stem}_识别模板.md")
            with open(template_path, "w", encoding="utf-8") as handle:
                handle.write(TEMPLATE.format(stem=stem, source=source))
            print(f"   {os.path.basename(template_path)}")

    print(
        "\n阅读顺序建议：full（整体定框架/势力）→ hp（数宝珠）→ left/title/name（称号篆书+名字）"
        "\n→ skilltext（描述逐行）→ skillname(_bin)（技能名，走四步核验）→ footer（落款）。"
        "\n难字复核：用 --extra 名=x0,y0,x1,y1,倍数 对该字所在小格再裁一版（灰度+二值对照）。"
    )


if __name__ == "__main__":
    main()
