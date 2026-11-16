// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { EXMAP, PARTS, WD } from "./catalog";
import { GOALS, calcTargets, sumMeals } from "./goals";
import { NUTRI_SCHEMA, allFoods, closeSheet, drawExSheet, drawFoodSheet, exListHtml, exPreviewHtml, exSheet, foodPick, foodResults, foodSheet, getItems, normFood, openSheet, profileSheet, saveTarget, startPickViewer, tipsSheet } from "./sheets";
import { S, dayKey, flush, markDirty, replaceState, ui } from "./state";
import { startTimer, stopTimer, tick, timer, buzz } from "./timer";
import { askNotify, primeSound, saveTab } from "../platform/session";
import { cloneItems, doneSets, e1rm, exInfo, exPart, exType, feedbackHtml, groupWeights, makeTemplate, mkItem, planCheckHtml, planFeedback, planStats, recovery, prevRecord } from "./training";
import { addDays, day, esc, md, peekDay, r0, r1, toast, uid, wIdx, ymd } from "./util";
import { MGROUP, bestE1rmBefore, defaultMeal, exDetail, guideCards, guideFilter, lastWeightDate, render, refreshCard, stepOf, showCard } from "./views";
import { EX } from "../data/exercises.js";
import { aiErr, setAIToken } from "../platform/ai";
import { cachedJSON, cachedText, photoJSON, ingestAIFoods, logHit } from "../platform/aiflow";
import { resolveFoodText } from "../platform/kb";
import { whySheet, kbAnswerHtml, dbStatusSheet } from "./evidence";
import { countDays, downloadCSV, downloadJSON, parseBackup, toBackup, workoutRows } from "../platform/backup";

/* 액션
   ============================================================ */
