"""2단계 (numpy만 필요): extract.py 결과에 뼈대 연결 가중치를 계산하고, 동작 엔진(fig.js)의 신체 비율에 맞춘 뒤
   리깅된 glTF(.glb)로 저장한다.   python build.py <raw.npz> <out.glb>

좌표: glTF/fig.js 공통 — y 위, z 몸 앞, x 몸의 왼쪽.
뼈(조인트) 순서는 src/engine/body.js의 BONES와 같아야 한다."""
import sys, os, json, struct
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

src, out = sys.argv[1], sys.argv[2]
D = np.load(src)
names, kinds, voff, toff = list(D["names"]), list(D["kinds"]), D["voff"], D["toff"]
Vb = D["verts"].astype(np.float64)
V = np.stack([Vb[:, 0], Vb[:, 2], -Vb[:, 1]], axis=1)      # Blender(z 위, -y 앞) → y 위, z 앞
T = D["tris"]
idx = {n: i for i, n in enumerate(names)}
def verts(name): i = idx[name]; return V[voff[i]:voff[i + 1]]

# fig.js의 신체 치수 (L, skeleton())
FIG = dict(ua=.30, fa=.27, th=.43, sh=.42, hipX=.095, hipY=-.07, shX=.185, shY=.45, neckY=.5, ankle=.085)
BONES = ["pelvis", "lumbar", "torso", "head", "clavL", "clavR", "uaL", "uaR",
         "fa0L", "fa1L", "fa2L", "fa3L", "fa0R", "fa1R", "fa2R", "fa3R", "handL", "handR",
         "thL", "thR", "shL", "shR", "ftL", "ftR"]
B = {n: i for i, n in enumerate(BONES)}
NFA = 4

def unit(v): return v / np.linalg.norm(v)
def sstep(x, a, b): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ── 1. 모델의 관절 위치 (뼈 메쉬에서 추정) ──
floor = V[:, 1].min()
jb = {}
for sfx, S, sg in ((".l", "L", 1), (".r", "R", -1)):
    hu, fe = verts("Humerus" + sfx), verts("Femur" + sfx)
    jb["sh" + S] = hu[hu[:, 1] > hu[:, 1].max() - .045].mean(0)
    jb["el" + S] = hu[hu[:, 1] < hu[:, 1].min() + .03].mean(0)
    carp = np.concatenate([verts(n + sfx) for n in ("Lunate bone", "Capitate bone", "Scaphoid bone")])
    jb["wr" + S] = carp.mean(0)
    jb["ha" + S] = verts("Third metacarpal bone" + sfx).mean(0)          # 손바닥 가운데 = 엔진의 '손'(쥐는 점)
    top = fe[fe[:, 1] > fe[:, 1].max() - .06]
    med = top[:, 0] * sg; jb["hip" + S] = top[med < med.min() + .045].mean(0)   # 대퇴골두
    jb["kn" + S] = fe[fe[:, 1] < fe[:, 1].min() + .05].mean(0)
    jb["an" + S] = verts("Talus" + sfx).mean(0)
def rot_about(v, c, axis, ang):
    """점들 v를 c를 지나는 axis 둘레로 ang(벡터 가능)만큼 회전"""
    a = unit(axis); r = v - c; ang = np.broadcast_to(ang, (len(v),))[:, None]
    return c + r * np.cos(ang) + np.cross(a, r) * np.sin(ang) + a * (r @ a)[:, None] * (1 - np.cos(ang))

def ends(name, toward):
    """뼈 메쉬의 양 끝점 (toward에 가까운 쪽이 먼저)"""
    v = verts(name); c = v.mean(0); ax = np.linalg.svd(v - c, full_matrices=False)[2][0]; t = (v - c) @ ax
    a, b = v[t < np.quantile(t, .08)].mean(0), v[t > np.quantile(t, .92)].mean(0)
    return (a, b) if np.linalg.norm(a - toward) < np.linalg.norm(b - toward) else (b, a)

