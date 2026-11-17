"""논문 후보를 PubMed·Crossref에서 직접 조회해 서지와 초록을 받아 온다 (근거 테이블 검증용).
   python verify_papers.py leads.json out.json
   leads.json: [{"key": "...", "title": "제목 일부", "doi": "(선택)"}]
   초록은 검토용으로만 out.json에 두고 저장소에는 커밋하지 않는다(.gitignore)."""
import json, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET

EU = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
def get(url):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "gymlog-evidence-check/1.0"}), timeout=40) as r:
                return r.read()
        except Exception as e:
            err = e; time.sleep(1.5 * (i + 1))
    raise err

def _sim(a, b):
    import re
    ta, tb = set(re.findall(r"[a-z0-9]+", a.lower())), set(re.findall(r"[a-z0-9]+", b.lower()))
    return len(ta & tb) / max(1, len(ta))

def pubmed(lead):
    """제목(또는 DOI)으로 찾고, 제목이 충분히 일치하는 것만 인정한다. 일치하는 게 없으면 None."""
    if lead.get("pmid"): ids = [str(lead["pmid"])]
    else:
        term = f'{lead["doi"]}[DOI]' if lead.get("doi") else lead["q"] if lead.get("q") else f'{lead["title"]}[Title]'
        ids = json.loads(get(EU + "esearch.fcgi?db=pubmed&retmode=json&retmax=8&term=" + urllib.parse.quote(term)))["esearchresult"]["idlist"]
        time.sleep(.4)
    if not ids: return None
    root = ET.fromstring(get(EU + "efetch.fcgi?db=pubmed&retmode=xml&id=" + ",".join(ids))); time.sleep(.4)
    best = None
    for a in root.findall(".//PubmedArticle"):
        tx = lambda p: "".join(a.find(p).itertext()) if a.find(p) is not None else ""
        title = tx(".//ArticleTitle")
        sim = 1.0 if (lead.get("doi") or lead.get("pmid")) else _sim(lead["title"], title)
        if title.lower().startswith(("comment on", "correction", "erratum", "reply")): sim -= .5
        if best and sim <= best["sim"]: continue
        best = {"sim": round(sim, 2), "pmid": a.findtext(".//PMID"), "n_hits": len(ids), "title": title, "journal": tx(".//Journal/ISOAbbreviation") or tx(".//Journal/Title"),
            "year": tx(".//JournalIssue/PubDate/Year") or tx(".//JournalIssue/PubDate/MedlineDate")[:4],
            "authors": [(x.findtext("LastName") or x.findtext("CollectiveName") or "") for x in a.findall(".//Author")],
            "types": [t.text for t in a.findall(".//PublicationType")],
            "doi": next((e.text for e in a.findall(".//ArticleId") if e.get("IdType") == "doi"), ""),
            "abstract": " ".join((("[" + s.get("Label") + "] ") if s.get("Label") else "") + "".join(s.itertext()) for s in a.findall(".//Abstract/AbstractText"))}
    return best if best and best["sim"] >= (.55 if lead.get("q") else .8) else None

def crossref(doi):
    try:
        m = json.loads(get("https://api.crossref.org/works/" + urllib.parse.quote(doi)))["message"]
        return {"title": (m.get("title") or [""])[0], "journal": (m.get("container-title") or [""])[0], "year": (m.get("issued", {}).get("date-parts") or [[None]])[0][0],
                "authors": [x.get("family", "") for x in m.get("author", [])], "type": m.get("type"), "doi": m.get("DOI")}
    except Exception as e:
        return {"error": str(e)}

leads = json.load(open(sys.argv[1])); out = []
for L in leads:
    r = {"key": L["key"], "lead": L}
    try: r["pubmed"] = pubmed(L)
    except Exception as e: r["pubmed_error"] = str(e)
    doi = L.get("doi") or (r.get("pubmed") or {}).get("doi")
    if doi: r["crossref"] = crossref(doi); time.sleep(.2)
    out.append(r)
    p = r.get("pubmed")
    print(f'{L["key"]:12} ' + (f'PMID {p["pmid"]} ({p["n_hits"]}건) {p["year"]} {p["journal"]} | {", ".join(p["authors"][:3])} | {p["title"][:90]}' if p else "PubMed 없음") +
          (f' || Crossref: {r["crossref"].get("year")} {str(r["crossref"].get("title"))[:50]}' if "crossref" in r else ""))
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
