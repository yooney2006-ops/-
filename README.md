# 짐로그 (GymLog)

Claude 아티팩트로 만든 운동·식단 기록 앱의 원본 소스입니다. Claude Code에서 이어서 개발하기 위한 출발점입니다.

## 구조

```
src/
  app.html    UI 전체 (식단·운동·플랜·가이드 탭, 플랜 피드백, 회복도, 근육 맵, PR, 캘린더)
  exdata.js   운동 DB (기본 111개 + 해머 스트렝스·노틸러스 111개), 근거 기반 수치, 카메라 각도(CAMS)
  fig.js      3D 동작 엔진: 관절 FK/IK, 동작 패턴 라이브러리, 물리 보정(발 접지·무게중심·바벨 관통 방지), 근육 장면 구성
  figgl.js    WebGL 렌더러 (깊이 버퍼, 회전체 근육, 조명)
build.py      src/를 하나로 합쳐 index.html 생성 (exdata.js → /*@@EXDATA@@*/, fig.js+figgl.js → /*@@FIG@@*/)
test/
  physcheck.js  물리 타당성 검사 (바닥 관통, 관절 한계, 무릎 방향, 무게중심)   node physcheck.js [id,id]
  barcheck.js   바벨-몸 관통 검사                                               node barcheck.js
  revshot.js    운동별 프레임 렌더링 (playwright 필요)
  app2.js/app4.js 브라우저 동작 테스트
```

빌드: `python3 build.py` → `index.html`

## 아티팩트 전용 기능 — 옮길 때 바꿔야 할 것

| 기능 | 아티팩트에서 | 독립 앱에서 대안 |
|---|---|---|
| 데이터 저장 | `claude.use("db")` — `data/users/<uid>/` 문서 (`main`, `d-YYYY-MM-DD`) | IndexedDB/localStorage(이미 폴백 있음), 기기 간 동기화가 필요하면 Supabase·Firebase |
| 사용자 식별 | `claude.use("user")` | 로그인 없이 단일 사용자 또는 Supabase Auth |
| 음식 사진·텍스트 분석 | `claude.use("sample")` (Claude 호출, 이미지 지원) | Anthropic API를 서버(또는 서버리스 함수)에서 호출 — API 키는 브라우저에 두지 말 것 |

`src/app.html`의 `store` 객체(약 340–390행)와 `samplePromise`가 이 부분입니다. 여기만 어댑터로 감싸면 나머지는 그대로 동작합니다.

## 추천 다음 단계

1. **Vite + TypeScript로 모듈화** — app.html을 탭별 모듈로 쪼개고, exdata를 JSON/TS로.
2. **3D를 three.js + 리깅된 인체 모델(glTF)로 교체** — 현재는 도형으로 근육을 만든 절차적 모형이라 사실감에 한계가 있음. 리깅된 메시에 fig.js의 관절 각도/IK 결과를 그대로 본(bone)에 적용하고, 근육 부위별 머티리얼로 주동근·보조근을 칠하는 방식이 가장 큰 개선.
3. **PWA** — 휴대폰 홈 화면 설치, 오프라인 기록.
4. **음식 분석 API 프록시** — Cloudflare Workers/Vercel 함수 하나로 Anthropic API 호출.
5. **테스트를 CI로** — physcheck·barcheck를 회귀 테스트로 고정.
