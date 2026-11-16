"""공개 음식 데이터 → public/data/foods.json (앱이 시작할 때 읽는 추가 음식 DB)

  python import_foods.py --usda FoodData_Central_foundation_food_json_*.json [--usda sr_legacy.json] \
                         [--mfds 식약처.csv --mfds-columns mfds_columns.json] --out ../../public/data/foods.json

- 100g 기준으로 정규화(열량 kcal, 탄수·단백질·지방·당 g, 나트륨 mg), 이름+브랜드로 중복 제거, 이름순 정렬 → 재실행해도 같은 결과.
- 값이 없는 영양소는 지어내지 않고 null로 둔다. 열량·탄수·단백질·지방 중 하나라도 없으면 그 음식은 건너뛰고 개수를 보고한다.
- 출처·라이선스·가져온 날짜를 파일과 레코드에 기록한다.

주의: USDA 형식은 공개 문서의 JSON 구조에 맞춰 작성했고, 이 저장소의 테스트는 같은 구조의 작은 가짜 표본으로만 돌렸다
(실제 파일은 내려받지 못함). 식약처 파일은 열 이름을 확인하지 못해 mfds_columns.json에 직접 적어야 한다."""
import argparse, csv, json, re, sys, unicodedata

USDA = {"name": "USDA FoodData Central", "license": "CC0 1.0 (퍼블릭 도메인)", "url": "https://fdc.nal.usda.gov/download-datasets"}
MFDS = {"name": "식품의약품안전처 식품영양성분 데이터베이스", "license": "공공데이터포털 이용허락범위 제한 없음", "url": "https://www.data.go.kr/data/15127578/openapi.do"}
# USDA 영양소 번호 (nutrient.number)
N_KCAL, N_KCAL_ATWATER, N_PROT, N_FAT, N_CARB, N_SUGAR, N_SODIUM = ("208",), ("957", "958"), ("203",), ("204",), ("205",), ("269", "269.3"), ("307",)

def key(name, brand=""): return re.sub(r"\s+", "", unicodedata.normalize("NFKC", f"{name}|{brand}").lower())
def rnd(v, n=1): return None if v is None else round(float(v), n)

def from_usda(path):
    doc = json.load(open(path, encoding="utf-8")); out = []; skipped = 0
    foods = next(v for v in doc.values() if isinstance(v, list))
    for f in foods:
        nut = {}
        for fn in f.get("foodNutrients", []):
            n = fn.get("nutrient") or {}
            if fn.get("amount") is not None and n.get("number") is not None: nut.setdefault(str(n["number"]), (fn["amount"], (n.get("unitName") or "").lower()))
        def pick(nums, unit=None):
            for x in nums:
                if x in nut and (unit is None or nut[x][1] == unit): return nut[x][0]
            return None
        kcal = pick(N_KCAL, "kcal"); kcal = pick(N_KCAL_ATWATER, "kcal") if kcal is None else kcal
        p, fat, c = pick(N_PROT), pick(N_FAT), pick(N_CARB)
        if None in (kcal, p, fat, c) or not f.get("description"): skipped += 1; continue
        out.append({"name": f["description"].strip(), "serving": "100g", "grams": 100, "kcal": rnd(kcal, 0), "carb": rnd(c), "protein": rnd(p), "fat": rnd(fat),
                    "sugar": rnd(pick(N_SUGAR)), "sodium": rnd(pick(N_SODIUM, "mg"), 0), "brand": f.get("brandOwner") or "", "barcode": f.get("gtinUpc") or None,
                    "cat": (f.get("foodCategory") or {}).get("description", ""), "src": "usda", "source_id": str(f.get("fdcId", "")), "source": USDA["name"], "license": USDA["license"], "status": "검증됨(공개 데이터)"})
    return out, skipped

def from_mfds(path, colpath):
    col = json.load(open(colpath, encoding="utf-8"))
    need = ["name", "base_grams", "kcal", "carb", "protein", "fat"]
    if any(not col.get(k) for k in need): sys.exit("mfds_columns.json에 열 이름을 먼저 채워 주세요: " + ", ".join(k for k in need if not col.get(k)))
    out = []; skipped = 0
    def num(row, k):
        v = (row.get(col.get(k) or "") or "").replace(",", "").strip()
        try: return float(v)
        except ValueError: return None
    for row in csv.DictReader(open(path, encoding=col.get("encoding", "utf-8-sig"))):
        base = num(row, "base_grams"); vals = {k: num(row, k) for k in ("kcal", "carb", "protein", "fat", "sugar", "sodium")}
        name = (row.get(col["name"]) or "").strip()
        if not name or not base or None in (vals["kcal"], vals["carb"], vals["protein"], vals["fat"]): skipped += 1; continue
        k = 100.0 / base                                                # 기준량이 100g이 아니면 100g으로 환산
        out.append({"name": name, "serving": "100g", "grams": 100, "kcal": rnd(vals["kcal"] * k, 0), "carb": rnd(vals["carb"] * k), "protein": rnd(vals["protein"] * k), "fat": rnd(vals["fat"] * k),
                    "sugar": rnd(vals["sugar"] * k) if vals["sugar"] is not None else None, "sodium": rnd(vals["sodium"] * k, 0) if vals["sodium"] is not None else None,
                    "brand": (row.get(col.get("brand") or "") or "").strip(), "barcode": None, "cat": (row.get(col.get("category") or "") or "").strip(),
                    "src": "mfds", "source_id": (row.get(col.get("code") or "") or "").strip(), "source": MFDS["name"], "license": MFDS["license"], "status": "검증됨(공개 데이터)"})
    return out, skipped

def build(usda=(), mfds=None, mfds_columns=None, retrieved=""):
    rows, skipped, sources = [], 0, []
    if mfds: r, s = from_mfds(mfds, mfds_columns); rows += r; skipped += s; sources.append(MFDS)      # 한국 데이터를 먼저 → 중복 시 우선
    for p in usda: r, s = from_usda(p); rows += r; skipped += s
    if usda: sources.append(USDA)
    seen, out = set(), []
    for f in rows:
        k = key(f["name"], f["brand"])
        if k in seen: continue
        seen.add(k); out.append(f)
    out.sort(key=lambda f: (f["src"], key(f["name"], f["brand"])))
    return {"meta": {"version": retrieved or "unknown", "retrieved": retrieved, "sources": sources, "count": len(out), "skipped_missing_values": skipped, "duplicates_removed": len(rows) - len(out)}, "foods": out}

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--usda", action="append", default=[]); ap.add_argument("--mfds"); ap.add_argument("--mfds-columns", default="mfds_columns.json")
    ap.add_argument("--retrieved", default="", help="데이터를 받은 날짜 (YYYY-MM-DD)"); ap.add_argument("--out", required=True)
    a = ap.parse_args(); doc = build(a.usda, a.mfds, a.mfds_columns, a.retrieved)
    # 파일 크기를 줄이려고 레코드마다 반복되는 출처·라이선스·상태는 meta.defaults[src]로 한 번만 적는다(앱이 읽을 때 채움)
    doc["meta"]["defaults"] = {}
    for f in doc["foods"]:
        doc["meta"]["defaults"].setdefault(f["src"], {"source": f["source"], "license": f["license"], "status": f["status"]})
        for k in ("source", "license", "status"): del f[k]
        for k in ("brand", "barcode", "cat", "sugar", "sodium"):
            if f.get(k) in ("", None): f.pop(k, None)
    json.dump(doc, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(json.dumps(doc["meta"], ensure_ascii=False))
