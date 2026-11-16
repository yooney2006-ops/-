"""claims.py + biblio.json → src/data/db/evidence.json, rules.json (재실행해도 같은 결과)"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, here)
import claims
bib = json.load(open(os.path.join(here, "biblio.json"), encoding="utf-8"))
VERSION = "2026.11.16"
ev = []
for key in sorted(claims.EVIDENCE):
    design, level, pop, value, claim = claims.EVIDENCE[key]; b = bib[key]
    au = b["authors"][:3]; who = (au[0] + (" 외" if b["n_authors"] > 1 else "")) if au else "저자 미확인"
    ev.append({"id": key, "claim": claim, "value": value, "population": pop, "design": design, "level": level,
               "authors": au, "n_authors": b["n_authors"], "cite": f'{who} ({b["year"]}) {b["journal"]}', "year": b["year"], "journal": b["journal"],
               "title": b["title"], "doi": b["doi"], "pmid": b["pmid"],
               "status": "서지만 확인" if key in claims.BIB_ONLY else "검증됨", "checked": b["checked"], "checked_via": b["checked_via"],
               "source": "PubMed·Crossref 서지 + 자체 요약", "version": VERSION})
ids = {e["id"] for e in ev}; full = {e["id"] for e in ev if e["status"] == "검증됨"}
rules = []
for rid, topic, label, value, pop, eids, note, used in claims.RULES:
    assert all(e in ids for e in eids), (rid, eids)
    rules.append({"id": rid, "topic": topic, "label": label, "value": value, "applies_to": pop, "evidence": eids, "note": note, "used_by": used,
                  "status": "근거 연결됨" if any(e in full for e in eids) else "미검증", "source": "자체 규칙", "version": VERSION})
out = os.path.join(here, "..", "..", "src", "data", "db"); os.makedirs(out, exist_ok=True)
json.dump(ev, open(os.path.join(out, "evidence.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump(rules, open(os.path.join(out, "rules.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump([{"cite": c, "reason": r} for c, r in claims.NOT_FOUND], open(os.path.join(out, "unverified.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("evidence", len(ev), "검증됨", len(full), "| rules", len(rules), "미검증", [r["id"] for r in rules if r["status"] == "미검증"])
