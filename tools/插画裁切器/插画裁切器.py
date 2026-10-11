# -*- coding: utf-8 -*-
"""
无名杀 武将插画裁切器（单头将 / 双头将）
=========================================================
· 双击运行 → 图形界面：选模式（单头将/双头将）→ 选图片 → 输出 350x464
· 命令行 / AI 批量：
    python 插画裁切器.py --mode single --out 输出目录 图1.jpg 图2.jpg ...
    python 插画裁切器.py --mode dual   --out 输出目录 双将图.jpg
    （--mode single 时若目录下有多张图可直接传目录：... --out out "D:/图集"）

裁切规则（对照本体 350x464 统计出的构图）：
    脸心 X = 0.50（水平居中） / Y = 0.351（上 1/3） / 脸宽 = 图宽 23.8%
    人物贴边时收紧窗口（不补边，脸会偏离中心），照常出图。
双头将模式额外产出：两张单人图（脸宽占比 0.35）+ 一张左右拼接的合体卡。

依赖：opencv-python（含 FaceDetectorYN）、numpy、Pillow
"""
import argparse
import hashlib
import os
import shutil
import sys
import tempfile
import traceback

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError:
    # 兜底：尝试脚本同目录下的 libs/（便携式依赖）
    _here = os.path.dirname(os.path.abspath(__file__))
    _libs = os.path.join(_here, "libs")
    if os.path.isdir(_libs) and _libs not in sys.path:
        sys.path.insert(0, _libs)
    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as e:
        print("缺少依赖：%s" % e)
        print("请先安装：pip install opencv-python numpy pillow")
        print("或双击同目录的“启动.bat”（会自动挑选已装好依赖的 Python）")
        if len(sys.argv) == 1:
            input("按回车退出...")
        sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))


def model_path():
    """OpenCV 读不了中文路径 → 模型复制到临时 ASCII 路径再加载"""
    src = os.path.join(BASE, "yunet.onnx")
    if all(ord(c) < 128 for c in src):
        return src
    dst = os.path.join(tempfile.gettempdir(), "yunet_%s.onnx" % hashlib.md5(src.encode("utf-8")).hexdigest()[:8])
    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
        shutil.copyfile(src, dst)
    return dst


MODEL = None  # 惰性加载
OUT_SIZE = (350, 464)
ASPECT = OUT_SIZE[0] / OUT_SIZE[1]  # 0.754
NATIVE_CX, NATIVE_CY, NATIVE_FW = 0.50, 0.351, 0.238
# 双头将：两张单人图的脸宽占比 / 拼接半幅的脸宽占比
DUAL_SINGLE_FW = 0.238
# 拼接合体卡里，每半幅的"脸宽占半幅"比例。
# 0.45 → 脸宽 ≈ 0.45×175 = 79px ≈ 整卡宽的 22.5%，与单将卡的脸宽（23.8%）基本一致。
DUAL_HALF_FW = 0.45
CH_MAX_RATIO = 1.6  # 窗口高度上限（相对原图高），超出则收紧
# 分数剪枝：置信度比最高分低超过这个值的检出会被丢掉（典型是"手/拳头/衣饰"被误检成脸）。
# 实测：扬帆出海那张 手 0.78 / 真脸 0.90、0.92 → 0.12 的间距刚好能把手滤掉。
SCORE_GAP = 0.12
# "按头居中"系数：YuNet 给的是【脸框】，但侧脸（尤其戴高帽/发髻大的）的"头"比脸框宽，
# 后脑/帽子偏向脸的背面。用鼻尖在脸框内的相对位置判断朝向，再把裁切中心往背面挪：
#     中心偏移 = (0.5 - 鼻尖相对x) × 脸宽 × HEAD_TURN_K
# 正面脸（鼻尖≈0.5）偏移≈0 → 不受影响；侧脸才生效。1.2 是拿唇枪舌剑那张调出来的。
HEAD_TURN_K = 1.2
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