# ── 1b. 손: 손가락을 바를 쥔 모양으로 굽힌다 (원본은 손을 편 자세) ──
CURL = np.radians([72, 82, 42])                       # 손허리손가락·몸쪽·먼쪽 마디
side_mask = {"L": np.zeros(len(V), bool), "R": np.zeros(len(V), bool)}
for i, n in enumerate(names):
    S_ = config.side_of(n)
    if S_: side_mask[S_][voff[i]:voff[i + 1]] = True
bind_pron = {}
for sfx, S in ((".l", "L"), (".r", "R")):
    wr = jb["wr" + S]
    mc = {f: ends(f"{f} metacarpal bone{sfx}", wr) for f in ("Second", "Third", "Fourth", "Fifth")}
    across = unit(mc["Second"][1] - mc["Fifth"][1]); along = unit(mc["Third"][1] - mc["Third"][0])
    n = unit(np.cross(across, along))
    if (verts("Palmar aponeurosis" + sfx).mean(0) - verts("Third metacarpal bone" + sfx).mean(0)) @ n < 0: n = -n
    chains = []
    for f in ("second", "third", "fourth", "fifth"):
        pp = ends(f"Proximal phalanx of {f} finger of hand{sfx}", wr); mp = ends(f"Middle phalanx of {f} finger of hand{sfx}", wr)
        dp = ends(f"Distal phalanx of {f} finger of hand{sfx}", wr); m = mc[f.capitalize()]
        chains.append([(m[1] + pp[0]) / 2, (pp[1] + mp[0]) / 2, (mp[1] + dp[0]) / 2, dp[1]])
    m = side_mask[S] & (np.linalg.norm(V - wr, axis=1) < .25); vi = np.where(m)[0]; v = V[vi]
    dist = np.stack([np.min([seg_d for seg_d in [np.linalg.norm(v - (a + np.clip((v - a) @ (b - a) / ((b - a) @ (b - a)), 0, 1)[:, None] * (b - a)), axis=1)
                                                 for a, b in zip(ch[:-1], ch[1:])]], axis=0) for ch in chains], axis=1)
    near = dist.argmin(1); ok = dist.min(1) < .02
    for fi, ch in enumerate(chains):
        sel = ok & (near == fi); pv = v[sel]
        for j in (2, 1, 0):                              # 먼 마디부터 굽혀야 몸쪽 관절 기준이 유지된다
            d = unit(ch[j + 1] - ch[j]); w = sstep((pv - ch[j]) @ d, -.006, .006)
            pv = rot_about(pv, ch[j], np.cross(d, n), CURL[j] * w)
        v[sel] = pv
    V[vi] = v
    jb["ha" + S] = verts("Third metacarpal bone" + sfx).mean(0) + n * .018      # 쥐는 점: 손바닥 가운데에서 살짝 손바닥 쪽
    jb["palm" + S] = n
# ── 1c. 발: 원본은 누운 자세라 발끝이 처져 있다. 발목을 돌려 발바닥을 평평하게 ──
foot_fix = {}
FOOT_RX = __import__("re").compile(r"of foot|metatarsal|Calcaneus|Talus|Navicular|Cuboid|[Cc]uneiform")
for sfx, S in ((".l", "L"), (".r", "R")):
    ca = verts("Calcaneus" + sfx); heel = ca[ca[:, 2] < ca[:, 2].min() + .02].mean(0)
    mt = ends("Second metatarsal bone" + sfx, heel)[1]; d = mt - heel
    ang = np.arctan2(-.025, .17) - np.arctan2(d[1], d[2])
    fv = np.concatenate([verts(nm) for nm in names if nm.endswith(sfx) and kinds[idx[nm]] == "bone" and FOOT_RX.search(nm)])
    c, s_ = np.cos(ang), np.sin(ang); Rx = np.array([[1, 0, 0], [0, c, s_], [0, -s_, c]])     # y-z 평면에서 각도 +ang
    low = ((fv - jb["an" + S]) @ Rx.T)[:, 1].min()
    foot_fix[S] = (Rx, -low); print("foot", S, "rotate", round(np.degrees(ang), 1), "deg, ankle height", round(-low, 3))
