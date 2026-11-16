// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { EXMAP, PARTS } from "./catalog";
import { ACTS, GOALS, calcTargets } from "./goals";
import { S, dayKey, markDirty, ui } from "./state";
import { exPart } from "./training";
import { day, esc, r0, r1 } from "./util";
import { MEALS, exDetail } from "./views";
import { BRANDS, EX, MUSCLE_KO } from "../data/exercises.js";
import { FOOD_DB } from "../data/foods";
import { FIG } from "../engine/fig.js";
import { getAIToken } from "../platform/ai";
import { getExtraFoods, searchFoods, searchExercises } from "../platform/kb";
import { logMiss } from "../platform/search";

/* 시트 (모달)
   ============================================================ */
export function openSheet(html){ if(ui.fig){ui.fig.stop();ui.fig=null;} const s=document.getElementById("sheet"); s.innerHTML=html; s.classList.add("open"); document.getElementById("backdrop").classList.add("open"); const f=s.querySelector("input,textarea,select,button"); if(f) f.focus(); }
export function closeSheet(){ if(ui.fig){ui.fig.stop();ui.fig=null;} document.getElementById("sheet").classList.remove("open"); document.getElementById("backdrop").classList.remove("open"); ui.sheet=null; }

/* 음식 추가 */
export function foodSheet(meal,mode="search"){
  ui.sheet={kind:"food",meal,mode,sel:null,qty:1,q:ui.sheet?.q||""};
  drawFoodSheet();
}
export function drawFoodSheet(){
  const st=ui.sheet; const modes=[["search","검색"],["ai","말로 입력 ✦"],["photo","사진·성분표 ✦"],["manual","직접 입력"]];
  let h=`<div class="spread"><h2>음식 추가</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
  <div class="seg">${MEALS.map(m=>`<button class="chip ${st.meal===m?"on":""}" data-act="sheetMeal" data-m="${m}">${m}</button>`).join("")}</div>
  <div class="seg">${modes.map(([k,l])=>`<button class="btn sm ${st.mode===k?"primary":""}" data-act="sheetMode" data-m="${k}">${l}</button>`).join("")}</div>`;
  if(st.mode==="search"){
    h+=`<input type="search" id="foodQ" placeholder="음식 이름 (예: 닭가슴살, 김밥)" value="${esc(st.q)}" data-inp="foodQ"><div class="results" id="foodRes">${foodResults()}</div><div id="foodPick">${foodPick()}</div>`;
  }else if(st.mode==="ai"){
    h+=`<p class="small muted" style="margin:0 0 6px">먹은 걸 편하게 적으면 Claude가 음식별로 나눠 영양성분을 추정해요.</p><textarea id="aiFoodIn" placeholder="예: 점심에 제육덮밥 한 그릇이랑 콜라 반 캔, 후식으로 바나나 1개">${esc(st.aiText||"")}</textarea><div class="row" style="margin-top:8px"><button class="btn primary ai" data-act="aiParse" ${ui.aiBusy?"disabled":""}>영양성분 분석</button></div><div id="aiParseOut">${parsedList()}</div>`;
  }else if(st.mode==="photo"){
    h+=`<p class="small muted" style="margin:0 0 6px">제품 뒷면 영양성분표나 음식 사진을 올리면 Claude가 읽어 와요.</p><input type="file" accept="image/*" id="photoIn"><input type="text" id="photoNote" placeholder="메모 (선택): 예) 반 봉지만 먹음" style="margin-top:8px"><div class="row" style="margin-top:8px"><button class="btn primary ai" data-act="aiPhoto" ${ui.aiBusy?"disabled":""}>사진 분석</button></div><div id="aiParseOut">${parsedList()}</div>`;
  }else{
    h+=`<div class="grid2"><label class="f" style="grid-column:span 2">음식 이름<input type="text" id="mName"></label><label class="f">제공량 표기<input type="text" id="mServ" placeholder="1개, 100g"></label><label class="f">칼로리(kcal)<input type="number" id="mKcal"></label><label class="f">탄수화물(g)<input type="number" id="mC"></label><label class="f">단백질(g)<input type="number" id="mP"></label><label class="f">지방(g)<input type="number" id="mF"></label><label class="f">나트륨(mg)<input type="number" id="mNa"></label></div><label class="row small" style="margin-top:8px"><input type="checkbox" id="mSave" checked style="width:auto"> 내 음식 목록에 저장</label><div class="row" style="margin-top:8px"><button class="btn primary" data-act="manualAdd">추가</button></div>`;
  }
  openSheet(h);
  if(st.mode==="search"){ const q=document.getElementById("foodQ"); q.focus(); q.setSelectionRange(q.value.length,q.value.length); }
}
export function allFoods(){ return [...(S.main.customFoods||[]).map(f=>({...f,custom:true})),...FOOD_DB,...getExtraFoods()]; }
export function foodResults(){
  const q=ui.sheet.q.trim().replace(/\s/g,"");
  let list=allFoods();
  if(q){ list=searchFoods(S.main.customFoods||[],ui.sheet.q); if(!list.length) logMiss("food",ui.sheet.q); }  // 별칭·초성·오타·한영 검색
  else{ // 최근 먹은 것 우선
    const recent=[]; Object.keys(S.days).sort().reverse().slice(0,14).forEach(d=>(S.days[d].meals||[]).forEach(m=>{ if(!recent.find(r=>r.name===m.name)) recent.push(m); }));
    list=[...recent.slice(0,8).map(r=>({...r,recent:true})),...list.filter(f=>!recent.slice(0,8).find(r=>r.name===f.name))];
  }
  if(!list.length) return `<div class="empty small">"${esc(ui.sheet.q)}"는 DB에 없어요. <button class="btn sm ai" data-act="aiLookup">Claude로 영양성분 찾기</button></div>`;
  return list.slice(0,40).map((f,i)=>`<button class="res ${ui.sheet.sel&&ui.sheet.sel.name===f.name?"sel":""}" data-act="pickFood" data-name="${esc(f.name)}"><span><b>${esc(f.name)}</b> <span class="muted xs">${esc(f.serving)}${f.grams?` (${f.grams}g)`:""}${f.recent?" · 최근":""}${f.custom?" · 내 음식":""}</span></span><span class="num small">${r0(f.kcal)} kcal</span></button>`).join("")+(q?`<button class="res" data-act="aiLookup"><span class="muted">찾는 게 없나요? <b style="color:var(--accent)">✦ Claude로 "${esc(ui.sheet.q)}" 영양성분 찾기</b></span></button>`:"");
}
export function foodPick(){
  const f=ui.sheet.sel; if(!f) return "";
  const q=ui.sheet.qty;
  return `<div class="card" style="margin-top:10px;background:var(--surface-2)"><div class="spread"><div><b>${esc(f.name)}</b> <span class="muted small">${esc(f.serving)} 기준</span><div class="pcf"><span class="num">${r0(f.kcal*q)} kcal</span><span class="c">탄 ${r1(f.carb*q)}g</span><span class="p">단 ${r1(f.protein*q)}g</span><span class="f">지 ${r1(f.fat*q)}g</span></div></div>
  <div class="row"><span class="stepper"><button data-act="pickQty" data-d="-0.5" aria-label="줄이기">−</button><span class="num">${q}</span><button data-act="pickQty" data-d="0.5" aria-label="늘리기">+</button></span><button class="btn primary" data-act="confirmFood">${esc(ui.sheet.meal)}에 추가</button></div></div></div>`;
}
export function parsedList(){
  const L=ui.sheet.parsed; if(!L||!L.length) return "";
  return `<div class="results">${L.map((f,i)=>`<div class="res" style="cursor:default"><span><b>${esc(f.name)}</b> <span class="muted xs">${esc(f.serving||"")} × ${f.qty||1}${f.src==="db"?" · DB":f.check?(f.check.ok?" · AI 추정(검증 통과)":" · AI 추정 · 확인 필요: "+esc(f.check.reasons.join(", "))):""}</span><div class="pcf"><span class="c">탄 ${r1(f.carb*(f.qty||1))}</span><span class="p">단 ${r1(f.protein*(f.qty||1))}</span><span class="f">지 ${r1(f.fat*(f.qty||1))}</span></div></span><span class="row"><span class="num small">${r0(f.kcal*(f.qty||1))} kcal</span><button class="btn sm icon ghost" data-act="dropParsed" data-i="${i}" aria-label="빼기">✕</button></span></div>`).join("")}</div>${ui.sheet.note?`<p class="xs muted">${esc(ui.sheet.note)}</p>`:""}<div class="row" style="margin-top:8px"><button class="btn primary" data-act="addParsed">${esc(ui.sheet.meal)}에 모두 추가</button></div>`;
}
export const NUTRI_SCHEMA=`JSON만 출력: {"items":[{"name":"음식명(한국어)","serving":"1회 제공량 표기 예: 1공기, 1개, 100g","grams":숫자,"kcal":숫자,"carb":숫자,"protein":숫자,"fat":숫자,"sugar":숫자,"sodium":숫자(mg),"qty":먹은 제공량 개수(숫자, 반이면 0.5)}],"note":"추정 근거 한 줄"}. 모든 영양값은 1회 제공량(qty=1) 기준.`;
export function normFood(x){ const n=k=>Math.max(0,+x[k]||0); return {name:String(x.name||"음식").slice(0,40),serving:String(x.serving||"1회").slice(0,20),grams:n("grams"),kcal:n("kcal"),carb:n("carb"),protein:n("protein"),fat:n("fat"),sugar:n("sugar"),sodium:n("sodium"),qty:Math.max(0.25,+x.qty||1)}; }