# ---------------------------------------------------------------- 人脸检测
def make_detector(threshold=0.6):
    global MODEL
    if MODEL is None:
        MODEL = model_path()
    return cv2.FaceDetectorYN.create(MODEL, "", (320, 320), threshold, 0.3, 5000)


def _detect(img, threshold=0.6, tag=1.0):
    """tag: 1.0 = 整图扫（可信） / 0.0 = 放大补扫（备用）。返回值末尾追加一列 tag"""
    h, w = img.shape[:2]
    det = make_detector(threshold)
    det.setInputSize((w, h))
    ok, faces = det.detect(img)
    if faces is None:
        return []
    out = []
    for f in faces:
        if f[14] < threshold:
            continue
        out.append(np.append(np.asarray(f, dtype=np.float32), float(tag)))
    return out


def _tag(f):
    return float(f[15]) if len(f) > 15 else 1.0


def _merge_same_face(faces):
    """同一张脸的多尺度重复检出 → 聚类合并（优先保留整图扫到的，其次比尺寸）"""
    faces = sorted(faces, key=lambda f: (-f[14], -f[2] * f[3]))
    kept = []
    for f in faces:
        x, y, fw, fh = f[:4]
        cx, cy = x + fw / 2, y + fh / 2
        merged = False
        for i, g in enumerate(kept):
            gx, gy, gw, gh = g[:4]
            gcx, gcy = gx + gw / 2, gy + gh / 2
            near = abs(cx - gcx) < 0.8 * max(fw, gw) and abs(cy - gcy) < 0.8 * max(fh, gh)
            similar = 0.5 <= fw / gw <= 2.0
            if near and similar:
                # 合并：整图扫的优先（更可信），同为整图扫时保留更大的框
                if _tag(f) > _tag(g) or (_tag(f) == _tag(g) and fw * fh > gw * gh):
                    kept[i] = f
                merged = True
                break
        if not merged:
            kept.append(f)
    return kept


def detect_faces(img, need=1):
    """先整图扫（阈值 0.6）；**只有高分脸不够 need 张时**才放大 2.5× 补扫（阈值 0.45）。

    ⚠ 放大补扫在复杂背景（花枝/灯笼/鸟/衣纹）上极易刷出大量误检（实测一张 2250px 宽的
      双人插画能刷出 18 张"脸"，还会挑中 183px 的假脸）。所以它受三重限制：
        ① 按需触发（整图扫不够用才跑）② 更高阈值 0.45 ③ 最小尺寸 3% 图宽；
      且结果标记 tag=0，选脸时优先级低于整图扫。
    小脸/侧脸（如荀彧&荀攸页）仍能靠这一步救回。"""
    h, w = img.shape[:2]
    faces = list(_detect(img, 0.6, tag=1.0))
    if sum(1 for f in faces if f[14] >= 0.6) < need:
        scale = 2.5
        big = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        for f in _detect(big, 0.45, tag=0.0):
            g = f.copy()
            g[:4] = g[:4] / scale
            if g[2] >= 0.03 * w:  # 补扫的检出还要够大，滤掉零碎误检
                faces.append(g)
    return _merge_same_face(faces)


