# 자체 DB (지식 베이스) 만들기

앱은 서버 DB 없이 동작한다. 참조 데이터는 이 폴더의 스크립트가 만들어 앱에 묶고, 사용자별 캐시·검증 대기는 기기의 IndexedDB에 둔다.

| 무엇 | 만드는 곳 | 결과 | 출처 · 라이선스 |
|---|---|---|---|
| 근거(논문) | `claims.py` + `biblio.json` → `build_kb.py` | `src/data/db/evidence.json` | 서지: PubMed·Crossref 조회, 내용: 자체 요약 |
| 규칙(권장값) | `claims.py` → `build_kb.py` | `src/data/db/rules.json` | 자체 규칙, 근거 레코드 연결 |
| 확인 못한 자료 | `claims.py` | `src/data/db/unverified.json` | — |
| 별칭·한영 단어 | 직접 편집 | `src/data/db/aliases.json` | 자체 작성 |
| 음식(추가) | `import_foods.py` | `public/data/foods.json` (아직 없음) | USDA FoodData Central(CC0), 식약처(이용허락범위 제한 없음) |

## 근거를 추가할 때

1. 후보를 `leads.json`에 적는다: `[{"key": "...", "title": "제목"} 또는 {"doi": "..."} 또는 {"pmid": 123}]`
2. `python verify_papers.py leads.json out.json` — PubMed·Crossref에서 서지와 초록을 받아 온다(제목이 충분히 일치할 때만 인정).
3. `out.json`의 초록을 **직접 읽고** `claims.py`에 자체 문장으로 요약과 수치를 적는다. 초록에 없는 수치는 적지 않는다. 초록 원문은 저장하지 않는다(`out.json`은 커밋 제외).
4. 서지는 `biblio.json`에 넣고 `python build_kb.py`. 규칙에 연결된 확인 근거가 없으면 자동으로 '미검증'이 된다.

기억으로 논문·DOI·수치를 적지 않는다. 찾지 못한 것은 `NOT_FOUND`에 남긴다.

## 음식 데이터를 넣을 때

```bash
python tools/db/import_foods.py --usda <FoodData_Central_*.json> --mfds <식약처.csv> --retrieved 2026-11-16 --out public/data/foods.json
python tools/db/test_import.py
```
- 식약처 파일은 열 이름을 `mfds_columns.json`에 먼저 채운다(확인하지 못해 비워 둠).
- USDA 변환은 공개 문서의 구조에 맞춘 가짜 표본으로만 검사했다. 실제 파일로 처음 돌릴 때 건너뛴 개수(`skipped_missing_values`)를 확인할 것.
- `public/data/foods.json`이 없으면 앱은 내장 음식 76개(출처가 '근삿값'이라 미검증)와 검증을 통과한 AI 응답만으로 동작한다.

## 기기 안 저장소 (IndexedDB `gymlog` v2)

`docs`(사용자 기록, v1부터) · `ai_cache`(AI 응답 캐시) · `pending`(AI 응답 검증 대기) · `promoted`(검증 통과 음식) · `search_miss`(검색 실패 쿼리) · `ai_log`(지점별 DB/캐시/AI 횟수).
콘솔에서 `await gymlog.aiStats()` 로 호출 수를 볼 수 있다.