/* 운동 추가/교체 */
export function exSheet(target, swapIdx=null){
  ui.sheet={kind:"ex",target,swapIdx,q:"",part:swapIdx!=null?exPart(getItems(target)[swapIdx]):"전체",preview:swapIdx!=null?getItems(target)[swapIdx].exId:null};
  drawExSheet();
}
export function exListHtml(){
  const st=ui.sheet; const q=st.q.trim().replace(/\s/g,"");
  const br=st.brand||"전체";
  const list=(q?searchExercises(st.q):EX).filter(e=>(br==="전체"||(br==="일반"?!e.brand:e.brand===br))&&(st.part==="전체"||e.part===st.part));
  if(q&&!list.length) logMiss("exercise",st.q);
  return list.map(e=>`<div class="res ${st.preview===e.id?"sel":""}" style="cursor:default;align-items:center"><button class="exrow" data-act="previewEx" data-id="${e.id}" aria-label="${esc(e.name)} 미리보기"><span><b>${esc(e.name)}</b> <span class="muted xs">${e.part} · ${e.brand?esc(e.equip):e.cat}</span>${e.stretch?` <span class="chip badge-s" style="font-size:11px">스트레치</span>`:""}<br><span class="xs" style="color:var(--muted)">${e.prim.map(k=>MUSCLE_KO[k]).join(", ")}</span></span></button><button class="btn sm" data-act="pickEx" data-id="${e.id}">${st.swapIdx!=null?"교체":"추가"}</button></div>`).join("")
   +(st.q.trim()&&!EX.some(e=>e.name===st.q.trim())?`<button class="res" data-act="pickCustomEx"><span>목록에 없는 운동 <b>"${esc(st.q.trim())}"</b> 추가 (${st.part==="전체"?"기타":st.part})</span></button>`:"");
}
export function exPreviewHtml(){
  const e=EXMAP[ui.sheet.preview]; if(!e) return `<div class="empty small" style="padding:14px">운동 이름을 누르면 여기서 동작 미리보기와 타깃 근육을 볼 수 있어요.</div>`;
  return `<div class="viewer" style="margin-top:0"><span class="vhint">${esc(e.name)} · 드래그로 회전</span><canvas id="pickCanvas" style="height:230px"></canvas></div>
  <div class="legend" style="margin-top:6px"><span><i class="sw" style="background:var(--fig-prim)"></i><b>${e.prim.map(k=>MUSCLE_KO[k]).join(", ")}</b></span>${e.sec.length?`<span><i class="sw" style="background:var(--fig-sec)"></i>${e.sec.map(k=>MUSCLE_KO[k]).join(", ")}</span>`:""}</div>
  <div class="xs muted" style="margin-top:4px">${esc(e.tips[0])}${e.stretch?` · <span style="color:var(--prot)">스트레치 강조 (근거 ${e.stretch.lvl})</span>`:""}</div>
  <div class="row" style="margin-top:8px"><button class="btn primary sm" data-act="pickEx" data-id="${e.id}">이 운동 ${ui.sheet.swapIdx!=null?"으로 교체":"추가"}</button><button class="btn sm ghost" data-act="exDetailFromPick" data-id="${e.id}">자세한 팁</button></div>`;
}
export function startPickViewer(){ if(ui.fig){ui.fig.stop();ui.fig=null;} const cv=document.getElementById("pickCanvas"); const e=EXMAP[ui.sheet.preview]; if(cv&&e){ try{ui.fig=FIG.viewer(cv,e);}catch(err){} } }
export function drawExSheet(){
  const st=ui.sheet;
  let h=`<div class="spread"><h2>${st.swapIdx!=null?"같은 부위 운동으로 교체":"운동 추가"}</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
  <div id="exPrev">${exPreviewHtml()}</div>
  <input type="search" id="exQ" placeholder="운동·근육 검색 또는 새 운동 이름" value="${esc(st.q)}" data-inp="exQ" style="margin-top:10px">
  <div class="row" style="margin-top:8px">${["전체",...PARTS].map(p=>`<button class="chip ${st.part===p?"on":""}" data-act="exPart" data-p="${p}">${p}</button>`).join("")}</div>
  <div class="row" style="margin-top:6px">${["전체",...BRANDS,"일반"].map(p=>`<button class="chip ${(st.brand||"전체")===p?"on":""}" data-act="pickBrand" data-p="${p}">${p}</button>`).join("")}</div>
  <div class="results" id="exRes" style="max-height:34vh">${exListHtml()}</div>`;
  openSheet(h); startPickViewer();
}
export function getItems(target){
  if(target==="log") return day().workout.items;
  return S.main.plan[+target.slice(4)].items;
}
export function saveTarget(target){ if(target==="log") markDirty(dayKey(ui.date)); else markDirty("main"); }