def pick_faces(img, need):
    """need=1 单头；need=2 双头。
    单头：取最大脸（附尺寸/得分日志）
    双头：在所有候选里挑「尺寸大 + 彼此分得开」的一对（防同一张脸被当两人）
    返回 (faces, total, warn)"""
    h, w = img.shape[:2]
    faces = detect_faces(img, need)
    # 过滤离谱尺寸（过大=误检，过小=背景）
    faces = [f for f in faces if 0.02 * w <= f[2] <= 0.60 * w]
    total = len(faces)
    # 优先只从"整图扫到"的脸里选；数量不够 need 时才把放大补扫的也算进来
    t1 = [f for f in faces if _tag(f) >= 1.0]
    use = t1 if len(t1) >= need else list(faces)
    cand = []
    for f in use:
        x, y, fw, fh = f[:4]
        # 把裁切中心从"脸框中心"修正为"头的中心"：鼻子偏向框的哪一侧 = 人物朝哪边，
        # 后脑/帽子在反方向 → 中心往那边挪。正面脸偏移≈0，侧脸才生效。
        nose_rel = (float(f[8]) - x) / fw if fw > 0 else 0.5
        nose_rel = min(1.0, max(0.0, nose_rel))
        head_cx = x + fw / 2 + (0.5 - nose_rel) * fw * HEAD_TURN_K
        cand.append((head_cx, y + fh / 2, fw, float(f[14])))
    warn = ""
    if not cand:
        return [], total, warn
    # 分数剪枝：丢掉明显比最高分低的检出。
    # 典型误检（举起的手、拳头、衣饰）置信度通常比真脸低一截，但**框更大**，
    # 若不剪掉，它们会靠"尺寸大"在配对/选大脸时把真脸挤掉
    # （实例：扬帆出海那张，手 72×93@0.78 挤掉了真脸 42×61@0.90）。
    top = max(c[3] for c in cand)
    pruned = [c for c in cand if c[3] >= top - SCORE_GAP]
    if len(pruned) >= need:
        cand = pruned
    # 高分脸优先（≥0.6），没有高分才退而求其次比大小 —— 防止放大重扫的误检被当主脸
    strong = [c for c in cand if c[3] >= 0.6]
    if need == 1:
        pool = strong if strong else cand
        pool.sort(key=lambda t: -(t[2] * t[2]))
        best = pool[0]
        if best[3] < 0.6:
            warn = "（置信度偏低 %.2f，建议检查）" % best[3]
        win_w = best[2] / NATIVE_FW  # 实际裁切窗口宽度
        if win_w < OUT_SIZE[0]:
            warn += "（窗口仅 %dpx 宽，成片是放大出来的，会偏软）" % round(win_w)
        return [(best[0], best[1], best[2])], total, warn
    # 双头：从候选里挑最合适的一对。评分同时看「置信度」和「尺寸」——
    # 置信度权重更高（平方），尺寸只做 0.5 次方，避免大而假的框取胜。
    pool = strong if len(strong) >= 2 else cand
    best_pair, best_score = None, -1
    for i in range(len(pool)):
        for j in range(i + 1, len(pool)):
            a, b = pool[i], pool[j]
            dist = ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5
            min_sep = 1.1 * max(a[2], b[2])
            if dist < min_sep:
                continue  # 太近 → 大概率是同一张脸
            sep_score = min(dist / (2.0 * max(a[2], b[2])), 1.0)
            score = (min(a[3], b[3]) ** 2) * (min(a[2], b[2]) ** 0.5) * (0.5 + sep_score)
            if score > best_score:
                best_score, best_pair = score, (a, b)
    if best_pair is None:
        # 找不到两张分开的脸 → 只返回最大的一张，调用方按"失败"处理
        best = cand[0]
        return [(best[0], best[1], best[2])], total, "（只找到一张脸，双头将需要两张分开的脸）"
    a, b = best_pair
    if min(a[3], b[3]) < 0.6:
        warn = "（有一张脸置信度偏低，建议检查）"
    small_half = min(a[2], b[2]) / DUAL_HALF_FW  # 较小的那张脸对应的半幅宽（会被放大到 175）
    if small_half < OUT_SIZE[0] / 2:
        warn += "（较小的一张脸窗口仅 %dpx 宽，会放大到半幅，偏软）" % round(small_half)
    return [(a[0], a[1], a[2]), (b[0], b[1], b[2])], total, warn