hipmid = (jb["hipL"] + jb["hipR"]) / 2
def _len(a, b): return np.linalg.norm(jb[b] - jb[a])
# 전체 기준 배율: 팔다리 길이 비율의 평균 (엔진의 인체가 모델보다 조금 크다). 굵기·머리·손에 쓴다.
k = float(np.mean([FIG["th"] / _len("hipL", "knL"), FIG["sh"] / _len("knL", "anL"), FIG["ua"] / _len("shL", "elL")]))
print("base scale", round(k, 3))
jb["pelvis"] = hipmid + np.array([0, -FIG["hipY"] / 1.0, 0])
jb["neck"] = verts("Vertebra C7").mean(0) * np.array([0, 1, 1])
print("model joints:", {n: np.round(v, 3).tolist() for n, v in jb.items()})

# ── 2. 엔진 비율의 기준 자세 (모델의 팔다리 방향은 그대로, 길이만 엔진 치수) ──
dirs = {}
for S in "LR":
    dirs["ua" + S] = unit(jb["el" + S] - jb["sh" + S]); dirs["fa" + S] = unit(jb["ha" + S] - jb["el" + S])
    dirs["th" + S] = unit(jb["kn" + S] - jb["hip" + S]); dirs["sh" + S] = unit(jb["an" + S] - jb["kn" + S])
legdrop = np.mean([-(FIG["th"] * dirs["th" + S][1] + FIG["sh"] * dirs["sh" + S][1]) for S in "LR"])
jc = {"pelvis": np.array([0, FIG["ankle"] + legdrop - FIG["hipY"], 0.])}
P = jc["pelvis"]
jc["neck"] = P + [0, FIG["neckY"], 0]
for S, sg in (("L", 1), ("R", -1)):
    jc["hip" + S] = P + [sg * FIG["hipX"], FIG["hipY"], 0]
    jc["kn" + S] = jc["hip" + S] + FIG["th"] * dirs["th" + S]
    jc["an" + S] = jc["kn" + S] + FIG["sh"] * dirs["sh" + S]
    jc["sh" + S] = P + [sg * FIG["shX"], FIG["shY"], 0]
    jc["el" + S] = jc["sh" + S] + FIG["ua"] * dirs["ua" + S]
    jc["ha" + S] = jc["el" + S] + FIG["fa"] * dirs["fa" + S]

# 원본의 아래팔 회내(손바닥이 얼마나 돌아가 있는지): 앱이 손 방향을 정할 때 이만큼을 빼고 돌린다
def _pron(S):
    u = dirs["ua" + S]; fa = dirs["fa" + S]; fwd = np.array([0, 0, 1.])
    Zu = unit(fwd - u * (fwd @ u)); Yu = -u; Xu = unit(np.cross(Yu, Zu))
    Yf = -fa; Xf = unit(Xu - Yf * (Xu @ Yf)); Zf = np.cross(Xf, Yf)
    n = jb["palm" + S]; return float(np.arctan2(n @ Xf, n @ Zf)) * (-1 if S == "L" else 1)
bind_pron = {S: _pron(S) for S in "LR"}
print("bind pronation deg", {S: round(np.degrees(a), 1) for S, a in bind_pron.items()})

# ── 3. 가중치 ──
N = len(V)
W = np.zeros((N, len(BONES)))
group = np.zeros(N, dtype=np.int32)
groups = []                                                   # (keys, side, kind)

def torso_weights(v):
    """골반→허리→가슴→머리. 높이에 따라 나눈다."""
    h = v[:, 1] - jb["pelvis"][1]
    w = np.zeros((len(v), len(BONES)))
    a = sstep(h, -.01, .10); b = sstep(h, .10, .22)
    hn = v[:, 1] - jb["neck"][1]; c = sstep(hn, -.02, .07)
    w[:, B["pelvis"]] = 1 - a; w[:, B["lumbar"]] = a * (1 - b); w[:, B["torso"]] = b * (1 - c); w[:, B["head"]] = c
    return w

SHOULDER_X = __import__("re").compile(r"pectoralis major|Latissimus|Teres|spinatus|deltoid|Coracobrachialis|brachii")
TRUNK_TO_ARM = __import__("re").compile(r"pectoralis major|Latissimus|Teres major")
HIP_X = __import__("re").compile(r"Gluteus|Tensor fasciae|Iliotibial|Iliacus|Psoas|Sartorius|Rectus femoris|Pectineus|Adductor (longus|brevis|magnus|minimus)"
                                 r"|Gracilis|Semitendinosus|Semimembranosus|Long head of biceps femoris")