export const A={
  tab(el){ ui.tab=el.dataset.tab; ui.editDay=null; saveTab(ui.tab); render(); window.scrollTo(0,0); },
  day(el){ ui.date=addDays(ui.date,+el.dataset.d); render(); },
  today(){ ui.date=ymd(new Date()); render(); },
  goDate(el){ ui.date=el.dataset.date; if(ui.tab==="stats"){ ui.tab="workout"; saveTab(ui.tab); window.scrollTo(0,0); } render(); }, // 분석 탭의 달력에서 누르면 그날 운동 기록으로
  openProfile(){ profileSheet(); },
  why(el){ whySheet(el.dataset.rule.split(",")); },
  dbStatus(){ dbStatusSheet(); },
  async exportData(){ await flush(); S.main.lastBackup=new Date().toISOString(); markDirty("main"); await flush(); downloadJSON(`gymlog-${ymd(new Date())}.json`, toBackup(S)); toast("백업 파일을 내려받았어요"); if(ui.tab==="stats") render(); },
  async exportCSV(){ await flush(); const n=downloadCSV(`gymlog-운동기록-${ymd(new Date())}.csv`, workoutRows(S)); toast(n?`세트 ${n}개를 CSV로 내려받았어요`:"완료한 세트가 아직 없어요"); },
  importData(){ document.getElementById("importIn").click(); },
  saveAIToken(){ setAIToken(document.getElementById("aiToken").value.trim()); toast("AI 접속 암호를 저장했어요"); },
  closeSheet(){ closeSheet(); },
  saveProfile(){
    const g=id=>document.getElementById(id);
    S.main.profile={sex:g("pSex").value,age:+g("pAge").value||25,height:+g("pH").value||170,weight:+g("pW").value||65,activity:+g("pAct").value,goal:g("pGoal").value};
    S.main.override=g("pOv").checked?{kcal:+g("oK").value,carb:+g("oC").value,protein:+g("oP").value,fat:+g("oF").value}:null;
    markDirty("main"); closeSheet(); render(); toast("목표를 저장했어요");
  },
  /* 식단 */
  addFood(el){ ui.sheet=null; foodSheet(el.dataset.meal||defaultMeal()); },
  sheetMeal(el){ ui.sheet.meal=el.dataset.m; drawFoodSheet(); },
  sheetMode(el){ ui.sheet.mode=el.dataset.m; ui.sheet.parsed=null; drawFoodSheet(); },
  pickFood(el){ const f=allFoods().find(x=>x.name===el.dataset.name)||Object.keys(S.days).flatMap(d=>S.days[d].meals||[]).find(x=>x.name===el.dataset.name); ui.sheet.sel=f; ui.sheet.qty=f.qty&&f.recent?1:1; document.getElementById("foodPick").innerHTML=foodPick(); document.querySelectorAll("#foodRes .res").forEach(b=>b.classList.toggle("sel",b.dataset.name===f.name)); },
  pickQty(el){ ui.sheet.qty=Math.max(0.5,ui.sheet.qty+ +el.dataset.d); document.getElementById("foodPick").innerHTML=foodPick(); },
  confirmFood(){ const f=ui.sheet.sel; const d=day(); d.meals.push({id:uid(),meal:ui.sheet.meal,name:f.name,serving:f.serving,grams:f.grams,kcal:f.kcal,carb:f.carb,protein:f.protein,fat:f.fat,sugar:f.sugar||0,sodium:f.sodium||0,qty:ui.sheet.qty,src:f.src||(f.custom?"custom":"db")}); markDirty(dayKey(ui.date)); toast(`${f.name} 추가됨`); ui.sheet.sel=null; ui.sheet.q=""; render(); drawFoodSheet(); },
  qty(el){ const d=day(); const m=d.meals[+el.dataset.i]; m.qty=Math.max(0.5,r1((m.qty||1)+ +el.dataset.d)); markDirty(dayKey(ui.date)); render(); },
  delFood(el){ const d=day(); d.meals.splice(+el.dataset.i,1); markDirty(dayKey(ui.date)); render(); },
  async aiLookup(){ ui.sheet.mode="ai"; ui.sheet.aiText=ui.sheet.q+" 1인분"; drawFoodSheet(); A.aiParse(); },
  async aiParse(){
    const txt=(document.getElementById("aiFoodIn")?.value||"").trim(); if(!txt) return toast("먹은 음식을 적어 주세요");
    ui.sheet.aiText=txt; const out=document.getElementById("aiParseOut");
    // 1차: 자체 DB에서 음식과 수량을 모두 찾으면 AI를 부르지 않는다
    const local=resolveFoodText(txt,S.main.customFoods||[]);
    if(local){ logHit("food_text","db"); ui.sheet.parsed=local.map(x=>({...normFood({...x.food,qty:x.qty}),src:"db"})); ui.sheet.note="자체 DB에서 찾았어요 (AI 호출 없음)"; drawFoodSheet(); return; }
    out.innerHTML=`<p class="muted small">DB에 없는 음식이 있어 Claude가 분석 중…</p>`; ui.aiBusy=true;
    try{ const r=await cachedJSON("food_text",txt,`너는 한국 영양사다. 사용자가 먹은 음식 설명을 음식 단위로 나누고, 식품의약품안전처 식품영양성분 DB나 일반적인 한국 제품·프랜차이즈 영양성분표 기준으로 1회 제공량 영양성분을 추정하라. 브랜드 제품이면 그 제품 표기를 우선한다.\n${NUTRI_SCHEMA}\n\n사용자 입력: ${txt}`);
      const checked=await ingestAIFoods((r.items||[]).map(normFood),S.main.customFoods||[],"text",txt);
      ui.sheet.parsed=checked.map(f=>({...f,src:"ai"})); ui.sheet.note=r.note||""; }
    catch(e){ ui.sheet.parsed=null; out.innerHTML=`<p class="small" style="color:var(--bad)">${esc(aiErr(e))}</p>`; ui.aiBusy=false; return; }
    ui.aiBusy=false; drawFoodSheet();
  },
  async aiPhoto(){
    const f=document.getElementById("photoIn").files[0]; if(!f) return toast("사진을 골라 주세요");
    const note=document.getElementById("photoNote").value; const out=document.getElementById("aiParseOut"); out.innerHTML=`<p class="muted small">사진을 읽는 중…</p>`; ui.aiBusy=true;
    try{
      const prompt=`사진이 영양성분표면 표기 값을 그대로 읽고(총 내용량과 1회 제공량 구분), 음식 사진이면 음식과 양을 추정해 영양성분을 계산하라. 메모: ${note||"없음"}\n${NUTRI_SCHEMA}`;
      const r = await photoJSON(prompt,[f]);
      const checked=await ingestAIFoods((r.items||[]).map(normFood),S.main.customFoods||[],"photo",note);
      ui.sheet.parsed=checked.map(x=>({...x,src:"ai"})); ui.sheet.note=r.note||"";
    }catch(e){ out.innerHTML=`<p class="small" style="color:var(--bad)">${esc(aiErr(e))}</p>`; ui.aiBusy=false; return; }
    ui.aiBusy=false; drawFoodSheet();
  },
  dropParsed(el){ ui.sheet.parsed.splice(+el.dataset.i,1); drawFoodSheet(); },
  addParsed(){
    const d=day(); ui.sheet.parsed.forEach(f=>{ const {check,...m}=f; d.meals.push({...m,id:uid(),meal:ui.sheet.meal}); });
    S.main.customFoods=(S.main.customFoods||[]).slice(0,150);
    markDirty(dayKey(ui.date)); markDirty("main"); closeSheet(); render(); toast("추가했어요. 다음부터는 검색에서 바로 나와요");
  },
  manualAdd(){
    const g=id=>document.getElementById(id); const name=g("mName").value.trim(); if(!name) return toast("음식 이름을 적어 주세요");
    const f=normFood({name,serving:g("mServ").value||"1회",kcal:g("mKcal").value,carb:g("mC").value,protein:g("mP").value,fat:g("mF").value,sodium:g("mNa").value,qty:1});
    day().meals.push({...f,id:uid(),meal:ui.sheet.meal,src:"custom"});
    if(g("mSave").checked){ const {qty,...base}=f; (S.main.customFoods=S.main.customFoods||[]).unshift(base); markDirty("main"); }
    markDirty(dayKey(ui.date)); closeSheet(); render();
  },
  async aiFood(){
    const dd=peekDay(ui.date); if(!(dd.meals||[]).length) return toast("먼저 오늘 먹은 음식을 추가해 주세요");
    const T=calcTargets(), t=sumMeals(dd.meals), p=S.main.profile; const out=document.getElementById("aiFoodOut");
    const w=(dd.workout?.items||[]).filter(it=>doneSets(it).length).map(it=>it.name).join(", ")||"없음";
    ui.aiBusy=true; out.outerHTML=`<div class="ai-out" style="margin-top:10px" id="aiFoodOut">분석 중…</div>`;
    try{
      const txt=await cachedText("diet_coach",[ui.date,p.goal,p.weight,T.kcal,r0(t.kcal),r0(t.carb),r0(t.protein),r0(t.fat),w,(dd.meals||[]).map(m=>m.name+"x"+m.qty).join("/")].join("|"),`너는 헬스 트레이너 겸 영양사다. 한국어 반말 말고 친근한 존댓말로, 6~9줄 이내로 답하라. 마크다운 제목 없이 **굵게**만 사용.
사용자: ${p.sex==="m"?"남":"여"} ${p.age}세 ${p.height}cm ${p.weight}kg, 목표 ${GOALS[p.goal]}.
오늘 목표: ${T.kcal}kcal, 탄 ${T.carb}g, 단 ${T.protein}g, 지 ${T.fat}g.
오늘 섭취 합계: ${r0(t.kcal)}kcal, 탄 ${r0(t.carb)}g, 단 ${r0(t.protein)}g, 지 ${r0(t.fat)}g, 당 ${r0(t.sugar)}g, 나트륨 ${r0(t.sodium)}mg.
먹은 것: ${dd.meals.map(m=>`[${m.meal}] ${m.name} ${m.serving}×${m.qty||1}`).join(", ")}
오늘 운동: ${w}
1) 한 줄 총평 2) 부족/과다 영양소와 수치 3) 남은 끼니나 내일을 위한 구체적인 음식 제안(양 포함).`, text=>{ const el=document.getElementById("aiFoodOut"); if(el) el.innerHTML=md(text); });
      day().analysis=txt; markDirty(dayKey(ui.date));
    }catch(e){ const el=document.getElementById("aiFoodOut"); if(el) el.textContent=aiErr(e); }
    ui.aiBusy=false; render();
  },
  /* 운동 기록 */
  pickPlan(){ // 다른 요일의 루틴이나 저장해 둔 내 루틴을 골라 오늘 운동으로
    const wi=wIdx(ui.date); const row=(attr,title,its,tag,del)=>`<div class="res" style="cursor:default;min-height:56px;gap:6px"><button class="exrow" data-act="loadPlan" ${attr}><span><b>${esc(title)}</b>${tag||""}<br><span class="xs muted">${its.length}개 운동 · ${esc(its.slice(0,3).map(it=>it.name).join(", "))}${its.length>3?" 외":""}</span></span></button><span class="num small">${its.reduce((a,it)=>a+it.sets.length,0)}세트</span>${del||""}</div>`;
    const rts=S.main.routines||[]; const today=day().workout.items;
    openSheet(`<div class="spread"><h2>루틴 불러오기</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
    <h3 style="margin-top:10px">내 루틴</h3><div class="results">${rts.map(r=>row(`data-r="${r.id}"`,r.name,r.items,"",`<button class="btn sm icon ghost" data-act="delRoutine" data-r="${r.id}" aria-label="${esc(r.name)} 루틴 삭제" style="min-width:44px;min-height:44px">✕</button>`)).join("")||`<div class="empty small">저장한 루틴이 없어요. 요일에 묶이지 않는 루틴(예: 상체 A, 홈트)을 저장해 두세요.</div>`}</div>
    <div class="row" style="margin-top:8px"><button class="btn" data-act="saveRoutine" ${today.length?"":"disabled"}>오늘 운동을 루틴으로 저장</button></div>
    <h3 style="margin-top:14px">최근 운동 <span class="xs muted">그날 한 그대로 다시</span></h3><div class="results">${Object.keys(S.days).filter(d=>d<ui.date&&(S.days[d].workout?.items||[]).some(it=>doneSets(it).length)).sort().reverse().slice(0,5).map(d=>row(`data-d="${d}"`,`${+d.slice(5,7)}/${+d.slice(8)} (${WD[wIdx(d)]})${S.days[d].workout.planTitle?" · "+S.days[d].workout.planTitle:""}`,S.days[d].workout.items)).join("")||`<div class="empty small">아직 기록이 없어요.</div>`}</div>
    <h3 style="margin-top:14px">주간 플랜</h3><div class="results">${S.main.plan.map((p,i)=>p.items.length?row(`data-i="${i}"`,`${WD[i]}요일 · ${p.title}`,p.items,i===wi?` <span class="chip">오늘</span>`:""):"").join("")||`<div class="empty small">저장된 플랜이 없어요.</div>`}</div>`); },
  saveRoutine(){ const items=day().workout.items; if(!items.length) return; const def=day().workout.planTitle||"내 루틴"; const name=(prompt("루틴 이름",def)||"").trim().slice(0,30); if(!name) return;
    const rts=(S.main.routines=S.main.routines||[]); const ex=rts.find(r=>r.name===name); const body=cloneItems(items);
    if(ex){ if(!confirm(`"${name}" 루틴이 이미 있어요. 덮어쓸까요?`)) return; ex.items=body; } else rts.push({id:uid(),name,items:body});
    markDirty("main"); A.pickPlan(); toast(`"${name}" 루틴을 저장했어요`); },
  delRoutine(el){ const rts=S.main.routines||[]; const i=rts.findIndex(r=>r.id===el.dataset.r); if(i<0) return; const [r]=rts.splice(i,1); ui.undoRoutine={r,i}; markDirty("main"); A.pickPlan(); toast(`"${r.name}" 삭제됨`,{label:"되돌리기",act:"undoRoutine"}); },
  undoRoutine(){ const u=ui.undoRoutine; if(!u) return; ui.undoRoutine=null; (S.main.routines=S.main.routines||[]).splice(u.i,0,u.r); markDirty("main"); if(document.getElementById("sheet").classList.contains("open")) A.pickPlan(); toast("되돌렸어요"); },
  loadPlan(el){
    const d=day(); const rt=el&&el.dataset.r?(S.main.routines||[]).find(r=>r.id===el.dataset.r):null; const past=el&&el.dataset.d?S.days[el.dataset.d]:null;
    const pi=rt||past?-1:el&&el.dataset.i!=null?+el.dataset.i:wIdx(ui.date); const p=rt?{title:rt.name,items:rt.items}:past?{title:past.workout.planTitle||"지난 운동",items:past.workout.items}:S.main.plan[pi]; if(!p) return;
    if(d.workout.items.some(it=>doneSets(it).length)&&!ui.confirmLoad){ ui.confirmLoad=true; toast("완료한 세트가 있어요. 한 번 더 누르면 덮어써요"); setTimeout(()=>ui.confirmLoad=false,3000); return; }
    ui.confirmLoad=false; d.workout.items=cloneItems(p.items); d.workout.planTitle=p.title; markDirty(dayKey(ui.date)); if(el&&(el.dataset.i!=null||rt||past)) closeSheet(); render(); if(past) toast(`${el.dataset.d.slice(5).replace("-","/")} 운동을 불러왔어요 (그날의 무게·횟수 그대로)`); else if(rt) toast(`"${rt.name}" 루틴을 불러왔어요`); else if(pi!==wIdx(ui.date)) toast(`${WD[pi]}요일 루틴(${p.title})을 불러왔어요`);
  },
  addEx(el){ exSheet(el.dataset.target); },
  exPart(el){ ui.sheet.part=el.dataset.p; drawExSheet(); },
  previewEx(el){ ui.sheet.preview=el.dataset.id; document.getElementById("exPrev").innerHTML=exPreviewHtml(); document.getElementById("exRes").innerHTML=exListHtml(); startPickViewer(); document.getElementById("sheet").scrollTop=0; },
  exDetailFromPick(el){ const back=ui.sheet; exDetail(el.dataset.id); },
  pickEx(el){
    const e=EXMAP[el.dataset.id]; const st=ui.sheet; const items=getItems(st.target);
    if(st.swapIdx!=null){ const old=items[st.swapIdx]; const n=mkItem(e,old.sets.length,e.type==="t"?e.def[1]:(+old.sets[0]?.r||e.def[1]),e.def[2]); items[st.swapIdx]=n; toast(`${old.name} → ${e.name}`); }
    else items.push(mkItem(e,e.def[0],e.def[1],e.def[2]));
    if(st.target!=="log"&&S.main.plan[+st.target.slice(4)].title==="휴식") S.main.plan[+st.target.slice(4)].title="운동";
    const at=st.swapIdx!=null?st.swapIdx:items.length-1, tg=st.target;
    saveTarget(st.target); closeSheet(); render(); showCard(tg,at);
  },
  pickCustomEx(){
    const st=ui.sheet; const items=getItems(st.target);
    const it={id:uid(),exId:null,name:st.q.trim(),part:st.part==="전체"?"기타":st.part,type:st.part==="유산소"?"t":"w",sets:Array.from({length:3},()=>({w:0,r:st.part==="유산소"?20:10,done:false}))};
    if(st.swapIdx!=null) items[st.swapIdx]=it; else items.push(it);
    saveTarget(st.target); closeSheet(); render();
  },
  swap(el){ exSheet(el.dataset.target,+el.dataset.i); },
  delEx(el){ const tg=el.dataset.target, items=getItems(tg), i=+el.dataset.i, it=items[i]; if(!it) return;
    // 완료한 세트가 있는 운동은 한 번 더 눌러야 지워진다
    if(tg==="log"&&doneSets(it).length&&ui.confirmDel!==i){ ui.confirmDel=i; toast(`완료한 세트 ${doneSets(it).length}개가 있어요. 한 번 더 누르면 지워요`); setTimeout(()=>{ if(ui.confirmDel===i) ui.confirmDel=null; },3000); return; }
    ui.confirmDel=null; items.splice(i,1); ui.undoDel={target:tg,i,item:it,date:ui.date,editDay:ui.editDay}; saveTarget(tg); render(); toast(`${it.name} 삭제됨`,{label:"되돌리기",act:"undoDel"}); },
  undoDel(){ const u=ui.undoDel; if(!u) return; ui.undoDel=null; if(u.target==="log"&&u.date!==ui.date){ ui.date=u.date; } if(u.target!=="log") ui.editDay=u.editDay;
    const items=getItems(u.target); items.splice(Math.min(u.i,items.length),0,u.item); saveTarget(u.target); render(); toast("되돌렸어요"); },
  moveEx(el){ const items=getItems(el.dataset.target); const i=+el.dataset.i, j=i+(+el.dataset.d||-1); if(j<0||j>=items.length) return; [items[j],items[i]]=[items[i],items[j]]; saveTarget(el.dataset.target); render(); },
  loadPrev(el){ const it=day().workout.items[+el.dataset.i]; const pr=prevRecord(it.name,ui.date); if(!pr) return;
    let n=0,wk=0; it.sets.forEach(s=>{ if(s.kind==="w") return; const p=pr.sets[wk]||pr.sets[pr.sets.length-1]; wk++; if(!s.done&&p){ s.w=p.w; s.r=p.r; n++; } }); // 워밍업은 건드리지 않고 본 세트끼리 순서를 맞춘다
    markDirty(dayKey(ui.date)); render(); buzz(8); toast(n?"지난 기록을 불러왔어요":"이미 끝낸 세트는 그대로 뒀어요"); },
  toggleSet(el){ const it=day().workout.items[+el.dataset.i]; const s=it.sets[+el.dataset.k]; s.done=!s.done; if(s.done) s.t=Date.now(); else { delete s.t; delete s.pr; }
    if(!s.done&&ui.timerBy===el.dataset.i+"-"+el.dataset.k){ stopTimer(); ui.timerBy=null; } // 잘못 누른 체크를 풀면 그 세트가 띄운 타이머도 끈다
    primeSound(); ui.justDone=s.done?el.dataset.i+"-"+el.dataset.k:null; buzz(s.done?14:6); setTimeout(()=>{ui.justDone=null;},400);
    if(s.done&&exType(it)==="w"&&s.kind!=="w"){ const prev=bestE1rmBefore(it.name,ui.date,s); const cur=e1rm(+s.w,+s.r); if(prev>0&&cur>prev+.01){ s.pr=true; buzz([20,60,30]); toast(`신기록! ${it.name} 추정 1RM ${r1(cur)}kg (이전 ${r1(prev)}kg)`); } } markDirty(dayKey(ui.date)); render(); if(s.done&&exType(it)!=="t"){ const base=it.rest||exInfo(it)?.rest||90; const nextSet=it.sets[+el.dataset.k+1]; const items=day().workout.items, ii=+el.dataset.i;
      // 다음 세트가 드롭세트면 쉬지 않고 바로, 슈퍼세트의 앞 운동이면 다음 운동으로 넘어간다
      if(nextSet&&nextSet.kind==="d"&&!nextSet.done){ toast("드롭세트 — 무게를 내리고 바로 이어서"); }
      else if(it.ss&&items[ii+1]){ toast(`슈퍼세트 — 바로 ${items[ii+1].name}`); }
      else { startTimer(s.kind==="w"?Math.min(60,base):base+(String(s.rir)==="0"?30:0)); ui.timerBy=el.dataset.i+"-"+el.dataset.k; } } },
  setKind(el){ const tg=el.dataset.target, it=getItems(tg)[+el.dataset.i], s=it.sets[+el.dataset.k]; const order=["","w","d"]; const nx=order[(order.indexOf(s.kind||"")+1)%3];
    if(nx) s.kind=nx; else delete s.kind; if(nx==="w") delete s.pr; saveTarget(tg); render(); buzz(6); toast(nx==="w"?"워밍업 세트 — 볼륨·세트 수·회복도 계산에서 빠져요":nx==="d"?"드롭세트 — 앞 세트 뒤에 쉬지 않고 이어서 해요":"본 세트"); },
  superset(el){ const tg=el.dataset.target, items=getItems(tg), i=+el.dataset.i, it=items[i]; if(!it.ss&&i>=items.length-1) return toast("아래에 묶을 운동이 없어요");
    if(it.ss) delete it.ss; else it.ss=true; saveTarget(tg); render(); toast(it.ss?`${it.name} + ${items[i+1].name} 슈퍼세트 — 두 번째 운동을 끝낸 뒤에만 휴식 타이머가 떠요`:"슈퍼세트를 풀었어요"); },
  delSet(el){ const items=getItems(el.dataset.target); items[+el.dataset.i].sets.splice(+el.dataset.k,1); saveTarget(el.dataset.target); render(); },
  setCount(el){ const it=getItems(el.dataset.target)[+el.dataset.i]; if(+el.dataset.d>0){ const last=it.sets[it.sets.length-1]||{w:0,r:10}; it.sets.push({w:last.w,r:last.r,done:false}); } else { const k=it.sets.map(s=>s.done).lastIndexOf(false); if(it.sets.length>1) it.sets.splice(k>=0?k:it.sets.length-1,1); } saveTarget(el.dataset.target); render(); },
  bulk(el){ const it=getItems(el.dataset.target)[+el.dataset.i]; const f=el.dataset.f, d=f==="w"?Math.sign(+el.dataset.d)*stepOf(it):+el.dataset.d; it.sets.forEach(s=>{ if(!s.done) s[f]=Math.max(0,r1((+s[f]||0)+d)); }); saveTarget(el.dataset.target); render(); },
  applySug(el){ const it=day().workout.items[+el.dataset.i]; it.sets.forEach(s=>{ if(!s.done&&s.kind!=="w"){ s.w=+el.dataset.w; s.r=+el.dataset.r; } }); markDirty(dayKey(ui.date)); render(); toast("추천 무게·횟수를 적용했어요"); },
  saveToPlan(){ const wi=wIdx(ui.date); const items=day().workout.items; S.main.plan[wi].items=cloneItems(items); if(S.main.plan[wi].title==="휴식") S.main.plan[wi].title=day().workout.planTitle||"운동"; markDirty("main"); toast(`${WD[wi]}요일 플랜에 반영했어요`); },
  genRecovery(){
    const d=day(); if(d.workout.items.some(it=>doneSets(it).length)) return toast("이미 기록 중인 운동이 있어요");
    const rec=recovery(ui.date); const major=["가슴","등","어깨","대퇴사두","햄스트링","둔근"];
    const ready=major.filter(g=>rec[g].r>=85).sort((a,b)=>rec[b].r-rec[a].r);
    if(!ready.length) return toast("오늘은 대부분 회복 중이에요. 가벼운 유산소나 휴식을 권해요");
    const pick=ready.slice(0,3); const items=[]; const used=new Set();
    pick.forEach(g=>{ const ks=MGROUP.find(x=>x[0]===g)[1];
      const pool=EX.filter(e=>e.type!=="t"&&e.prim.some(k=>ks.includes(k))&&!used.has(e.id));
      const comp=pool.find(e=>e.compound&&Object.keys(groupWeights({exId:e.id})).every(gg=>rec[gg]?.r>=70));
      const str=pool.find(e=>e.stretch&&e!==comp&&Object.keys(groupWeights({exId:e.id})).every(gg=>rec[gg]?.r>=70));
      [comp,str].filter(Boolean).forEach(e=>{ used.add(e.id); const it=mkItem(e,3,e.compound?8:12,e.def[2]); it.rirT=e.compound?"1–2":"0–1"; items.push(it); }); });
    d.workout.items=items; d.workout.planTitle=pick.join("·"); markDirty(dayKey(ui.date)); render(); toast(`회복도 85% 이상인 ${pick.join("·")} 위주로 만들었어요`);
  },
  tips(el){ tipsSheet(el.dataset.ex,el.dataset.name); },
  async aiTip(el){
    const out=document.getElementById("tipOut"); out.innerHTML=`<div class="ai-out" style="margin-top:10px">불러오는 중…</div>`;
    try{ await cachedText("ex_tip",el.dataset.name,`헬스 트레이너로서 "${el.dataset.name}" 운동을 설명하라. 한국어 존댓말, 마크다운 제목 없이 **굵게**만. 1) 타깃 근육 2) 셋업 3) 동작 포인트 3~4개 4) 흔한 실수와 교정 5) 초보 추천 세트×횟수. 15줄 이내.`, t=>{ out.innerHTML=`<div class="ai-out" style="margin-top:10px">${md(t)}</div>`; }); }
    catch(e){ out.innerHTML=`<p class="small" style="color:var(--bad)">${esc(aiErr(e))}</p>`; }
  },
  /* 플랜 */
  focus(el){ el.classList.toggle("on"); },
  editDay(el){ ui.editDay=+el.dataset.i<0?null:+el.dataset.i; render(); },
  clearDay(el){ S.main.plan[+el.dataset.i]={title:"휴식",items:[]}; markDirty("main"); render(); },
  copyDay(el){ const i=+el.dataset.i; openSheet(`<div class="spread"><h2>${WD[i]}요일 플랜 복사</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div><p class="small muted">어느 요일에 붙여넣을까요? (그 요일 내용은 바뀝니다)</p><div class="row">${WD.map((w,j)=>j===i?"":`<button class="btn" data-act="doCopy" data-from="${i}" data-to="${j}">${w}</button>`).join("")}</div>`); },
  doCopy(el){ const f=S.main.plan[+el.dataset.from]; S.main.plan[+el.dataset.to]={title:f.title,items:cloneItems(f.items)}; markDirty("main"); closeSheet(); render(); toast("복사했어요"); },
  tplPlan(){ const o=readReq(); ui.reqLevel=o.level; const t=makeTemplate(o); previewPlan(t.days,`${t.name} · ${({hyper:"근비대",strength:"근력",cut:"감량",fit:"체력"})[o.goal]} 기본 추천`,null); },
  async aiPlan(){
    const o=readReq(); ui.reqLevel=o.level; const out=document.getElementById("aiPlanOut"); out.innerHTML=`<p class="muted small" style="margin-top:10px">Claude가 플랜을 짜는 중… (10~30초)</p>`; ui.aiBusy=true;
    const p=S.main.profile; const rec=Object.keys(S.days).sort().slice(-14).flatMap(d=>(S.days[d].workout?.items||[]).filter(it=>doneSets(it).length).map(it=>{const s=doneSets(it).reduce((a,b)=>(+b.w>+a.w?b:a));return `${it.name} ${s.w}kg×${s.r}`;})).slice(-20);
    try{
      const r=await cachedJSON("plan_gen",JSON.stringify([o,p.sex,p.age,p.weight,p.goal,rec]),`너는 경력 많은 퍼스널 트레이너다. 아래 조건에 맞는 1주 운동 플랜을 설계하라.
사용자: ${p.sex==="m"?"남":"여"} ${p.age}세 ${p.height}cm ${p.weight}kg, 식단 목표 ${GOALS[p.goal]}
운동 목표: ${({hyper:"근비대",strength:"근력",cut:"체지방 감량",fit:"체력·건강"})[o.goal]}, 주 ${o.days}회, 경력 ${({beg:"초보",mid:"중급",adv:"상급"})[o.level]}, 장소 ${o.equip==="gym"?"헬스장":"홈트(덤벨·맨몸)"}
강조 부위: ${o.focus.join(", ")||"없음"}
요청사항: ${o.note||"없음"}
최근 기록(참고, 시작 무게 설정에 활용): ${rec.join("; ")||"없음"}
설계 규칙(근거 기반, 반드시 지킬 것):
- 근비대 목표면 부위당 주간 세트는 fractional 방식(주동근 1, 보조근 0.5)으로 10~20세트, 초보는 6~12세트 (Pelland 2025).
- 한 세션에 같은 부위는 약 11 fractional 세트 이하, 주요 부위는 주 2회 이상으로 나눈다.
- 근비대는 RIR 0~2(고립운동 0~1, 다관절 1~2), 근력은 주 운동 3~6회·RIR 2~3 (Robinson 2024, Schoenfeld 2017).
- 늘어난 위치에서 부하가 큰 운동을 포함: 햄스트링은 앉은 레그컬(seated_curl), 삼두는 오버헤드 익스텐션(oh_ext/cable_oh) 우선 (Maeo 2021, 2023).
- 머신과 프리웨이트는 근비대 차이가 없으니 기구 선호(${o.pref})를 따른다 (Haugen 2023).
- 휴식은 다관절 2~3분, 단관절 1.5~2분 (Singer 2024).
각 items에 "rir":"1–2" 같은 목표 RIR 문자열을 넣어라.
가능하면 아래 운동 ID를 사용하고, 없는 운동이 꼭 필요하면 exId를 null로 두고 name/part를 적어라.
운동 목록: ${EX.filter(e=>o.pref==="brand"?(e.brand||e.cat!=="머신"):!e.brand).map(e=>`${e.id}=${e.name}(${e.part})`).join(", ")}${o.pref==="brand"?"\n사용자 헬스장은 해머 스트렝스·노틸러스 머신 위주이니 머신 운동은 위 브랜드 머신 id를 우선 사용하라.":""}
JSON만 출력: {"title":"플랜 이름","summary":"설계 의도 2~3문장","days":[{"day":0~6(0=월요일),"title":"그날 이름","items":[{"exId":"id 또는 null","name":"운동명","part":"가슴|등|하체|어깨|팔|코어|유산소","sets":숫자,"reps":숫자(유산소는 분),"weight":숫자(kg, 맨몸은 0),"rir":"1–2"}]}],"tips":["주간 진행 팁 2~3개"]}. 운동일은 정확히 ${o.days}개, 나머지 요일은 days에 넣지 마라.`,{modelTier:"default"});
      const plan=Array.from({length:7},()=>({title:"휴식",items:[]}));
      (r.days||[]).forEach(dd=>{ const i=Math.max(0,Math.min(6,+dd.day||0)); plan[i]={title:String(dd.title||"운동").slice(0,30),items:(dd.items||[]).map(x=>{ const e=EXMAP[x.exId]||EX.find(z=>z.name===x.name); const it=mkItem(e||null,Math.max(1,Math.min(8,+x.sets||3)),Math.max(1,+x.reps||10),Math.max(0,+x.weight||0)); if(x.rir) it.rirT=String(x.rir).slice(0,8); if(!e){ it.name=String(x.name||"운동").slice(0,40); it.part=PARTS.includes(x.part)?x.part:"기타"; it.type=it.part==="유산소"?"t":"w"; } return it; })}; });
      ui.aiBusy=false;
      previewPlan(plan,r.title||"Claude 맞춤 플랜",(r.summary||"")+(r.tips&&r.tips.length?"\n\n"+r.tips.map(t=>"• "+t).join("\n"):""));
    }catch(e){ ui.aiBusy=false; out.innerHTML=`<p class="small" style="color:var(--bad);margin-top:10px">${esc(aiErr(e))}</p>`; }
  },
  applyPlan(){ S.main.aiFeedback=""; S.main.plan=ui.pending.plan; S.main.level=ui.reqLevel||S.main.level; S.main.planNote=`**${ui.pending.title}** 적용됨`+(ui.pending.summary?"\n"+ui.pending.summary:""); markDirty("main"); closeSheet(); render(); toast("주간 플랜을 바꿨어요"); },
  guidePart(el){ ui.guidePart=el.dataset.p; render(); },
  async aiFeedback(){
    const out=document.getElementById("aiFbOut"); out.innerHTML=`<div class="ai-out" style="margin-top:10px">플랜을 살펴보는 중…</div>`; ui.aiBusy=true;
    const lv=S.main.level||"mid", st=planStats(S.main.plan), fb=planFeedback(S.main.plan,lv), p=S.main.profile;
    const planTxt=S.main.plan.map((d,i)=>`${WD[i]}: ${d.items.length?d.title+" — "+d.items.map(it=>`${it.name} ${it.sets.length}×${it.sets[0]?.r}${it.rirT?` RIR${it.rirT}`:""}`).join(", "):"휴식"}`).join("\n");
    const stTxt=MGROUP.map(([g])=>`${g} ${r1(st[g].sets)}세트/주${st[g].freq}회/세션최대${r1(st[g].maxS)}`).join(", ");
    try{ await cachedText("plan_feedback",[lv,p.sex,p.age,p.weight,p.goal,planTxt].join("|"),`너는 근거 기반 코칭을 하는 퍼스널 트레이너다. 아래 주간 플랜을 평가하라. 한국어 존댓말, 마크다운 제목 없이 **굵게**만, 14줄 이내.
사용자: ${p.sex==="m"?"남":"여"} ${p.age}세 ${p.weight}kg, 목표 ${GOALS[p.goal]}, 경력 ${({beg:"초보",mid:"중급",adv:"상급"})[lv]}.
플랜:
${planTxt}
부위별 fractional 볼륨(주동1·보조0.5): ${stTxt}
앱 규칙 분석 — 좋은 점: ${fb.good.map(x=>x.t).join(" / ")} | 아쉬운 점: ${fb.bad.map(x=>x.t).join(" / ")}
근거 기준: 부위당 주 10~20세트(초보 6~12), 세션당 ~11세트 이하, 주 2회, 근비대 RIR 0~2, 늘어난 위치 운동(앉은 레그컬·오버헤드 삼두) 우선, 머신=프리웨이트(근비대), 휴식 60~90초 이상.
형식: 1) 한 줄 총평 2) **잘한 점** 2~3개 3) **고칠 점** 2~4개 — 각각 구체적 수정안(어느 요일, 어떤 운동, 몇 세트) 4) 다음 주 진행 팁 1개. 앱 규칙 분석과 중복되면 더 구체적으로 보완하라.`, t=>{ out.innerHTML=`<div class="ai-out" style="margin-top:10px">${md(t)}</div>`; }).then(t=>{ S.main.aiFeedback=t; markDirty("main"); }); }
    catch(e){ out.innerHTML=`<p class="small" style="color:var(--bad)">${esc(aiErr(e))}</p>`; }
    ui.aiBusy=false;
  },
  guideCat(el){ ui.guideCat=el.dataset.p; render(); },
  guideStretch(){ ui.guideStretch=!ui.guideStretch; render(); },
  guideBrand(el){ ui.guideBrand=el.dataset.p; render(); },
  pickBrand(el){ ui.sheet.brand=el.dataset.p; document.getElementById("exRes").innerHTML=exListHtml(); document.querySelectorAll("[data-act=pickBrand]").forEach(b=>b.classList.toggle("on",b.dataset.p===ui.sheet.brand)); },
  exDetail(el){ exDetail(el.dataset.id); },
  figPlay(el){ if(!ui.fig)return; const on=ui.fig.toggle(); el.textContent=on?"일시정지":"재생"; },
  figSpeed(el){ if(!ui.fig)return; ui.slow=!ui.slow; ui.fig.setSpeed(ui.slow?.5:1); el.textContent=ui.slow?"0.5x":"1.0x"; },
  figGuide(el){ if(!ui.fig)return; const on=!el.classList.contains("on"); el.classList.toggle("on",on); el.setAttribute("aria-pressed",on); ui.fig.setGuide(el.dataset.g,on); },
  figView(el){ if(!ui.fig)return; if(el.dataset.y==="def") ui.fig.defaultView(); else ui.fig.setView(+el.dataset.y,12); },
  addExToday(el){ const e=EXMAP[el.dataset.id]; day().workout.items.push(mkItem(e,e.def[0],e.def[1],e.def[2])); markDirty(dayKey(ui.date)); closeSheet(); ui.tab="workout"; render(); toast(`${e.name} 추가됨`); },
  saveWeight(){ const v=+document.getElementById("bwIn").value; if(!v||v<25||v>300) return toast("체중을 kg로 입력해 주세요"); day().weight=r1(v); markDirty(dayKey(ui.date)); if(ui.date>=lastWeightDate()){ S.main.profile.weight=r1(v); markDirty("main"); } render(); toast("체중을 기록했어요"); },
  async aiAsk(){
    const q=document.getElementById("gAsk").value.trim(); if(!q) return; const out=document.getElementById("gAskOut");
    const kbHtml=kbAnswerHtml(q); out.innerHTML=kbHtml+`<div class="ai-out" style="margin-top:10px" id="gAskAi">Claude 답변 준비 중…</div>`; const ai=document.getElementById("gAskAi");
    try{ await cachedText("ask",q,`헬스 트레이너로서 다음 질문에 답하라. 한국어 존댓말, 마크다운 제목 없이 **굵게**만, 12줄 이내. 통증이 심하거나 지속되면 전문의 상담을 권하라.\n질문: ${q}`, t=>{ ai.innerHTML=md(t); }); }
    catch(e){ ai.outerHTML=`<p class="small" style="color:var(--bad);margin-top:8px">${esc(aiErr(e))}${kbHtml?" · 위의 자체 DB 결과는 그대로 볼 수 있어요.":""}</p>`; }
  },
  timerAdd(el){ timer.end+= +el.dataset.s*1000; timer.total=Math.max(timer.total||0,(timer.end-Date.now())/1000); tick(); },
  timerStop(){ stopTimer(); },
  async askNotify(el){ const r=await askNotify(); el.textContent=r==="granted"?"알림 켜짐":r==="unsupported"?"이 브라우저는 알림 미지원":"알림이 차단돼 있어요"; }
};
export function readReq(){
  const g=id=>document.getElementById(id);
  return {goal:g("rGoal").value,days:+g("rDays").value,level:g("rLevel").value,equip:g("rEquip").value,pref:g("rPref").value,focus:[...document.querySelectorAll("#rFocus .chip.on")].map(b=>b.dataset.p),note:g("rNote").value.trim()};
}
export function previewPlan(plan,title,summary){
  ui.pending={plan,title,summary};
  let h=`<div class="spread"><h2>${esc(title)}</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>${summary?`<div class="ai-out">${md(summary)}</div>`:""}<div class="stack">`;
  plan.forEach((p,i)=>{ if(!p.items.length) return; h+=`<div class="card plan-day"><h3>${WD[i]}요일 · ${esc(p.title)}</h3>${p.items.map(it=>{const s=it.sets;const t=exType(it);return `<div class="pi"><span>${esc(it.name)} <span class="chip">${esc(exPart(it))}</span></span><span class="num muted">${s.length}×${s[0]?.r}${t==="t"?"분":"회"}${t==="w"&&s[0]?.w?` · ${s[0].w}kg`:""}</span></div>`}).join("")}</div>`; });
  h+=`</div><div class="card" style="margin-top:10px;background:var(--surface-2)"><h3>근거 기반 점검</h3><div style="margin-top:8px">${feedbackHtml(plan,ui.reqLevel)}</div><div style="margin-top:10px">${planCheckHtml(plan,ui.reqLevel)}</div></div><div class="row" style="margin-top:12px"><button class="btn primary" data-act="applyPlan">이 플랜으로 바꾸기</button><button class="btn" data-act="closeSheet">취소</button></div><p class="xs muted">시작 무게는 예시예요. 첫 주에 실제로 들 수 있는 무게로 조정하면, 그 뒤로는 기록 기반 추천이 무게를 올려 줍니다.</p>`;
  openSheet(h);
}