# ---------------------------------------------------------------- 裁切
def crop_window(img, cx, cy, fw, face_ratio=NATIVE_FW, face_x=NATIVE_CX, face_y=NATIVE_CY):
    """按脸定位裁 350x464。人物贴边时收紧窗口（不补边，脸会偏离中心）"""
    h, w = img.shape[:2]
    cw = fw / face_ratio
    ch = cw / ASPECT
    max_ch = h * CH_MAX_RATIO
    if ch > max_ch:
        ch = max_ch
        cw = ch * ASPECT
    # 收紧到图内（贴边就贴边，不补边）
    if ch > h:
        ch = float(h)
        cw = ch * ASPECT
    if cw > w:
        cw = float(w)
        ch = cw / ASPECT
    x0 = max(0.0, min(cx - cw * face_x, w - cw))
    y0 = max(0.0, min(cy - ch * face_y, h - ch))
    crop = img[int(y0):int(y0 + ch), int(x0):int(x0 + cw)]
    out = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).resize(OUT_SIZE, Image.LANCZOS)
    # 脸偏离中心时提示（贴边裁的正常代价）
    off_x = abs((cx - x0) / cw - face_x)
    off_y = abs((cy - y0) / ch - face_y)
    note = "（贴边，脸未居中）" if (off_x > 0.06 or off_y > 0.06) else ""
    return out, note, (x0, y0, cw, ch)


HALF_SIZE = (OUT_SIZE[0] // 2, OUT_SIZE[1])  # 双将卡里每一半的输出尺寸 (175, 464)


def half_crop(img, cx, cy, fw):
    """裁出双将卡的一半：让"脸"占半幅 DUAL_HALF_FW，输出 175×464。
    cx 传入的应是"头心"（pick_faces 已按朝向修正过）。
    返回 (PIL 图, 窗口 (x0, y0, w, h))；窗口越界时收紧到图内（保持 175:464 比例，不补边）。"""
    h, w = img.shape[:2]
    half_w = fw / DUAL_HALF_FW
    half_h = half_w * (464 / 175)
    if half_h > h:  # 源图太矮 → 收紧
        half_h = float(h)
        half_w = half_h * (175 / 464)
    if half_w > w:  # 源图太窄 → 收紧
        half_w = float(w)
        half_h = half_w * (464 / 175)
    half_w_i, half_h_i = max(1, int(round(half_w))), max(1, int(round(half_h)))
    x0 = int(round(max(0.0, min(cx - half_w / 2, w - half_w))))
    y0 = int(round(max(0.0, min(cy - half_h * 0.33, h - half_h))))
    x0 = max(0, min(x0, w - half_w_i))
    y0 = max(0, min(y0, h - half_h_i))
    crop = img[y0:y0 + half_h_i, x0:x0 + half_w_i]
    out = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).resize(HALF_SIZE, Image.LANCZOS)
    return out, (x0, y0, half_w_i, half_h_i)


def stitch_halves(half_left, half_right):
    """两半（各 175×464）横向拼成 350×464 的双将卡"""
    canvas = Image.new("RGB", OUT_SIZE, (0, 0, 0))
    canvas.paste(half_left, (0, 0))
    canvas.paste(half_right, (HALF_SIZE[0], 0))
    return canvas


def load(path):
    return cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2BGR)


def _out_path(out_dir, filename, src=None):
    """输出路径。若与源文件是同一个文件（输出目录==源目录且同名）→ 自动加后缀，
    避免把源图直接覆盖掉（用户把输出目录设成源目录时踩过这个坑）。"""
    dst = os.path.join(out_dir, filename)
    if src and os.path.abspath(dst) == os.path.abspath(src):
        base, ext = os.path.splitext(filename)
        dst = os.path.join(out_dir, base + "_裁切" + ext)
    return dst