def seg_dist(v, a, b):
    d = b - a; t = np.clip((v - a) @ d / (d @ d), 0, 1); return np.linalg.norm(v - (a + t[:, None] * d), axis=1)

def arm_chain(v, S):
    """팔 안에서의 분배: 위팔 → 아래팔(비틀림 4단) → 손"""
    w = np.zeros((len(v), len(BONES)))
    fdir = unit(jb["wr" + S] - jb["el" + S]); Lw = np.linalg.norm(jb["wr" + S] - jb["el" + S])
    tf = (v - jb["el" + S]) @ fdir
    e = sstep(tf, -.035, .045)
    w[:, B["ua" + S]] = 1 - e
    tau = np.clip(tf / Lw, 0, 1) * (NFA - 1); i0 = np.minimum(np.floor(tau).astype(int), NFA - 2); fr = tau - i0
    hnd = sstep(tf, Lw - .015, Lw + .015)
    for j in range(NFA):
        w[:, B[f"fa{j}{S}"]] = e * (1 - hnd) * (np.where(i0 == j, 1 - fr, 0) + np.where(i0 + 1 == j, fr, 0))
    w[:, B["hand" + S]] = e * hnd
    return w

def leg_chain(v, S):
    w = np.zeros((len(v), len(BONES)))
    sdir = dirs["sh" + S]; Ls = np.linalg.norm(jb["an" + S] - jb["kn" + S])
    ts = (v - jb["kn" + S]) @ sdir
    kn = sstep(ts, -.04, .05); an = sstep(ts - Ls, -.03, .02)
    w[:, B["th" + S]] = 1 - kn; w[:, B["sh" + S]] = kn * (1 - an); w[:, B["ft" + S]] = kn * an
    return w

def rigid(n, bone): w = np.zeros((n, len(BONES))); w[:, B[bone]] = 1; return w

stats = {}
for i, name in enumerate(names):
    sl = slice(voff[i], voff[i + 1]); v = V[sl]; kind = kinds[i]; S = config.side_of(name)
    cat = "torso"
    if kind == "bone":
        w = None
        for rx, bone in config.ARM_BONE + config.LEG_BONE:
            if rx.search(name) and S:
                if bone == "fa": w = arm_chain(v, S); w[:, B["ua" + S]] = 0; w /= w.sum(1, keepdims=True)
                else: w = rigid(len(v), bone + S)
                cat = bone; break
        if w is None:
            if config.PELVIS_BONE.search(name): w = rigid(len(v), "pelvis"); cat = "pelvis"
            elif config.CLAV_BONE.search(name) and S: w = rigid(len(v), "clav" + S); cat = "clav"
            elif config.HEAD.search(name): w = rigid(len(v), "head"); cat = "head"
            else: w = np.repeat(torso_weights(v.mean(0, keepdims=True)), len(v), axis=0)   # 갈비뼈·척추: 조각마다 한 덩어리로
    elif config.HEAD.search(name):
        w = rigid(len(v), "head"); cat = "head"
    elif S and config.ARM_MUSCLE.search(name):
        cat = "arm"; w = arm_chain(v, S)
        if SHOULDER_X.search(name):
            tu = (v - jb["sh" + S]) @ dirs["ua" + S]
            dh = seg_dist(v, jb["sh" + S], jb["el" + S])
            wa = sstep(tu, -.02, .05) * (1 - sstep(dh, .05, .11))
            if TRUNK_TO_ARM.search(name):
                # 몸통에서 팔로 건너가는 근육(대흉근·광배근·대원근): 위팔뼈에 붙는 끝부분만 팔을 따라간다
                wa = sstep(tu, -.02, .04) * (1 - sstep(dh, .03, .075)) * (1 - sstep(tu, .09, .16))
            rest = torso_weights(v)
            c = 1 - sstep(np.linalg.norm(v - jb["sh" + S], axis=1), .07, .17)
            rest *= (1 - c)[:, None]; rest[:, B["clav" + S]] = c
            w = wa[:, None] * w + (1 - wa)[:, None] * rest
    elif S and config.LEG_MUSCLE.search(name):
        cat = "leg"; w = leg_chain(v, S)
        if HIP_X.search(name):
            tt = (v - jb["hip" + S]) @ dirs["th" + S]
            wl = sstep(tt, -.04, .10)
            w = wl[:, None] * w + (1 - wl)[:, None] * torso_weights(v)
    else:
        w = torso_weights(v)
        if S and config.GIRDLE.search(name):
            c = 1 - sstep(np.linalg.norm(v - jb["sh" + S], axis=1), .06, .20)
            w *= (1 - c)[:, None]; w[:, B["clav" + S]] = c
    W[sl] = w
    keys = config.keys_of(name) if kind == "muscle" else []
    gk = ("+".join(keys) if keys else ("bone" if kind == "bone" else "tendon" if config.TENDON.search(name) else "muscle"), S)
    if gk not in groups: groups.append(gk)
    group[sl] = groups.index(gk)
    stats[cat] = stats.get(cat, 0) + 1