document.addEventListener("click",e=>{ const el=e.target.closest("[data-act]"); if(!el) return; const f=A[el.dataset.act]; if(f){ e.preventDefault(); f(el,e); } });
document.addEventListener("change",e=>{
  if(e.target.id==="importIn"){ importFile(e.target); return; }
  const el=e.target; const k=el.dataset.chg; if(!k) return;
  if(k==="set"){ const tg=el.dataset.target, i=+el.dataset.i, kk=+el.dataset.k, f=el.dataset.f; const it=getItems(tg)[i]; const old=el.dataset.orig!=null?+el.dataset.orig:it.sets[kk][f], v=Math.max(0,+el.value||0); it.sets[kk][f]=v; delete el.dataset.orig;
    // 아직 안 끝낸 뒤 세트가 고치기 전 값과 같았다면 새 값을 따라간다 (1세트 무게를 올리면 2·3세트도)
    for(let j=kk+1;j<it.sets.length;j++){ const s2=it.sets[j]; if(s2.done||+s2[f]!==+old) break; s2[f]=v; const inp=document.querySelector(`input[data-chg="set"][data-target="${tg}"][data-i="${i}"][data-k="${j}"][data-f="${f}"]`); if(inp) inp.value=v; }
    saveTarget(tg);
    // 화면 전체를 다시 그리면 방금 누른 다음 칸의 포커스(키보드)가 사라진다 → 바뀌는 부분만 갱신
    if(tg==="log") refreshCard(i); }
  if(k==="rir"){ const s=day().workout.items[+el.dataset.i].sets[+el.dataset.k]; s.rir=el.value; markDirty(dayKey(ui.date)); }
  if(k==="step"){ const it=getItems(el.dataset.target)[+el.dataset.i]; (S.main.exStep=S.main.exStep||{})[it.exId||it.name]=+el.value; markDirty("main"); render(); }
  if(k==="barKg"){ S.main.barKg=+el.value; markDirty("main"); render(); }
  if(k==="rest"){ getItems(el.dataset.target)[+el.dataset.i].rest=+el.value; saveTarget(el.dataset.target); }
  if(k==="dayTitle"){ S.main.plan[+el.dataset.i].title=el.value.trim()||"운동"; markDirty("main"); }
});
document.addEventListener("focusin",e=>{ const el=e.target; // 고치기 전 값을 기억해 둔다(칸을 벗어날 때 뒤 세트로 이어 줄지 판단)
  if(el.dataset&&el.dataset.chg==="set"){ const it=getItems(el.dataset.target)[+el.dataset.i]; if(it&&it.sets[+el.dataset.k]) el.dataset.orig=it.sets[+el.dataset.k][el.dataset.f]; } });