# ---------------------------------------------------------------- 处理入口
def save_debug(img, boxes, points, dst):
    """输出标注图：绿框=裁切窗口，红点=选中脸心"""
    annot = img.copy()
    thick = max(2, int(img.shape[1] / 400))
    for x, y, w, h in boxes:
        cv2.rectangle(annot, (int(x), int(y)), (int(x + w), int(y + h)), (0, 255, 0), thick)
    for cx, cy in points:
        cv2.circle(annot, (int(cx), int(cy)), max(4, int(img.shape[1] / 250)), (0, 0, 255), -1)
    max_w = 900
    if annot.shape[1] > max_w:
        annot = cv2.resize(annot, (max_w, int(annot.shape[0] * max_w / annot.shape[1])))
    Image.fromarray(cv2.cvtColor(annot, cv2.COLOR_BGR2RGB)).save(dst, quality=88)


def process_single(path, out_dir, debug=True, log=print):
    name = os.path.splitext(os.path.basename(path))[0]
    img = load(path)
    faces, total, warn = pick_faces(img, 1)
    if not faces:
        log("✗ %s：未检出人脸，跳过（建议手动裁）" % os.path.basename(path))
        return False
    cx, cy, fw = faces[0]
    out, note, win = crop_window(img, cx, cy, fw)
    dst = _out_path(out_dir, name + ".jpg", path)
    out.save(dst, quality=92)
    if debug:
        save_debug(img, [win], [(cx, cy)], os.path.join(out_dir, "_debug_" + name + ".jpg"))
    tip = ""
    if os.path.basename(dst) != name + ".jpg":
        tip = "　⚠ 输出与源文件同名，已另存为「%s」，未覆盖原图" % os.path.basename(dst)
    log("✓ %s → %s（检出%d张脸，用最大者 %s）%s%s" % (os.path.basename(path), os.path.basename(dst), total, warn, note, tip))
    return True


def process_dual(path, out_dir, debug=True, log=print):
    name = os.path.splitext(os.path.basename(path))[0]
    img = load(path)
    faces, total, warn = pick_faces(img, 2)
    if len(faces) < 2:
        log("✗ %s：%s，跳过（建议手动裁）" % (os.path.basename(path), warn or "未找到两张分开的脸"))
        return False
    (ax, ay, aw), (bx, by, bw) = faces[0], faces[1]
    # 按 x 排序：左=第一个名字，右=第二个名字
    if ax > bx:
        (ax, ay, aw), (bx, by, bw) = (bx, by, bw), (ax, ay, aw)
    h, w = img.shape[:2]
    wins = []
    pts = []
    notes = []
    # ① 两张单人图
    for cx, cy, fw, suffix in ((ax, ay, aw, "1"), (bx, by, bw, "2")):
        out, note, win = crop_window(img, cx, cy, fw, face_ratio=DUAL_SINGLE_FW)
        out.save(os.path.join(out_dir, "%s_%s.jpg" % (name, suffix)), quality=92)
        wins.append(win)
        pts.append((cx, cy))
        if note:
            notes.append("%s_%s%s" % (name, suffix, note))
    # ② 拼接合体卡：两半各占半幅（175×464）。
    #    每一半**各自**把"脸"缩放到占该半幅 DUAL_HALF_FW，再各自缩放到 175×464 后横向拼接。
    #    → 两张脸在成品里**一样大**（源图里一大一小时，小脸那半会被放大补齐）；
    #    → 两半输出尺寸相同，天然等高，不会出现黑边。
    #    （旧版两半共用一个裁切尺寸，小脸那半的脸就显得特别小。）
    halves = []
    for cx, cy, fw in ((ax, ay, aw), (bx, by, bw)):
        half_img, win = half_crop(img, cx, cy, fw)
        halves.append(half_img)
        wins.append(win)
    canvas = stitch_halves(halves[0], halves[1])
    dst = _out_path(out_dir, name + ".jpg", path)
    canvas.save(dst, quality=92)
    if debug:
        save_debug(img, wins, pts, os.path.join(out_dir, "_debug_" + name + ".jpg"))
    tip = ""
    if os.path.basename(dst) != name + ".jpg":
        tip = "；⚠ 输出与源文件同名，已另存为「%s」，未覆盖原图" % os.path.basename(dst)
    log("✓ %s → 单人图 %s_1/_2.jpg + 拼接合体卡 %s（检出%d张脸 %s%s%s）"
        % (os.path.basename(path), name, os.path.basename(dst), total, warn,
           ("；" + "、".join(notes)) if notes else "", tip))
    return True


