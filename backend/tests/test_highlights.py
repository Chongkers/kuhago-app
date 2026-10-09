import numpy as np
from PIL import Image, ImageDraw

from app import config
from ml import highlights


def e(i):
    v = np.zeros(config.EMB_DIM, np.float32)
    v[i] = 1
    return v


def test_sharp_checkerboard_beats_blur(tmp_path):
    sharp, flat = tmp_path / "sharp.jpg", tmp_path / "flat.jpg"
    img = Image.new("L", (64, 64), 0)
    d = ImageDraw.Draw(img)
    for x in range(0, 64, 8):
        for y in range(0, 64, 8):
            if (x + y) // 8 % 2:
                d.rectangle([x, y, x + 7, y + 7], fill=255)
    img.save(sharp)
    Image.new("L", (64, 64), 128).save(flat)
    assert highlights.sharpness(sharp) > highlights.sharpness(flat)


def test_percentile_rank():
    assert highlights.percentile_rank([5.0, 1.0, 3.0]).tolist() == [100.0, 0.0, 50.0]
    assert highlights.percentile_rank([7.0]).tolist() == [100.0]


def test_group_duplicates_needs_same_moment_close_time_and_similar_look():
    moments = ["Cake", "Cake", "Cake", "Cake", "Games", "Cake"]
    t = [0, 4, 9, 100, 5, 104]
    near, far = 0b1111, (1 << 40) - 1  # Hamming(near, 0) = 4, Hamming(far, 0) = 40
    hashes = [0, near, far, 0, 0, far]
    emb = np.stack([e(0), e(1), e(2), e(3), e(0), e(4)])
    emb[2] = e(0)  # row 2: pHash far but CLIP identical to row 0 -> still a duplicate
    groups = highlights.group_duplicates(moments, t, hashes, emb)
    # 0-1 by pHash, 0-2 by cosine (within 10 s, chained). 3 and 5 are 4 s apart but differ in both.
    # 4 matches 0 exactly but is another moment.
    assert groups == [0, 0, 0, None, None, None]


def test_pick_highlights_one_per_dup_group_drops_blurry_and_unsorted(monkeypatch):
    monkeypatch.setattr(config, "HIGHLIGHTS_PER_MOMENT", 2)
    monkeypatch.setattr(config, "SHARPNESS_MIN_PCT", 20)
    moments = ["Cake", "Cake", "Cake", "Cake", "Cake", "Unsorted"]
    pct = [90, 95, 10, 50, 60, 100]
    groups = [0, 0, None, None, None, None]
    # 1 beats its duplicate 0; 2 too blurry; then 4 (60) over 3 (50); top 2 per moment; Unsorted never.
    assert highlights.pick_highlights(moments, pct, groups) == [False, True, False, False, True, False]