document.addEventListener("input",e=>{
  const el=e.target;
  // 글자를 칠 때마다 저장한다: 칸을 벗어나기 전에 폰을 잠그거나 앱이 꺼져도 값이 남게
  if(el.dataset&&el.dataset.chg==="set"&&el.value!==""){ const it=getItems(el.dataset.target)[+el.dataset.i]; if(it&&it.sets[+el.dataset.k]){ it.sets[+el.dataset.k][el.dataset.f]=Math.max(0,+el.value||0); saveTarget(el.dataset.target); } return; }
  if(el.dataset&&el.dataset.chg==="exNote"){ const m=(S.main.exNotes=S.main.exNotes||{}); const v=el.value.slice(0,120); if(v.trim()) m[el.dataset.key]=v; else delete m[el.dataset.key]; markDirty("main"); return; }
  const k=el.dataset.inp; if(!k) return;
  if(k==="foodQ"){ ui.sheet.q=el.value; document.getElementById("foodRes").innerHTML=foodResults(); }
  if(k==="exQ"){ ui.sheet.q=el.value; document.getElementById("exRes").innerHTML=exListHtml(); }
  if(k==="guideQ"){ ui.guideQ=el.value; const L=guideFilter(); document.getElementById("guideList").innerHTML=guideCards(L); document.getElementById("guideCount").textContent=`${L.length}개 운동 · 누르면 3D 동작과 타깃 근육을 볼 수 있어요`; }
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&document.getElementById("sheet").classList.contains("open")) closeSheet();
  if(e.key==="Enter"&&e.target.id==="gAsk") A.aiAsk();
});

/* 백업 가져오기: 현재 기록을 통째로 바꾸므로 반드시 확인을 받는다 */
async function importFile(input){
  const f=input.files[0]; input.value=""; if(!f) return;
  let next; try{ next=parseBackup(await f.text()); }catch(e){ return toast(e.message||"파일을 읽지 못했어요"); }
  const n=countDays(next), cur=countDays(S);
  if(!confirm(`백업 파일에는 기록이 ${n}일치 있어요.\n가져오면 지금 이 기기의 기록(${cur}일치)과 플랜·내 정보가 백업 내용으로 바뀌어요.\n계속할까요?`)) return;
  try{ await replaceState(next); }catch(e){ return toast("가져오기에 실패했어요. 기존 기록은 그대로예요."); }
  closeSheet(); render(); toast(`기록 ${n}일치를 가져왔어요`);
}