def process_pair(path_a, path_b, out_dir, name=None, debug=True, log=print):
    """【两张单人图 → 一张双将卡】：各自裁出半幅（脸占半幅 DUAL_HALF_FW），再左右拼接。
    path_a = 左边那张，path_b = 右边那张；name 可指定输出文件名（不含扩展名）。"""
    img_a, img_b = load(path_a), load(path_b)
    fa, total_a, warn_a = pick_faces(img_a, 1)
    fb, total_b, warn_b = pick_faces(img_b, 1)
    if not fa or not fb:
        log("✗ 拼图失败：%s 检出 %d 张脸 / %s 检出 %d 张脸（两张都必须能检出人脸）"
            % (os.path.basename(path_a), len(fa), os.path.basename(path_b), len(fb)))
        return False
    half_a, win_a = half_crop(img_a, *fa[0])
    half_b, win_b = half_crop(img_b, *fb[0])
    canvas = stitch_halves(half_a, half_b)
    base = name or ("%s_%s" % (os.path.splitext(os.path.basename(path_a))[0],
                               os.path.splitext(os.path.basename(path_b))[0]))
    dst = _out_path(out_dir, base + ".jpg", path_a)
    canvas.save(dst, quality=92)
    if debug:
        save_debug(img_a, [win_a], [(fa[0][0], fa[0][1])], os.path.join(out_dir, "_debug_" + base + "_左.jpg"))
        save_debug(img_b, [win_b], [(fb[0][0], fb[0][1])], os.path.join(out_dir, "_debug_" + base + "_右.jpg"))
    tip = ""
    if os.path.basename(dst) != base + ".jpg":
        tip = "；⚠ 输出与源文件同名，已另存为「%s」" % os.path.basename(dst)
    log("✓ 拼图：左 %s（检出%d张脸 %s）+ 右 %s（检出%d张脸 %s）→ %s%s"
        % (os.path.basename(path_a), total_a, warn_a, os.path.basename(path_b), total_b, warn_b,
           os.path.basename(dst), tip))
    return True