print("categories:", stats, "groups:", len(groups))

# 영향 4개로 제한
order = np.argsort(-W, axis=1)[:, :4]
Wt = np.take_along_axis(W, order, axis=1); Wt /= Wt.sum(1, keepdims=True)

# ── 4. 엔진 비율로 변형 (기준 자세로 굽기) ──
def frame_scale(bone):
    """뼈마다: 모델 원점 o_b, 기준 원점 o_c, 3x3 변환 A (회전 없음 = 방향 유지, 축 방향 길이만 맞춤)"""
    S = bone[-1] if bone[-1] in "LR" else ""
    def axial(a_b, b_b, a_c, b_c, lat=k):
        d = unit(b_b - a_b); s = np.linalg.norm(b_c - a_c) / np.linalg.norm(b_b - a_b)
        return a_b, a_c, lat * np.eye(3) + (s - lat) * np.outer(d, d)
    if bone in ("pelvis", "lumbar"):
        kx = (FIG["hipX"] / jb["hipL"][0] + k) / 2          # 엔진의 골반이 꽤 넓어서 절반만 따라간다
        sc = np.diag([kx, 1.0, k]) if bone == "pelvis" else None
        if bone == "pelvis": return jb["pelvis"], jc["pelvis"], sc
    if bone in ("lumbar", "torso"):
        kx = FIG["shX"] / ((jb["shL"][0] - jb["shR"][0]) / 2); ky = FIG["shY"] / (jb["shL"][1] - jb["pelvis"][1])
        kxp = (FIG["hipX"] / jb["hipL"][0] + k) / 2
        if bone == "lumbar": return jb["pelvis"], jc["pelvis"], np.diag([(kx + kxp) / 2, (1 + ky) / 2, k])
        return jb["pelvis"], jc["pelvis"], np.diag([kx, ky, k])
    if bone == "head": return jb["neck"], jc["neck"], k * np.eye(3)
    if bone.startswith("clav"): return jb["sh" + S] , jc["sh" + S], k * np.eye(3)
    if bone.startswith("ua"): return axial(jb["sh" + S], jb["el" + S], jc["sh" + S], jc["el" + S])
    if bone.startswith("fa"): return axial(jb["el" + S], jb["ha" + S], jc["el" + S], jc["ha" + S])
    if bone.startswith("hand"): return jb["ha" + S], jc["ha" + S], k * np.eye(3)       # 손은 쥐는 점 기준으로 크기만
    if bone.startswith("th"): return axial(jb["hip" + S], jb["kn" + S], jc["hip" + S], jc["kn" + S])
    if bone.startswith("sh"): return axial(jb["kn" + S], jb["an" + S], jc["kn" + S], jc["an" + S])
    if bone.startswith("ft"):                                    # 발바닥을 평평하게 돌리고 바닥에 닿게
        Rx, h = foot_fix[S]; return jb["an" + S], jc["an" + S], np.diag([k, FIG["ankle"] / h, k]) @ Rx
    raise KeyError(bone)

