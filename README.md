# 짐로그 (GymLog)

한국어 운동·식단 기록 앱. 사용자 한 명(나)을 위한 앱이라 회원가입·서버 DB 없이 기록은 기기 안(IndexedDB)에 저장된다.
claude.ai 아티팩트로 만들던 것을 Vite + TypeScript 프로젝트로 옮겼다. 아티팩트 원본은 첫 커밋(`0254b9f`)에 그대로 있다.

## 실행

```bash
npm install
npm run dev          # 개발 서버 (http://localhost:5173)
npm run build        # 타입 검사 + dist/ 빌드 (PWA 포함)
npm run preview      # 빌드 결과 미리보기
```

## 검사

```bash
npm test                       # 물리·바벨 관통 회귀 검사, 운동 DB, 저장·백업 (vitest)
npm run build && npm run test:e2e   # 실제 브라우저로 탭·3D·저장·백업·오프라인 확인
node tests/e2e/workout-flow.mjs     # 운동 중 흐름(세트 수정·타이머 복원·삭제 되돌리기·루틴 불러오기)
npm run render -- '{"ids":["bench"],"s":[[0,90],[0.5,90],[1,90],[0],[1]]}' out.png   # 동작 렌더 → 눈으로 확인
node tests/physics/physcheck.mjs [id,id]   # 물리 검사 상세 출력 (알려진 오탐 4건: goblet, rower, bulgarian, stepup)
node tests/physics/barcheck.mjs            # 바벨 관통 상세 출력 (0건이어야 함)
```

## 구조

```
index.html              화면 뼈대
src/
  main.ts               시작점
  types.ts              저장 데이터 타입
  styles/app.css
  app/                  화면 (아티팩트 원본에서 옮긴 코드)
    state.ts            상태 S·ui, markDirty → IndexedDB 저장
    views.ts            네 탭 렌더링 (식단·운동·주간 플랜·운동 가이드)
    sheets.ts           아래에서 올라오는 시트 (음식 추가, 운동 추가, 내 정보 등)
    actions.ts          버튼·입력 처리 (data-act)
    training.ts         회복도, 플랜 템플릿, 볼륨·플랜 피드백, PR
    goals.ts            칼로리·단백질 목표 계산
    catalog.ts util.ts timer.ts
  data/
    exercises.js        운동 222개, STRETCH/COMPOUND/EVIDENCE, 카메라 각도 CAMS, BRAND_MACHINES
    foods.ts            내장 음식 DB
  engine/
    fig.js              3D 동작 엔진 (FK/IK, 동작 패턴, 물리 보정)
    figgl.js            WebGL 렌더러
  platform/             아티팩트 전용 기능을 대체한 부분
    storage.ts          IndexedDB (문서 키: main, d-YYYY-MM-DD)
    backup.ts           JSON 내보내기/가져오기
    ai.ts               Claude 호출 클라이언트 (/api/ai로 요청만 보냄)
server/ai.ts            Claude 프록시 함수 (API 키는 여기에만)
tests/                  unit(vitest) · physics · render · e2e
```

`src/app/*.ts`와 `data/foods.ts`는 원본을 기능 변경 없이 옮긴 코드라 아직 `// @ts-nocheck`다.
새로 쓴 부분(`types.ts`, `state.ts`, `platform/`, `server/`)은 strict 타입 검사를 받는다.

## 데이터

- 기록은 **이 기기의 브라우저 안**에만 있다. '내 정보·목표' → **데이터 백업**에서 JSON으로 내보내고 가져올 수 있다.
- 가져오기는 현재 기록을 백업 내용으로 통째로 바꾼다(확인 창이 뜬다).
- 가져오기는 아티팩트 시절 데이터 모양(`{main, days}` 또는 `{main, "d-날짜": …}`)도 읽는다.
- 기기 간 동기화가 필요해지면 `platform/storage.ts`의 함수 네 개를 같은 모양으로 구현하면 된다.

## Claude 기능 (음식 텍스트·사진 분석, 플랜 추천·피드백, 운동 질문)

브라우저에는 API 키를 두지 않는다. 앱은 `/api/ai`로 요청을 보내고, `server/ai.ts`가 Anthropic API를 호출한다.

- **로컬**: `.env.example`을 `.env.local`로 복사해 `ANTHROPIC_API_KEY`를 넣으면 `npm run dev`에서 바로 동작한다.
- **배포**: `handleAI(request, env)`는 웹 표준 `Request → Response` 함수다. 서버리스 플랫폼의 함수 파일에서 불러 쓰면 된다. 예 (Cloudflare Pages `functions/api/ai.ts`):
  ```ts
  import { handleAI } from "../../server/ai";
  export const onRequestPost = ({ request, env }) => handleAI(request, env);
  ```
- **Vercel**: 저장소에 `api/ai.ts`(함수)와 `vercel.json`이 들어 있다. vercel.com에서 이 저장소를 가져온 뒤 프로젝트 환경 변수에 `ANTHROPIC_API_KEY`와 `GYMLOG_TOKEN`(직접 정한 암호)을 넣고 배포하면 앱과 `/api/ai`가 같은 주소로 올라간다. 앱의 '내 정보·목표 → AI 접속 암호'에 같은 암호를 넣으면 Claude 기능이 켜진다. (이 구성은 실제 Vercel에서 아직 돌려 보지 못했다.)
- GitHub Pages(`https://yooney2006-ops.github.io/-/`)는 정적 파일만 올리므로 Claude 기능이 동작하지 않는다.
- 함수 주소가 앱과 다른 곳이면 빌드할 때 `VITE_AI_ENDPOINT`로 지정한다.
- `GYMLOG_TOKEN`을 설정하면 앱의 '내 정보·목표'에서 같은 암호를 입력해야 호출된다. 공개 주소에 올릴 때는 꼭 설정할 것.
- 함수가 없어도 앱의 나머지(기록, 플랜, 가이드, 3D)는 전부 동작하고, Claude 버튼만 안내 문구를 보여 준다.

## PWA

빌드하면 서비스 워커와 매니페스트가 함께 나온다. HTTPS 주소에 올린 뒤 휴대폰 브라우저에서 "홈 화면에 추가"하면 앱처럼 설치되고 오프라인에서도 기록할 수 있다.