# ---------------------------------------------------------------- 图形界面
def run_gui():
    import threading
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("无名杀 武将插画裁切器")
    root.geometry("720x660")
    root.minsize(680, 560)  # 窗口可缩放，最小尺寸保证"开始裁切"始终可见

    mode = tk.StringVar(value="single")
    files = []
    out_dir = tk.StringVar(value="")
    dbg = tk.BooleanVar(value=True)

    frm = ttk.Frame(root, padding=10)
    frm.pack(fill="both", expand=True)

    # ============ 顶部：配置区 ============
    top = ttk.Frame(frm)
    top.pack(side="top", fill="x")

    ttk.Label(top, text="① 选择武将类型").pack(anchor="w")
    row = ttk.Frame(top)
    row.pack(anchor="w", pady=(2, 8))
    ttk.Radiobutton(row, text="单头将（一张图裁一人）", variable=mode, value="single").pack(side="left")
    ttk.Radiobutton(row, text="双头将（一张双人图 → 拆分+拼接）", variable=mode, value="dual").pack(side="left", padx=(12, 0))
    row2 = ttk.Frame(top)
    row2.pack(anchor="w", pady=(0, 8))
    ttk.Radiobutton(row2, text="两张单人图 → 拼成一张双将卡（按顺序两两配对：1+2、3+4…）",
                    variable=mode, value="pair").pack(side="left")

    count_lbl = ttk.Label(top, text="② 选择图片（可多选，也可直接选整个文件夹）")
    count_lbl.pack(anchor="w")
    listbox = tk.Listbox(top, height=5)
    listbox.pack(fill="x", pady=(2, 4))

    frow = ttk.Frame(top)
    frow.pack(anchor="w")

    def refresh_count():
        count_lbl.configure(text="② 选择图片（已添加 %d 张）" % len(files))

    def add_paths(paths):
        added = 0
        for p in paths:
            if p not in files:
                files.append(p)
                listbox.insert("end", p)
                added += 1
        refresh_count()
        if added:
            log("已添加 %d 张图片" % added)

    def add_files():
        picked = filedialog.askopenfilenames(
            title="选择插画（可多选）",
            filetypes=[("图片", "*.jpg *.jpeg *.png *.webp *.bmp"), ("全部", "*.*")],
        )
        add_paths(picked)

    def add_folder():
        d = filedialog.askdirectory(title="选择图片文件夹")
        if not d:
            return
        got = collect_inputs([d])
        if not got:
            messagebox.showinfo("提示", "该文件夹里没有找到图片")
            return
        add_paths(got)

    def clear_files():
        files.clear()
        listbox.delete(0, "end")
        refresh_count()

    ttk.Button(frow, text="添加图片…", command=add_files).pack(side="left")
    ttk.Button(frow, text="添加文件夹…", command=add_folder).pack(side="left", padx=(8, 0))
    ttk.Button(frow, text="清空列表", command=clear_files).pack(side="left", padx=(8, 0))

    ttk.Label(top, text="③ 输出目录（留空 = 图片所在目录/crops）").pack(anchor="w", pady=(10, 0))
    orow = ttk.Frame(top)
    orow.pack(fill="x", pady=(2, 4))
    ttk.Entry(orow, textvariable=out_dir).pack(side="left", fill="x", expand=True)
    ttk.Button(orow, text="选择…", command=lambda: out_dir.set(filedialog.askdirectory(title="选择输出目录") or out_dir.get())).pack(side="left")

    ttk.Checkbutton(top, text="同时输出标注图 _debug_*.jpg（绿框=裁切范围，红点=识别到的脸，便于核对）", variable=dbg).pack(anchor="w", pady=(0, 2))

    # ============ 底部：固定操作区（永远可见，先 pack 预留）============
    bottom = ttk.Frame(frm)
    bottom.pack(side="bottom", fill="x")

    start_btn = ttk.Button(bottom, text="▶  开始裁切")
    start_btn.pack(fill="x", pady=(8, 4), ipady=4)

    ttk.Label(
        bottom,
        text="构图标准：脸心居中 X=0.5 / 上 1/3 Y=0.351 / 脸宽占 23.8%  ·  输出 350×464  ·  人物贴边则收紧窗口、不补边",
        foreground="#666",
        wraplength=680,
        justify="left",
    ).pack(anchor="w")

    # ============ 中间：日志区（占满剩余空间）============
    logbox = tk.Text(frm, height=8, state="disabled", wrap="word")
    logbox.pack(side="top", fill="both", expand=True, pady=(8, 0))

    def log(msg):
        logbox.configure(state="normal")
        logbox.insert("end", msg + "\n")
        logbox.see("end")
        logbox.configure(state="disabled")

    def start():
        if not files:
            messagebox.showwarning("提示", "请先添加图片（“添加图片…”或“添加文件夹…”）")
            return
        if mode.get() == "pair" and len(files) < 2:
            messagebox.showwarning("提示", "「两张单人图拼一张」需要至少 2 张图片")
            return
        od = out_dir.get().strip() or os.path.join(os.path.dirname(files[0]), "crops")
        try:
            os.makedirs(od, exist_ok=True)
        except Exception as e:
            messagebox.showerror("错误", "无法创建输出目录：%s" % e)
            return
        log("输出目录：%s" % od)
        start_btn.configure(state="disabled", text="正在裁切，请稍候…")

        def work():
            done = 0
            if mode.get() == "pair":
                seq = list(files)
                if len(seq) % 2:
                    log("⚠ 图片数为奇数，最后一张会被忽略")
                for i in range(0, len(seq) - 1, 2):
                    try:
                        if process_pair(seq[i], seq[i + 1], od, debug=dbg.get(), log=log):
                            done += 1
                    except Exception:
                        log("✗ %s + %s 出错：\n%s" % (os.path.basename(seq[i]), os.path.basename(seq[i + 1]),
                                                     traceback.format_exc()))
                log("—— 完成：%d 对 ——" % done)
            else:
                for p in list(files):
                    try:
                        fn = process_single if mode.get() == "single" else process_dual
                        if fn(p, od, debug=dbg.get(), log=log):
                            done += 1
                    except Exception:
                        log("✗ %s 出错：\n%s" % (os.path.basename(p), traceback.format_exc()))
                log("—— 完成：%d/%d 张 ——" % (done, len(files)))
            root.after(0, lambda: start_btn.configure(state="normal", text="▶  开始裁切"))
            try:
                os.startfile(od)
            except Exception:
                pass

        threading.Thread(target=work, daemon=True).start()

    start_btn.configure(command=start)
    root.bind("<Return>", lambda e: start())  # 回车即可开始

    root.mainloop()