jb["pelvis"][2] = hipmid[2]
fs = [frame_scale(b) for b in BONES]
Vc = np.zeros_like(V)
for bi, (ob, oc, A) in enumerate(fs):
    m = np.any(order == bi, axis=1)
    if not m.any(): continue
    wv = np.where(order[m] == bi, Wt[m], 0).sum(1)
    Vc[m] += wv[:, None] * ((V[m] - ob) @ A.T + oc)
print("posed bbox:", np.round(Vc.min(0), 3), np.round(Vc.max(0), 3), "pelvis", np.round(jc["pelvis"], 3))

# ── 5. 법선 ──
Nrm = np.zeros_like(Vc)
gt = T + np.repeat(voff[:-1], np.diff(toff))[:, None]          # 전역 인덱스
fn = np.cross(Vc[gt[:, 1]] - Vc[gt[:, 0]], Vc[gt[:, 2]] - Vc[gt[:, 0]])
for c in range(3): np.add.at(Nrm, gt[:, c], fn)
Nrm /= np.maximum(np.linalg.norm(Nrm, axis=1, keepdims=True), 1e-12)

# ── 6. glb 쓰기: 근육 그룹마다 메쉬 하나, 스킨 하나 ──
bin_ = bytearray(); views = []; accs = []
def add(arr, target=None, **acc):
    while len(bin_) % 4: bin_.append(0)
    views.append({"buffer": 0, "byteOffset": len(bin_), "byteLength": arr.nbytes, **({"target": target} if target else {})})
    bin_.extend(arr.tobytes()); accs.append({"bufferView": len(views) - 1, "count": len(arr), **acc}); return len(accs) - 1
w8 = np.round(Wt * 255).astype(np.int32); w8[:, 0] += 255 - w8.sum(1); w8 = w8.astype(np.uint8)
j8 = np.where(w8 > 0, order, 0).astype(np.uint8)
nodes = [{"name": b, "translation": [0, 0, 0]} for b in BONES]
ibm = np.tile(np.eye(4, dtype=np.float32), (len(BONES), 1, 1))
skin = {"joints": list(range(len(BONES))), "inverseBindMatrices": add(ibm.reshape(-1, 16), type="MAT4", componentType=5126)}
meshes = []
for gi, (key, S) in enumerate(groups):
    vm = group == gi; remap = -np.ones(N, dtype=np.int64); remap[vm] = np.arange(vm.sum())
    tri = gt[vm[gt[:, 0]]]; ind = remap[tri].astype(np.uint32)
    p = Vc[vm].astype(np.float32); n = Nrm[vm].astype(np.float32)
    attr = {"POSITION": add(p, 34962, type="VEC3", componentType=5126, min=p.min(0).tolist(), max=p.max(0).tolist()),
            "NORMAL": add(n, 34962, type="VEC3", componentType=5126),
            "JOINTS_0": add(j8[vm], 34962, type="VEC4", componentType=5121),
            "WEIGHTS_0": add(w8[vm], 34962, type="VEC4", componentType=5121, normalized=True)}
    meshes.append({"name": f"{key}|{S}", "primitives": [{"attributes": attr, "indices": add(ind.reshape(-1), 34963, type="SCALAR", componentType=5125)}]})
    nodes.append({"name": f"{key}|{S}", "mesh": gi, "skin": 0})
gltf = {"asset": {"version": "2.0", "generator": "gymlog tools/model/build.py",
                  "copyright": "Derived from Z-Anatomy (CC BY-SA 4.0) and BodyParts3D, The Database Center for Life Science (CC BY-SA 2.1 Japan). This file: CC BY-SA 4.0."},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes, "skins": [skin],
        "accessors": accs, "bufferViews": views, "buffers": [{"byteLength": len(bin_)}],
        "extras": {"bones": BONES, "joints": {n: np.round(v, 5).tolist() for n, v in jc.items()}, "bindPron": bind_pron}}
js = json.dumps(gltf, separators=(",", ":")).encode(); js += b" " * (-len(js) % 4)
while len(bin_) % 4: bin_.append(0)
with open(out, "wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
    f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack("<II", len(bin_), 0x004E4942)); f.write(bin_)
print("wrote", out, os.path.getsize(out) // 1024, "KB", "verts", N, "tris", len(gt), "groups", [f"{a}|{b}" for a, b in groups])
