"""python tools/db/test_import.py — 가져오기 스크립트 검사 (가짜 표본 사용)"""
import csv, json, os, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
import import_foods as I
d1 = I.build([os.path.join(here, "fixtures", "usda_sample.json")], retrieved="2026-01-01"); d2 = I.build([os.path.join(here, "fixtures", "usda_sample.json")], retrieved="2026-01-01")
assert json.dumps(d1, sort_keys=True) == json.dumps(d2, sort_keys=True), "재실행 결과가 달라짐"
f = {x["name"]: x for x in d1["foods"]}
assert len(d1["foods"]) == 2 and d1["meta"]["skipped_missing_values"] == 1 and d1["meta"]["duplicates_removed"] == 1, d1["meta"]
a, b = f["Test food A, raw"], f["Test food B (Atwater energy only)"]
assert (a["kcal"], a["protein"], a["sodium"], a["sugar"]) == (100, 10.0, 55, None), a          # 없는 당류는 null
assert b["kcal"] == 99 and b["sugar"] == 12 and b["sodium"] is None, b                          # kJ는 쓰지 않고 kcal(Atwater)만
assert all(x["source"] and x["license"] and x["status"] and x["grams"] == 100 for x in d1["foods"])
# 식약처: 열 이름을 채운 경우 100g 환산과 중복 우선순위
with tempfile.TemporaryDirectory() as t:
    p = os.path.join(t, "m.csv"); c = os.path.join(t, "c.json")
    with open(p, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh); w.writerow(["식품명", "기준량", "열량", "탄수", "단백", "지방", "나트륨"]); w.writerow(["시험 음식", "200", "300", "40", "20", "6", "1,000"]); w.writerow(["값 없는 음식", "100", "", "1", "1", "1", ""])
    json.dump({"encoding": "utf-8-sig", "name": "식품명", "base_grams": "기준량", "kcal": "열량", "carb": "탄수", "protein": "단백", "fat": "지방", "sodium": "나트륨"}, open(c, "w", encoding="utf-8"))
    d = I.build([], p, c); m = d["foods"][0]
    assert len(d["foods"]) == 1 and (m["kcal"], m["carb"], m["protein"], m["fat"], m["sodium"]) == (150, 20.0, 10.0, 3.0, 500), m
print("가져오기 검사 통과")