# ---------------------------------------------------------------- CLI
def collect_inputs(paths):
    out = []
    for p in paths:
        if os.path.isdir(p):
            for f in sorted(os.listdir(p)):
                if f.lower().endswith(IMG_EXT):
                    out.append(os.path.join(p, f))
        elif os.path.isfile(p):
            out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser(description="无名杀武将插画裁切器（单头将 / 双头将 / 两张单人图拼一张）")
    ap.add_argument("inputs", nargs="*", help="图片文件或目录（可多个）")
    ap.add_argument("--mode", choices=["single", "dual", "pair"],
                    help="single=单头将；dual=一张双人图拆两半+拼合体卡；pair=两张单人图拼成一张双将卡；不传则打开图形界面")
    ap.add_argument("--out", default="", help="输出目录（默认 <第一张图目录>/crops）")
    ap.add_argument("--name", default="", help="pair 模式的输出文件名（不含扩展名，默认 左图名_右图名）")
    ap.add_argument("--debug", action="store_true", help="同时输出标注图 _debug_*.jpg（便于核对识别结果）")
    args = ap.parse_args()

    if not args.mode:
        run_gui()
        return
    inputs = collect_inputs(args.inputs)
    if not inputs:
        print("没有找到图片。用法：python 插画裁切器.py --mode single|dual|pair --out 输出目录 图片或目录...")
        sys.exit(1)
    out_dir = args.out or os.path.join(os.path.dirname(os.path.abspath(inputs[0])), "crops")
    os.makedirs(out_dir, exist_ok=True)
    if args.mode == "pair":
        # 两张单人图拼一张：按顺序两两配对（1+2、3+4 …）
        if len(inputs) < 2:
            print("pair 模式需要至少 2 张图（左、右）。")
            sys.exit(1)
        if len(inputs) % 2:
            print("⚠ 图片数为奇数，最后一张会被忽略。")
        ok = 0
        for i in range(0, len(inputs) - 1, 2):
            try:
                nm = args.name if (args.name and len(inputs) == 2) else None
                if process_pair(inputs[i], inputs[i + 1], out_dir, name=nm, debug=args.debug):
                    ok += 1
            except Exception:
                print("✗ %s + %s 出错：\n%s" % (inputs[i], inputs[i + 1], traceback.format_exc()))
        print("完成：%d 对 → %s" % (ok, out_dir))
        return
    fn = process_single if args.mode == "single" else process_dual
    ok = 0
    for p in inputs:
        try:
            if fn(p, out_dir, debug=args.debug):
                ok += 1
        except Exception:
            print("✗ %s 出错：\n%s" % (p, traceback.format_exc()))
    print("完成：%d/%d 张 → %s" % (ok, len(inputs), out_dir))


if __name__ == "__main__":
    main()