/* 프로필 */
export function profileSheet(){
  const p=S.main.profile; const T=calcTargets(); const o=S.main.override;
  openSheet(`<div class="spread"><h2>내 정보·목표</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
  <div class="grid3"><label class="f">성별<select id="pSex"><option value="m" ${p.sex==="m"?"selected":""}>남</option><option value="f" ${p.sex==="f"?"selected":""}>여</option></select></label>
  <label class="f">나이<input type="number" id="pAge" value="${p.age}"></label><label class="f">키(cm)<input type="number" id="pH" value="${p.height}"></label>
  <label class="f">체중(kg)<input type="number" id="pW" value="${p.weight}" step="0.1"></label>
  <label class="f" style="grid-column:span 2">활동량<select id="pAct">${ACTS.map(([v,l])=>`<option value="${v}" ${p.activity==v?"selected":""}>${l}</option>`).join("")}</select></label>
  <label class="f" style="grid-column:span 3">목표<select id="pGoal">${Object.entries(GOALS).map(([k,l])=>`<option value="${k}" ${p.goal===k?"selected":""}>${l}</option>`).join("")}</select></label></div>
  <div class="card" style="margin-top:12px;background:var(--surface-2)"><div class="small muted">자동 계산 · 기초대사량 <b class="num">${T.bmr}</b> · 유지 칼로리 <b class="num">${T.tdee}</b> kcal</div>
  <div class="small" style="margin-top:4px"><button class="why" data-act="why" data-rule="protein_keep,protein_bulk,protein_cut,kcal_cut,kcal_bulk,bmr" style="float:right">근거</button>감량 −450kcal, 벌크업 +300kcal · 단백질 체중×${p.goal==="keep"?"1.6":p.goal==="cut"?"2.2":"1.8"}g · 지방 25%</div><div class="xs muted" style="margin-top:4px">단백질 근거: 하루 약 1.6g/kg 이상에서는 근육 증가 효과가 평탄해져요 (Morton 2018, 상한 약 2.2g/kg)</div></div>
  <label class="row small" style="margin-top:10px"><input type="checkbox" id="pOv" ${o?"checked":""} style="width:auto"> 목표 수치 직접 지정</label>
  <div class="grid2" style="margin-top:6px"><label class="f">칼로리<input type="number" id="oK" value="${T.kcal}"></label><label class="f">탄수화물 g<input type="number" id="oC" value="${T.carb}"></label><label class="f">단백질 g<input type="number" id="oP" value="${T.protein}"></label><label class="f">지방 g<input type="number" id="oF" value="${T.fat}"></label></div>
  <div class="row" style="margin-top:12px"><button class="btn primary" data-act="saveProfile">저장</button></div>
  <div class="card" style="margin-top:16px;background:var(--surface-2)"><h3>데이터 백업</h3>
  <p class="small muted" style="margin:4px 0 8px">기록은 이 기기에만 저장돼요. 가끔 내보내 두면 기기를 바꾸거나 브라우저 데이터를 지워도 되살릴 수 있어요.</p>
  <div class="row"><button class="btn sm" data-act="exportData">내보내기 (JSON)</button><button class="btn sm" data-act="importData">가져오기</button><input type="file" id="importIn" accept="application/json,.json" hidden></div>
  <label class="f" style="margin-top:10px">AI 접속 암호 (서버에 설정한 경우만)<span class="row" style="flex-wrap:nowrap"><input type="password" id="aiToken" value="${esc(getAIToken())}" autocomplete="off"><button class="btn sm" data-act="saveAIToken">저장</button></span></label></div>`);
}

/* 팁 시트 */
export function tipsSheet(exId,name){ exDetail(exId,name); }
