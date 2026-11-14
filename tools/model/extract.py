"""1단계 (Blender 필요): Z-Anatomy Startup.blend에서 필요한 근육·뼈를 꺼내 삼각형 수를 줄여 .npz로 저장.
   python extract.py <Startup.blend> <out.npz> [목표 삼각형 수]"""
import sys, os
import bpy, bmesh
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config

src, out = sys.argv[1], sys.argv[2]
budget = int(sys.argv[3]) if len(sys.argv) > 3 else 90000
bpy.ops.wm.open_mainfile(filepath=src)

objs = []
for cname, kind in (("4: Muscular system", "muscle"), ("1: Skeletal system", "bone")):
    for o in bpy.data.collections[cname].all_objects:
        if o.type == "MESH" and config.included(o.name, len(o.data.polygons)):
            objs.append((o, kind))

dg = bpy.context.evaluated_depsgraph_get()
def tri_count(o):
    m = o.evaluated_get(dg).to_mesh(); n = sum(len(p.vertices) - 2 for p in m.polygons); o.evaluated_get(dg).to_mesh_clear(); return n
counts = [tri_count(o) for o, _ in objs]
print("objects", len(objs), "tris before", sum(counts))

# 작은 물체는 최소 삼각형 수를 보장하고, 나머지는 같은 비율로 줄인다 (뼈는 근육의 0.6배)
FLOOR = 70
def total(r):
    return sum(min(c, max(FLOOR, c * r * (1 if k == "muscle" else .6))) for c, (_, k) in zip(counts, objs))
lo, hi = 0.0, 1.0
for _ in range(40):
    mid = (lo + hi) / 2
    if total(mid) > budget: hi = mid
    else: lo = mid
ratio = lo
print("ratio", round(ratio, 4))

names, kinds, V, T, VO, TO = [], [], [], [], [0], [0]
for (o, kind), c in zip(objs, counts):
    target = min(c, max(FLOOR, c * ratio * (1 if kind == "muscle" else .6)))
    if target < c:
        mod = o.modifiers.new("dec", "DECIMATE"); mod.ratio = target / c
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg); m = ev.to_mesh()
    bm = bmesh.new(); bm.from_mesh(m); bmesh.ops.triangulate(bm, faces=bm.faces)
    mw = ev.matrix_world
    v = np.array([tuple(mw @ x.co) for x in bm.verts], dtype=np.float32)
    t = np.array([[x.index for x in f.verts] for f in bm.faces], dtype=np.uint32)
    if mw.determinant() < 0: t = t[:, ::-1].copy()        # 좌우 대칭 복사본은 면 방향이 뒤집혀 있다
    bm.free(); ev.to_mesh_clear()
    if len(t) == 0: continue
    names.append(o.name); kinds.append(kind); V.append(v); T.append(t); VO.append(VO[-1] + len(v)); TO.append(TO[-1] + len(t))
print("objects out", len(names), "verts", VO[-1], "tris", TO[-1])
np.savez_compressed(out, names=np.array(names), kinds=np.array(kinds), verts=np.concatenate(V), tris=np.concatenate(T),
                    voff=np.array(VO), toff=np.array(TO))
