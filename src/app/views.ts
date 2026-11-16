// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { viewInsights, initHeatMaps } from "./insights";
import { keepAwake } from "../platform/session";
import { evidenceSectionHtml, dietRuleHtml, exRuleIds } from "./evidence";
import { searchExercises, exMeta } from "../platform/kb";
import { logMiss } from "../platform/search";
import { EXMAP, PARTS, WD } from "./catalog";
import { GOALS, calcTargets, sumMeals } from "./goals";
import { openSheet } from "./sheets";
import { S, ui } from "./state";
import { doneSets, workSets, e1rm, exInfo, exPart, exType, feedbackHtml, groupWeights, itemVolume, planCheckHtml, prevRecord, recovery, suggestNext } from "./training";
import { addDays, day, esc, md, pad, parseD, peekDay, r0, r1, wIdx, ymd } from "./util";
import { BRANDS, EVIDENCE, EX, MUSCLE_KO } from "../data/exercises.js";
import { FIG } from "../engine/fig.js";

/* 렌더링
   ============================================================ */
export function render(){
  const d=parseD(ui.date);
  const isToday=ui.date===ymd(new Date());
  document.getElementById("dateLabel").textContent=`${d.getMonth()+1}월 ${d.getDate()}일 (${WD[wIdx(ui.date)]})${isToday?" · 오늘":""}`;
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===ui.tab));
  const v=document.getElementById("view");
  (ui.maps||[]).forEach(m=>m.stop()); ui.maps=[];
  v.innerHTML = ui.tab==="food"?viewFood(): ui.tab==="workout"?viewWorkout(): ui.tab==="plan"?viewPlan(): ui.tab==="stats"?viewInsights(): viewGuide();
  if(ui.tab==="workout") initMuscleMaps();
  // 오늘 운동이 진행 중(완료 세트도 있고 남은 세트도 있음)인 동안은 화면이 꺼지지 않게
  { const its=ui.tab==="workout"&&ui.date===ymd(new Date())?(peekDay(ui.date).workout?.items||[]):[]; const all=its.flatMap(it=>it.sets||[]); keepAwake(all.some(x=>x.done)&&all.some(x=>!x.done)); }
  if(ui.tab==="stats") initHeatMaps();
}
/* 오늘 자극한 근육 지도 (Hevy 참고) */
export function dayMuscles(d){
  const w={}; (peekDay(d).workout?.items||[]).forEach(it=>{ const e=exInfo(it); const n=workSets(it).length; if(!e||!n||e.type==="t") return; e.prim.forEach(k=>w[k]=(w[k]||0)+n); e.sec.forEach(k=>w[k]=(w[k]||0)+n*.5); });
  return w;
}
export function initMuscleMaps(){
  const w=dayMuscles(ui.date); const keys=Object.keys(w); if(!keys.length) return;
  const ex={id:"map",anim:{p:"raise",o:{kind:"shrug",tool:"none"}},prim:keys.filter(k=>w[k]>=3),sec:keys.filter(k=>w[k]<3),cam:[0,6]};
  [["mapFront",15],["mapBack",195]].forEach(([id,yaw])=>{ const cv=document.getElementById(id); if(!cv) return; try{ const v=FIG.viewer(cv,ex,{autoplay:false}); v.setView(yaw,6); v.setSpan(1.75,[0,.98,0]); v.frameAt(0); ui.maps.push(v); }catch(e){} });
}
export function plateCalc(total,bar=20){
  let side=(total-bar)/2; if(side<=0) return null; const P=[25,20,15,10,5,2.5,1.25], out=[];
  for(const p of P){ while(side>=p-1e-9){ out.push(p); side-=p; } } return {out,rest:r1(side)};
}

/* ---------- 식단 ---------- */
export function macroBar(label,cls,val,target,unit="g"){
  const pct=target?Math.min(100,val/target*100):0; const over=target&&val>target*1.1;
  return `<div class="macro"><div class="spread small"><span class="${cls}" style="font-weight:700">${label}</span><span class="num">${r0(val)}<span class="muted"> / ${r0(target)}${unit}</span>${over?' <span class="chip" style="color:var(--warn)">초과</span>':""}</span></div><div class="bar"><i style="width:${pct}%;background:var(--${cls==="c"?"carb":cls==="p"?"prot":"fat"})"></i></div></div>`;
}
export function ring(val,target){
  const pct=target?Math.min(1,val/target):0; const R=46,C=2*Math.PI*R; const over=val>target*1.05;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="칼로리 ${r0(val)} / ${r0(target)}"><circle cx="55" cy="55" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="55" cy="55" r="${R}" fill="none" stroke="${over?"var(--warn)":"var(--accent)"}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C*pct} ${C}" opacity="${pct>0?1:0}" transform="rotate(-90 55 55)"/><text x="55" y="52" text-anchor="middle" style="font-size:20px;font-weight:800;fill:var(--ink);font-family:var(--display)">${Math.round(pct*100)}%</text><text x="55" y="70" text-anchor="middle" style="font-size:11px">목표 대비</text></svg>`;
}
export const MEALS=["아침","점심","저녁","간식"];
export function viewFood(){
  const T=calcTargets(); const dd=peekDay(ui.date); const t=sumMeals(dd.meals||[]);
  const remain=T.kcal-t.kcal;
  const ex=S.main.profile.example?`<div class="hint">목표는 예시 신체정보로 계산돼 있어요. <button class="btn sm" data-act="openProfile">내 정보 입력</button></div>`:"";
  let html=`${ex}<section class="card"><div class="hero">${ring(t.kcal,T.kcal)}<div style="display:grid;gap:10px">
    <div><div class="muted small">섭취 칼로리</div><div class="kcal-big">${r0(t.kcal).toLocaleString()}<span class="muted" style="font-size:16px;font-weight:600"> / ${T.kcal.toLocaleString()} kcal</span></div>
    <div class="small" style="margin-top:2px;color:${remain<0?"var(--warn)":"var(--muted)"}">${remain>=0?`${r0(remain).toLocaleString()} kcal 남음`:`${r0(-remain).toLocaleString()} kcal 초과`} · ${GOALS[S.main.profile.goal]} 목표</div></div>
    <div class="macros">${macroBar("탄수화물","c",t.carb,T.carb)}${macroBar("단백질","p",t.protein,T.protein)}${macroBar("지방","f",t.fat,T.fat)}</div>
    <div class="row xs muted"><span>당류 <b class="num">${r0(t.sugar)}</b>g</span><span>·</span><span>나트륨 <b class="num">${r0(t.sodium).toLocaleString()}</b>mg <span style="color:${t.sodium>2000?"var(--warn)":"inherit"}">(권장 2,000mg 이하)</span></span></div>
  </div></div></section>`;
  html+=weightCard();
  html+=`<section class="card"><div class="spread"><h2>오늘 먹은 것</h2><div class="row"><button class="btn sm primary" data-act="addFood" data-meal="${defaultMeal()}">+ 음식 추가</button></div></div><div style="margin-top:10px">`;
  MEALS.forEach(m=>{
    const items=(dd.meals||[]).map((x,i)=>({...x,_i:i})).filter(x=>x.meal===m);
    const mt=sumMeals(items);
    html+=`<div class="meal"><div class="spread"><h3>${m} <span class="muted small num" style="font-weight:500">${items.length?r0(mt.kcal)+" kcal":""}</span></h3><button class="btn sm ghost" data-act="addFood" data-meal="${m}">+ 추가</button></div>`;
    if(items.length){
      items.forEach(x=>{
        const q=x.qty||1;
        html+=`<div class="item"><div><div class="name">${esc(x.name)} ${x.src==="ai"?'<span class="chip">Claude 추정</span>':""}</div><div class="pcf muted"><span>${esc(x.serving||"")}×${q}</span><span class="num">${r0(x.kcal*q)} kcal</span><span class="c">탄 <b class="num">${r1(x.carb*q)}</b></span><span class="p">단 <b class="num">${r1(x.protein*q)}</b></span><span class="f">지 <b class="num">${r1(x.fat*q)}</b></span></div></div>
        <div class="row"><span class="stepper"><button data-act="qty" data-i="${x._i}" data-d="-0.5" aria-label="줄이기">−</button><span class="num">${q}</span><button data-act="qty" data-i="${x._i}" data-d="0.5" aria-label="늘리기">+</button></span><button class="btn sm icon ghost" data-act="delFood" data-i="${x._i}" aria-label="삭제">✕</button></div></div>`;
      });
    }
    html+=`</div>`;
  });
  html+=`</div></section>`;
  // 주간 차트
  html+=`<section class="card"><div class="spread"><h2>최근 7일 칼로리</h2><span class="muted xs">점선 = 목표 ${T.kcal.toLocaleString()} kcal</span></div>${weekKcalChart(T)}${weekProtein(T)}</section>`;
  // AI 분석
  html+=dietRuleHtml(T,t,(dd.meals||[]).length);
  html+=`<section class="card"><div class="spread"><h2>Claude 식단 코멘트</h2><button class="btn sm ai" data-act="aiFood" ${ui.aiBusy?"disabled":""}>더 자세한 분석 받기</button></div>
    ${dd.analysis?`<div class="ai-out" style="margin-top:10px" id="aiFoodOut">${md(dd.analysis)}</div>`:`<p class="muted small" style="margin:8px 0 0" id="aiFoodOut">목표 대비 부족하거나 넘친 영양소, 남은 끼니에 먹으면 좋은 음식을 알려줘요.</p>`}</section>`;
  return html;
}
export function defaultMeal(){ const h=new Date().getHours(); return h<10?"아침":h<15?"점심":h<21?"저녁":"간식"; }
export function weekKcalChart(T){
  const ds=Array.from({length:7},(_,i)=>addDays(ui.date,i-6));
  const vals=ds.map(d=>sumMeals(peekDay(d).meals||[]).kcal);
  const max=Math.max(T.kcal*1.25,...vals,100);
  const W=340,H=140,pl=34,pb=22,pt=8,bw=(W-pl-8)/7;
  const y=v=>pt+(H-pt-pb)*(1-v/max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="최근 7일 칼로리">`;
  [0,0.5,1].forEach(f=>{const v=Math.round(max*f/100)*100; s+=`<line x1="${pl}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-4}" y="${y(v)+4}" text-anchor="end" style="font-size:10px">${v.toLocaleString()}</text>`;});
  ds.forEach((d,i)=>{const v=vals[i]; const x=pl+i*bw+bw*0.2; const over=v>T.kcal*1.1; const sel=d===ui.date;
    s+=`<rect x="${x}" y="${y(v)}" width="${bw*0.6}" height="${Math.max(0,y(0)-y(v))}" rx="4" fill="${over?"var(--warn)":"var(--accent)"}" opacity="${sel?1:.55}"/>`;
    s+=`<text x="${x+bw*0.3}" y="${H-6}" text-anchor="middle" style="font-size:11px;${sel?"fill:var(--ink);font-weight:700":""}">${WD[wIdx(d)]}</text>`;});
  s+=`<line x1="${pl}" x2="${W-4}" y1="${y(T.kcal)}" y2="${y(T.kcal)}" stroke="var(--ink)" stroke-dasharray="4 4"/></svg>`;
  return s;
}
export function weekProtein(T){
  const ds=Array.from({length:7},(_,i)=>addDays(ui.date,i-6)).filter(d=>(peekDay(d).meals||[]).length);
  if(!ds.length) return `<p class="muted small" style="margin:6px 0 0">기록이 쌓이면 주간 평균이 표시돼요.</p>`;
  const avg=k=>ds.reduce((a,d)=>a+sumMeals(peekDay(d).meals)[k],0)/ds.length;
  return `<div class="row small" style="margin-top:6px"><span class="muted">기록한 ${ds.length}일 평균</span><span class="num">${r0(avg("kcal")).toLocaleString()} kcal</span><span class="p">단백질 <b class="num">${r0(avg("protein"))}</b>/${T.protein}g</span><span class="c">탄 <b class="num">${r0(avg("carb"))}</b>g</span><span class="f">지 <b class="num">${r0(avg("fat"))}</b>g</span></div>`;
}

/* ---------- 운동 기록 ---------- */
/* 운동 시간: 그날 첫 완료 세트부터 마지막 완료 세트까지 (세트를 체크한 시각 s.t 기준) */
export function sessionInfo(d){
  const ts=(peekDay(d).workout?.items||[]).flatMap(it=>(it.sets||[]).filter(s=>s.done&&s.t).map(s=>s.t)); if(ts.length<2) return null;
  const start=Math.min(...ts), end=Math.max(...ts); return {start,end,min:Math.max(1,Math.round((end-start)/60000))};
}
/* 모든 세트를 끝냈을 때의 요약 */
export function sessionDoneHtml(sess,items,vol){
  const sets=items.reduce((a,it)=>a+workSets(it).length,0), prs=items.reduce((a,it)=>a+(it.sets||[]).filter(x=>x.pr).length,0);
  // 지난번 같은 구성(첫 운동이 같은 날)의 볼륨과 비교
  const first=items[0]?.name; let prevVol=0, prevDate="";
  for(const d of Object.keys(S.days).filter(d=>d<ui.date).sort().reverse()){ const its=S.days[d].workout?.items||[]; if(its[0]&&its[0].name===first&&its.some(it=>workSets(it).length)){ prevVol=its.reduce((a,it)=>a+itemVolume(it),0); prevDate=d; break; } }
  const diff=prevVol?Math.round((vol/prevVol-1)*100):null;
  const hm=t=>{const x=new Date(t);return pad(x.getHours())+":"+pad(x.getMinutes());};
  return `<section class="card done-card"><h2>오늘 운동 완료</h2><div class="kpis"><div><span class="xs muted">운동 시간</span><b class="num">${sess.min}분</b></div><div><span class="xs muted">세트</span><b class="num">${sets}</b></div><div><span class="xs muted">볼륨</span><b class="num">${r0(vol).toLocaleString()}</b></div></div>
  <div class="small" style="margin-top:8px">${hm(sess.start)} ~ ${hm(sess.end)}${prs?` · <b style="color:var(--accent)">신기록 ${prs}개</b>`:""}${diff!=null?` · 지난번(${prevDate.slice(5).replace("-","/")}) 대비 볼륨 <b class="num" style="color:${diff>=0?"var(--good)":"var(--warn)"}">${diff>=0?"+":""}${diff}%</b>`:""}</div></section>`;
}
/* 무게 증감 단위: 운동별로 기억한다(덤벨 1~2kg, 핀 머신 5kg 등). 고르지 않았으면 2.5kg */
export function stepOf(it){ const v=(S.main.exStep||{})[it.exId||it.name]; return v>0?v:2.5; }
/* 방금 추가·교체한 운동 카드로 스크롤하고 잠깐 강조한다 */
export function showCard(target,i){
  if(target!=="log"||ui.tab!=="workout") return; const c=document.querySelectorAll("#view .card.ex")[i]; if(!c) return;
  c.classList.add("flash"); c.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}); setTimeout(()=>c.classList.remove("flash"),1600);
}
/* 백업 안내: 기록이 쌓였는데 백업한 지 2주가 넘었거나 한 번도 안 했을 때 */
export function backupNudgeHtml(){
  const n=Object.values(S.days).filter(d=>(d.meals||[]).length||(d.workout?.items||[]).length).length; if(n<5) return "";
  const last=S.main.lastBackup?Math.floor((Date.now()-new Date(S.main.lastBackup).getTime())/86400000):null; if(last!=null&&last<14) return "";
  return `<section class="card" style="border-color:var(--warn)"><div class="spread"><div><h2>백업해 두세요</h2><div class="small" style="margin-top:2px">기록 <b class="num">${n}</b>일치가 이 기기에만 있어요 · 마지막 백업: <b>${last==null?"없음":last+"일 전"}</b></div></div><button class="btn primary" data-act="exportData">내보내기</button></div><p class="xs muted" style="margin:6px 0 0">브라우저 데이터를 지우거나 기기를 바꾸면 기록이 사라져요. 내려받은 파일은 '내 정보·목표 → 가져오기'로 되살릴 수 있어요.</p></section>`;
}
export function viewWorkout(){
  const dd=peekDay(ui.date); const items=dd.workout?.items||[]; const wi=wIdx(ui.date); const pd=S.main.plan[wi];
  // 주간 스트립
  const mon=addDays(ui.date,-wi);
  let html=`<section class="card"><div class="spread"><h2>이번 주</h2><span class="muted xs">점 = 운동 완료</span></div><div class="week" style="margin-top:8px">`;
  for(let i=0;i<7;i++){ const d=addDays(mon,i); const p=S.main.plan[i]; const done=(peekDay(d).workout?.items||[]).some(it=>doneSets(it).length);
    html+=`<button class="wd ${done?"done":""} ${d===ui.date?"sel":""}" data-act="goDate" data-date="${d}"><div class="l">${WD[i]} ${parseD(d).getDate()}</div><div class="t">${esc(p&&p.items.length?p.title:"휴식")}</div><span class="dot"></span></button>`; }
  html+=`</div></section>`;
  // 오늘 요약
  const sess=sessionInfo(ui.date);
  const total=items.reduce((a,it)=>a+(it.sets||[]).length,0), done=items.reduce((a,it)=>a+doneSets(it).length,0), vol=items.reduce((a,it)=>a+itemVolume(it),0);
  html+=`<section class="card"><div class="spread"><div><h2>${WD[wi]}요일 운동${pd&&pd.items.length?` · <span class="muted">플랜: ${esc(pd.title)}</span>`:""}</h2>
    <div class="row small" style="margin-top:4px"><span>완료 세트 <b class="num">${done}</b>/<span class="num">${total}</span></span><span class="muted">·</span><span>총 볼륨 <b class="num" id="sumVol">${r0(vol).toLocaleString()}</b> kg</span>${sess?`<span class="muted">·</span><span>운동 시간 <b class="num">${sess.min}</b>분</span>`:""}</div></div>
    <div class="row">${pd&&pd.items.length?`<button class="btn sm" data-act="loadPlan">${items.length?"플랜 다시 불러오기":"플랜 불러오기"}</button>`:""}<button class="btn sm" data-act="pickPlan">다른 요일 루틴</button><button class="btn sm primary" data-act="addEx" data-target="log">+ 운동 추가</button></div></div></section>`;
  if(sess&&total>0&&done===total) html+=sessionDoneHtml(sess,items,vol);
  if(!items.length){
    html+=`<div class="empty">${pd&&pd.items.length?`오늘은 <b>${esc(pd.title)}</b> 날이에요. "플랜 불러오기"로 시작하세요.`:"오늘은 플랜상 휴식일이에요. 운동을 직접 추가하거나 회복도 기반으로 만들 수 있어요."}</div>`;
  }else{
    items.forEach((it,i)=>{ html+=exCard(it,i,"log"); });
    html+=`<section class="card"><div class="spread"><div class="small">오늘 수정한 세트·무게를 다음 ${WD[wi]}요일 플랜에 그대로 쓰려면</div><button class="btn sm" data-act="saveToPlan">이 기록을 플랜에 반영</button></div></section>`;
  }
  const dm=dayMuscles(ui.date);
  if(Object.keys(dm).length){ const prs=items.reduce((a,it)=>a+(it.sets||[]).filter(x=>x.pr).length,0);
    html+=`<section class="card"><div class="spread"><h2>오늘 자극한 근육</h2><span class="xs muted">빨강 3세트 이상 · 살구 그 미만</span></div>
    <div class="grid2" style="margin-top:8px"><canvas id="mapFront" style="width:100%;height:240px" aria-label="앞면 근육 지도"></canvas><canvas id="mapBack" style="width:100%;height:240px" aria-label="뒷면 근육 지도"></canvas></div>
    <div class="row small" style="margin-top:6px"><span>완료 <b class="num">${done}</b>세트</span><span class="muted">·</span><span>볼륨 <b class="num">${r0(vol).toLocaleString()}</b>kg</span>${prs?`<span class="muted">·</span><span style="color:var(--accent)">신기록 <b class="num">${prs}</b>개</span>`:""}</div></section>`; }
  html+=`<section class="card"><div class="spread"><div class="small">회복도·주간 볼륨·1RM 추이·월간 기록</div><button class="btn sm" data-act="tab" data-tab="stats">분석 보기 ›</button></div></section>`;
  return html;
}
/* 분석 탭으로 옮긴 카드: 회복도 막대, 이번 주 부위별 세트 */
export function recoveryCards(){
  let ins="";
  // 회복도
  const rec=recovery(ui.date);
  ins+=`<section class="card"><div class="spread"><h2>근육 회복도</h2><button class="why" data-act="why" data-rule="recovery,deload">근거</button></div><div class="rec" style="margin-top:8px">`;
  MGROUP.forEach(([g])=>{const {r:v,h}=rec[g]; const col=v>=85?"var(--good)":v>=55?"var(--warn)":"var(--bad)";
    ins+=`<div class="m"><b>${g} <span class="num" style="float:right;color:${col}">${v}%</span></b><div class="bar"><i style="width:${v}%;background:${col}"></i></div>${v<90?`<span class="xs muted">약 ${h>=120?"120+":h}시간 후 회복</span>`:""}</div>`;});
  ins+=`</div><p class="xs muted" style="margin:8px 0 0">기본 48시간에 걸쳐 회복 · RIR 0은 +24h, RIR 1은 +12h, 큰 근육은 +12h (Morán-Navarro 2017, Goulart 2021) · 추정치예요</p><div class="row" style="margin-top:10px"><button class="btn sm" data-act="genRecovery">회복된 부위로 오늘 운동 만들기</button></div></section>`;
  // 이번 주 부위별 세트 (Hevy·RP 가이드: 부위당 주 10~20세트)
  const ws=weekSets(ui.date); const wmax=Math.max(24,...Object.values(ws));
  ins+=`<section class="card"><div class="spread"><h2>이번 주 부위별 세트</h2><button class="why" data-act="why" data-rule="vol_week,vol_fractional,freq,vol_session">근거 · 10~20세트</button></div><div style="display:grid;gap:6px;margin-top:10px">`;
  const wf=weekFreq(ui.date);
  MGROUP.forEach(([g])=>{const v=ws[g]||0;const col=v<10?"var(--warn)":v<=20?"var(--good)":"var(--accent)";
    ins+=`<div class="ms" style="grid-template-columns:72px 1fr 44px 40px"><span>${g}</span><div class="bar"><span class="band" style="left:${10/wmax*100}%;width:${10/wmax*100}%"></span><i style="width:${Math.min(100,v/wmax*100)}%;background:${col};position:relative"></i></div><span class="num" style="text-align:right">${r1(v)}</span><span class="xs muted" style="text-align:right">${wf[g]||0}회</span></div>`;});
  ins+=`</div><p class="xs muted" style="margin:8px 0 0">주동근 1세트 = 1, 보조근 = 0.5 (fractional 방식, Pelland 2025) · 완료한 세트만 · 오른쪽 숫자 = 이번 주 훈련 횟수</p></section>`;
  return ins;
}
/* 원판 계산 (다음에 할 세트 기준). 세트 값이 바뀌면 이 부분만 다시 그린다 */
export function platesHtml(it){
  const t=exType(it), e=exInfo(it);
  if(t==="w"&&e&&/바벨|스미스|EZ바/.test(e.equip)){ const nx=(it.sets||[]).find(x=>!x.done)||it.sets[0]; const bar=/스미스/.test(e.equip)?0:/EZ/.test(e.equip)?10:(S.main.barKg||20); const pc=nx?plateCalc(+nx.w,bar):null;
    if(pc) return `<div class="plates" aria-hidden="true"><i class="pbar"></i>${pc.out.map(w=>`<i class="pl p${String(w).replace(".","_")}">${w}</i>`).join("")}<i class="pcol"></i></div><div class="xs muted" style="margin-top:4px">원판 (${nx.w}kg, 한쪽): <b class="num" style="color:var(--ink)">${pc.out.join(" + ")||"-"}</b>${pc.rest>0?` · ${pc.rest}kg 남음`:""} · ${/스미스/.test(e.equip)?"스미스 바 무게는 기종마다 달라요":/EZ/.test(e.equip)?"EZ바 10kg 기준":`바 <select data-chg="barKg" style="width:auto;padding:2px 4px;font-size:12px" aria-label="바 무게">${[20,15,10,7].map(v=>`<option value="${v}" ${bar===v?"selected":""}>${v}kg</option>`).join("")}</select> 기준`}</div>`; }
  return "";
}
/* 세트 값이 바뀌었을 때: 화면 전체를 다시 그리지 않고 원판 계산과 총 볼륨만 갱신한다(입력 포커스 유지) */
export function refreshCard(i){
  const items=peekDay(ui.date).workout?.items||[]; const it=items[i]; if(!it) return;
  const pe=document.getElementById("plates-"+i); if(pe) pe.innerHTML=platesHtml(it);
  const sv=document.getElementById("sumVol"); if(sv) sv.textContent=r0(items.reduce((a,x)=>a+itemVolume(x),0)).toLocaleString();
}
export function exCard(it,i,mode){
  const t=exType(it); const e=exInfo(it); const log=mode==="log";
  const unitW=t==="w"?"kg":"", unitR=t==="t"?"분":"회";
  let sug=null, pr=null;
  if(log){ sug=suggestNext(it,ui.date); pr=prevRecord(it.name,ui.date); }
  const best=log&&t==="w"?bestE1rm(it.name):0;
  let h=`<section class="card ex${it.ss?" ss-top":""}"><div class="ex-head"><div><div class="ex-title">${esc(it.name)}</div><div class="row xs muted" style="margin-top:2px"><span class="chip">${esc(exPart(it))}</span>${e&&e.stretch?`<span class="chip badge-s" title="${esc(e.stretch.note)}">스트레치</span>`:""}${it.ss?`<span class="chip ss">슈퍼세트 ↓</span>`:""}${it.rirT?`<span class="chip">목표 RIR ${esc(it.rirT)}</span>`:""}${e?`<span>${esc(e.equip)}</span>`:""}${best?`<span>· 추정 1RM 최고 <b class="num">${r1(best)}</b>kg</span>`:""}</div></div>
    <div class="row"><button class="btn sm ghost" data-act="tips" data-ex="${esc(it.exId||"")}" data-name="${esc(it.name)}">팁</button>${log?`<button class="btn sm ghost" data-act="swap" data-i="${i}" data-target="${mode}">교체</button>`:""}<button class="btn sm icon ghost" data-act="moveEx" data-i="${i}" data-d="-1" data-target="${mode}" aria-label="위로">↑</button><button class="btn sm icon ghost" data-act="moveEx" data-i="${i}" data-d="1" data-target="${mode}" aria-label="아래로">↓</button><button class="btn sm icon ghost" data-act="delEx" data-i="${i}" data-target="${mode}" aria-label="삭제">✕</button></div></div>`;
  if(log){ const nk=it.exId||it.name; h+=`<input type="text" class="exnote" data-chg="exNote" data-key="${esc(nk)}" value="${esc((S.main.exNotes||{})[nk]||"")}" maxlength="120" placeholder="메모 (시트 높이·핀 위치 등 — 다음에도 보여요)" aria-label="${esc(it.name)} 메모">`; }
  if(log&&pr){ h+=`<div class="prevrow"><span class="xs muted">지난 기록 ${pr.date.slice(5).replace("-","/")} · ${pr.sets.map(s=>t==="w"?`${s.w}×${s.r}`:`${s.r}${unitR}`).join(", ")}</span><button class="btn sm" data-act="loadPrev" data-i="${i}">불러오기</button></div>`; }
  if(sug){ h+=`<div class="hint" style="margin-top:6px">추천: ${esc(sug.msg)} <button class="why" data-act="why" data-rule="overload,rir">근거</button> <button class="btn sm" data-act="applySug" data-i="${i}" data-w="${sug.w}" data-r="${sug.r}">적용</button></div>`; }
  const lg=log&&t!=="t"?" lg":"";
  h+=`<div class="sets"><div class="set hdr${lg}"><span style="text-align:center">세트</span><span style="text-align:center">${t==="w"?"무게(kg)":t==="t"?"—":"추가중량"}</span><span style="text-align:center">${t==="t"?"시간(분)":"횟수"}</span>${lg?`<span style="text-align:center" title="남은 반복 수: 몇 개 더 할 수 있었나">RIR</span>`:""}<span style="text-align:center">${log?"완료":""}</span></div>`;
  let wn=0; // 본 세트 번호 (워밍업은 건너뜀)
  (it.sets||[]).forEach((s,k)=>{ const kind=s.kind||""; if(kind!=="w") wn++; const lab=kind==="w"?"W":kind==="d"?"D":wn;
    const pk=wn-1; const pv=log&&pr&&kind!=="w"&&pr.sets[pk]?(t==="w"?`${pr.sets[pk].w}×${pr.sets[pk].r}`:`${pr.sets[pk].r}`):"";
    h+=`<div class="set${lg} ${s.done?"done":""} ${kind?"k-"+kind:""} ${ui.justDone===i+"-"+k?"just":""}"><button class="n" data-act="setKind" data-i="${i}" data-k="${k}" data-target="${mode}" aria-label="${k+1}번째 세트 종류: ${kind==="w"?"워밍업":kind==="d"?"드롭세트":"본 세트"} (누르면 바뀜)" ${s.pr?'title="신기록" style="color:var(--accent)"':""}>${s.pr?"★":lab}${pv?`<small title="지난번 같은 세트">${pv}</small>`:""}</button>
    <input type="number" inputmode="decimal" step="0.5" min="0" value="${s.w}" ${t==="t"?"disabled":""} data-chg="set" data-target="${mode}" data-i="${i}" data-k="${k}" data-f="w" aria-label="${k+1}세트 무게">
    <input type="number" inputmode="numeric" step="1" min="0" value="${s.r}" data-chg="set" data-target="${mode}" data-i="${i}" data-k="${k}" data-f="r" aria-label="${k+1}세트 ${unitR}">
    ${lg?`<select data-chg="rir" data-i="${i}" data-k="${k}" aria-label="${k+1}세트 RIR">${["","0","1","2","3","4"].map(v=>`<option value="${v}" ${String(s.rir??"")===v?"selected":""}>${v===""?"–":v==="4"?"4+":v}</option>`).join("")}</select>`:""}
    ${log?`<button class="check" data-act="toggleSet" data-i="${i}" data-k="${k}" aria-label="${k+1}세트 완료">✓</button>`:`<button class="btn sm icon ghost" data-act="delSet" data-i="${i}" data-k="${k}" data-target="${mode}" aria-label="세트 삭제">−</button>`}</div>`;
  });
  if(log) h+=`<div id="plates-${i}">${platesHtml(it)}</div>`;
  h+=`</div><div class="adjust"><button class="btn sm" data-act="setCount" data-i="${i}" data-d="1" data-target="${mode}">+ 세트</button><button class="btn sm" data-act="setCount" data-i="${i}" data-d="-1" data-target="${mode}">− 세트</button>`;
  if(t==="w"){ const st=stepOf(it); h+=`<button class="btn sm" data-act="bulk" data-i="${i}" data-f="w" data-d="-1" data-target="${mode}">무게 −${st}</button><button class="btn sm" data-act="bulk" data-i="${i}" data-f="w" data-d="1" data-target="${mode}">무게 +${st}</button><label class="row xs muted" style="gap:4px">단위<select data-chg="step" data-target="${mode}" data-i="${i}" style="width:auto;padding:4px 6px;min-height:var(--tap)" aria-label="무게 증감 단위">${[1,1.25,2,2.5,5,10].map(v=>`<option value="${v}" ${st===v?"selected":""}>${v}kg</option>`).join("")}</select></label>`; }
  h+=`<button class="btn sm" data-act="bulk" data-i="${i}" data-f="r" data-d="-1" data-target="${mode}">${unitR} −1</button><button class="btn sm" data-act="bulk" data-i="${i}" data-f="r" data-d="1" data-target="${mode}">${unitR} +1</button>`;
  if(t!=="t") h+=`<label class="row xs muted" style="gap:4px">휴식<select data-chg="rest" data-target="${mode}" data-i="${i}" style="width:auto;padding:4px 6px">${[60,90,120,150,180,240].map(v=>`<option value="${v}" ${(it.rest||e?.rest||90)==v?"selected":""}>${Math.floor(v/60)}:${pad(v%60)}</option>`).join("")}</select></label>`;
  h+=`<button class="btn sm ${it.ss?"primary":""}" data-act="superset" data-i="${i}" data-target="${mode}" aria-pressed="${!!it.ss}">${it.ss?"슈퍼세트 해제":"다음 운동과 슈퍼세트"}</button>`;
  if(log) h+=`<span class="xs muted" style="align-self:center">세트 번호를 누르면 워밍업(W)·드롭(D)으로 바뀌어요 · 일괄 조절은 안 끝낸 세트에만</span>`;
  h+=`</div></section>`;
  return h;
}
export function bestE1rmBefore(name,date,exclude){
  let b=0; Object.keys(S.days).forEach(d=>{ (S.days[d].workout?.items||[]).forEach(it=>{ if(it.name!==name) return; workSets(it).forEach(st=>{ if(st===exclude) return; if(d>date) return; b=Math.max(b,e1rm(+st.w,+st.r)); }); }); }); return b;
}
export function bestE1rm(name){
  let b=0; Object.values(S.days).forEach(v=>(v.workout?.items||[]).forEach(it=>{ if(it.name===name) workSets(it).forEach(s=>{ b=Math.max(b,e1rm(+s.w,+s.r)); }); })); return b;
}

export const MGROUP=[["가슴",["chest","uchest"]],["등",["lats","rhom","traps","erect"]],["어깨",["fdelt","sdelt","rdelt"]],["이두",["bi"]],["삼두",["tri"]],["대퇴사두",["quad"]],["햄스트링",["ham"]],["둔근",["glute","abd"]],["종아리",["calf"]],["복근",["abs","obl"]]];
export const PART2G={"가슴":"가슴","등":"등","어깨":"어깨","팔":"이두","하체":"대퇴사두","코어":"복근"};
export function monthCal(){
  const d0=parseD(ui.date); const y=d0.getFullYear(), m=d0.getMonth(); const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(); const off=(first.getDay()+6)%7;
  let n=0; let cells=""; for(let i=0;i<off;i++) cells+=`<span></span>`;
  for(let dd=1;dd<=days;dd++){ const k=ymd(new Date(y,m,dd)); const sets=(S.days[k]?.workout?.items||[]).reduce((a,it)=>a+workSets(it).length,0); if(sets) n++;
    const lvl=sets===0?0:sets<10?1:sets<20?2:3; const bg=["var(--surface-2)","color-mix(in srgb,var(--accent) 30%,var(--surface))","color-mix(in srgb,var(--accent) 60%,var(--surface))","var(--accent)"][lvl];
    cells+=`<button class="calc" data-act="goDate" data-date="${k}" style="background:${bg};${k===ui.date?"outline:2px solid var(--ink);":""}color:${lvl>=2?"#fff":"var(--ink)"}" aria-label="${m+1}월 ${dd}일 ${sets}세트">${dd}</button>`; }
  return `<section class="card"><div class="spread"><h2>${m+1}월 운동 기록</h2><span class="small muted">운동한 날 <b class="num" style="color:var(--ink)">${n}</b>일</span></div>
  <div class="cal" style="margin-top:8px">${WD.map(w=>`<span class="xs muted" style="text-align:center">${w}</span>`).join("")}${cells}</div></section>`;
}
export function weekFreq(ref){ const mon=addDays(ref,-wIdx(ref)); const f={};
  for(let i=0;i<7;i++){ const v=S.days[addDays(mon,i)]; if(!v||!v.workout) continue; const day={};
    (v.workout.items||[]).forEach(it=>{ const n=workSets(it).length; if(!n) return; const W=groupWeights(it); for(const g in W) day[g]=(day[g]||0)+W[g]*n; });
    for(const g in day) if(day[g]>=1) f[g]=(f[g]||0)+1; }
  return f; }
export function weekSets(ref){
  const mon=addDays(ref,-wIdx(ref)); const c={};
  for(let i=0;i<7;i++){ const v=S.days[addDays(mon,i)]; if(!v||!v.workout) continue;
    (v.workout.items||[]).forEach(it=>{ const n=workSets(it).length; if(!n) return; const e=exInfo(it);
      if(!e){ const g=PART2G[exPart(it)]; if(g) c[g]=(c[g]||0)+n; return; }
      MGROUP.forEach(([g,ks])=>{ if(e.prim.some(k=>ks.includes(k))) c[g]=(c[g]||0)+n; else if(e.sec.some(k=>ks.includes(k))) c[g]=(c[g]||0)+n*.5; });
    });
  }
  return c;
}
export function lastWeightDate(){ return Object.keys(S.days).filter(d=>S.days[d].weight).sort().pop()||"0"; }
export function weightCard(){
  const ds=Object.keys(S.days).filter(d=>S.days[d].weight).sort().slice(-30);
  const cur=peekDay(ui.date).weight;
  let chart="";
  if(ds.length>=2){const W=320,H=80,pl=30,pt=8,pb=16;const v=ds.map(d=>S.days[d].weight);const mx=Math.max(...v)+.5,mn=Math.min(...v)-.5;
    const x=i=>pl+(W-pl-8)*i/(ds.length-1),y=w=>pt+(H-pt-pb)*(1-(w-mn)/(mx-mn));const pts=v.map((w,i)=>`${x(i)},${y(w)}`).join(" ");
    chart=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="체중 추이"><line x1="${pl}" x2="${W-4}" y1="${y(mx-.5)}" y2="${y(mx-.5)}" stroke="var(--line)"/><line x1="${pl}" x2="${W-4}" y1="${y(mn+.5)}" y2="${y(mn+.5)}" stroke="var(--line)"/><text x="${pl-4}" y="${y(mx-.5)+4}" text-anchor="end" style="font-size:10px">${r1(mx-.5)}</text><text x="${pl-4}" y="${y(mn+.5)+4}" text-anchor="end" style="font-size:10px">${r1(mn+.5)}</text><polyline points="${pts}" fill="none" stroke="var(--prot)" stroke-width="2"/><circle cx="${x(v.length-1)}" cy="${y(v[v.length-1])}" r="4" fill="var(--prot)"/><text x="${pl}" y="${H-2}" style="font-size:10px">${ds[0].slice(5).replace("-","/")}</text><text x="${W-4}" y="${H-2}" text-anchor="end" style="font-size:10px">${ds[ds.length-1].slice(5).replace("-","/")}</text></svg>`;}
  const first=ds.length?S.days[ds[0]].weight:null,last=ds.length?S.days[ds[ds.length-1]].weight:null;
  return `<section class="card"><div class="spread"><h2>체중</h2>${ds.length>=2?`<span class="small muted">최근 ${ds.length}회 기록 <b class="num" style="color:${(S.main.profile.goal==="bulk"?last-first>=0:S.main.profile.goal==="cut"?last-first<=0:Math.abs(last-first)<1)?"var(--good)":"var(--warn)"}">${last-first>0?"+":""}${r1(last-first)}kg</b></span>`:""}</div>
  <div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="number" id="bwIn" step="0.1" inputmode="decimal" placeholder="오늘 체중 (kg)" value="${cur||""}" style="max-width:160px"><button class="btn sm" data-act="saveWeight">${cur?"수정":"기록"}</button><span class="xs muted">아침 공복에 재면 가장 정확해요</span></div>${chart}</section>`;
}

/* ---------- 주간 플랜 ---------- */
export function viewPlan(){
  let html=`<section class="card"><div class="spread"><h2>추천 플랜 만들기</h2></div>
  <div class="grid3" style="margin-top:10px">
    <label class="f">목표<select id="rGoal"><option value="hyper">근비대 (몸 키우기)</option><option value="strength">근력 (중량 올리기)</option><option value="cut">체지방 감량</option><option value="fit">체력·건강</option></select></label>
    <label class="f">주당 운동일<select id="rDays">${[2,3,4,5,6].map(n=>`<option ${n===4?"selected":""}>${n}</option>`).join("")}</select></label>
    <label class="f">경력<select id="rLevel"><option value="beg">초보 (1년 미만)</option><option value="mid" selected>중급 (1~3년)</option><option value="adv">상급 (3년 이상)</option></select></label>
    <label class="f">장소·기구<select id="rEquip"><option value="gym">헬스장</option><option value="home">홈트 (덤벨·맨몸)</option></select></label>
    <label class="f">기구 선호<select id="rPref"><option value="mix">혼합</option><option value="machine">머신 위주</option><option value="free">프리웨이트 위주</option><option value="brand">우리 헬스장 머신 (해머·노틸러스)</option></select></label>
    <label class="f" style="grid-column:span 3">더 키우고 싶은 부위<div class="row" id="rFocus">${PARTS.slice(0,6).map(p=>`<button type="button" class="chip" data-act="focus" data-p="${p}">${p}</button>`).join("")}</div></label>
  </div>
  <label class="f" style="margin-top:10px">요청사항 (Claude 맞춤 추천에 반영)<textarea id="rNote" placeholder="예: 허리가 약해서 데드리프트는 빼줘 / 운동 시간은 1시간 이내 / 3대 500 목표"></textarea></label>
  <div class="row" style="margin-top:10px"><button class="btn" data-act="tplPlan">기본 추천 받기</button><button class="btn primary ai" data-act="aiPlan" ${ui.aiBusy?"disabled":""}>Claude 맞춤 추천</button></div>
  <p class="xs muted" style="margin:8px 0 0">근비대 기준: 실패 근처(RIR 0~2)까지, 부위당 주 10~20세트, 주 2회 이상. 머신과 프리웨이트는 근비대 차이가 없어서 선호대로 고르면 돼요 (Haugen 2023). 자세한 근거는 운동 가이드 탭에 있어요.</p>
  <div id="aiPlanOut"></div></section>`;
  if(S.main.planNote) html+=`<div class="hint">${md(S.main.planNote)}</div>`;
  html+=`<section class="card"><div class="spread"><h2>내 플랜 피드백</h2><button class="btn sm ai" data-act="aiFeedback" ${ui.aiBusy?"disabled":""}>Claude 상세 피드백</button></div><div style="margin-top:10px">${feedbackHtml(S.main.plan,S.main.level||"mid")}</div>${S.main.aiFeedback?`<div class="ai-out" style="margin-top:10px" id="aiFbOut">${md(S.main.aiFeedback)}</div>`:`<div id="aiFbOut"></div>`}</section>`;
  html+=`<section class="card"><div class="spread"><h2>부위별 볼륨 점검</h2><span class="muted xs">계획된 세트 기준</span></div><div style="margin-top:8px">${planCheckHtml(S.main.plan,S.main.level||"mid")}</div></section>`;
  S.main.plan.forEach((p,i)=>{
    const open=ui.editDay===i;
    html+=`<section class="card plan-day"><div class="spread"><h2>${WD[i]}요일 · ${esc(p.items.length?p.title:"휴식")}</h2><div class="row">${open?`<button class="btn sm primary" data-act="editDay" data-i="-1">완료</button>`:`<button class="btn sm" data-act="editDay" data-i="${i}">편집</button>`}</div></div>`;
    if(open){
      html+=`<label class="f">이 날 이름<input type="text" value="${esc(p.title)}" data-chg="dayTitle" data-i="${i}"></label>`;
      p.items.forEach((it,k)=>{ html+=exCard(it,k,"plan"+i); });
      html+=`<div class="row"><button class="btn sm primary" data-act="addEx" data-target="plan${i}">+ 운동 추가</button>${p.items.length?`<button class="btn sm" data-act="clearDay" data-i="${i}">휴식일로 비우기</button>`:""}<button class="btn sm" data-act="copyDay" data-i="${i}">다른 요일로 복사</button></div>`;
    }else if(p.items.length){
      p.items.forEach(it=>{ const t=exType(it); const s=it.sets||[]; const w=s[0]?.w, r=s[0]?.r;
        html+=`<div class="pi"><span>${esc(it.name)} <span class="chip">${esc(exPart(it))}</span>${exInfo(it)?.stretch?` <span class="chip badge-s">스트레치</span>`:""}</span><span class="num muted">${s.length}세트 × ${r}${t==="t"?"분":"회"}${t==="w"&&w?` · ${w}kg`:""}${it.rirT?` · RIR ${esc(it.rirT)}`:""}</span></div>`; });
    }else html+=`<div class="muted small">휴식일. 편집을 눌러 운동을 넣을 수 있어요.</div>`;
    html+=`</section>`;
  });
  return html;
}

/* ---------- 가이드 ---------- */
export const CATS=["전체","머신","프리웨이트","케이블","맨몸","유산소"];
export function guideFilter(){const q=ui.guideQ.trim();
  // 검색어가 있으면 별칭·초성·오타·한영 검색으로 후보를 뽑고, 그 위에 필터를 건다
  const list=(q?searchExercises(q):EX).filter(e=>(!ui.guideStretch||e.stretch)&&(ui.guideBrand==="전체"||(ui.guideBrand==="일반"?!e.brand:e.brand===ui.guideBrand))&&(ui.guidePart==="전체"||e.part===ui.guidePart)&&(ui.guideCat==="전체"||e.cat===ui.guideCat));
  if(q&&!list.length) logMiss("exercise",q);
  return list;}
export function viewGuide(){
  const list=guideFilter();
  let html=`<section class="card"><input type="search" placeholder="운동·근육·기구로 검색 (예: 광배, 스미스, 햄스트링)" value="${esc(ui.guideQ)}" data-inp="guideQ" id="guideQ">
  <div class="row" style="margin-top:8px"><span class="xs muted" style="width:34px">부위</span>${["전체",...PARTS].map(p=>`<button class="chip ${ui.guidePart===p?"on":""}" data-act="guidePart" data-p="${p}">${p}</button>`).join("")}</div>
  <div class="row" style="margin-top:6px"><span class="xs muted" style="width:34px">기구</span>${CATS.map(p=>`<button class="chip ${ui.guideCat===p?"on":""}" data-act="guideCat" data-p="${p}">${p}</button>`).join("")}<button class="chip badge-s ${ui.guideStretch?"on":""}" data-act="guideStretch">스트레치 강조만</button></div>
  <div class="row" style="margin-top:6px"><span class="xs muted" style="width:34px">브랜드</span>${["전체",...BRANDS,"일반"].map(p=>`<button class="chip ${ui.guideBrand===p?"on":""}" data-act="guideBrand" data-p="${p}">${p}</button>`).join("")}</div>
  <p class="xs muted" style="margin:8px 0 0" id="guideCount">${list.length}개 운동 · 누르면 3D 동작과 타깃 근육을 볼 수 있어요</p></section>`;
  html+=evidenceSectionHtml();
  html+=`<section class="card"><h2>운동 질문</h2><span class="xs muted">자체 근거 DB에서 먼저 찾고, Claude 답변을 덧붙여요</span><div class="row" style="margin-top:8px;flex-wrap:nowrap"><input type="text" id="gAsk" placeholder="예: 벤치프레스할 때 어깨가 아파요 / 불가리안 스플릿 스쿼트 자세"><button class="btn primary ai" data-act="aiAsk" ${ui.aiBusy?"disabled":""}>질문</button></div><div id="gAskOut"></div></section>`;
  html+=`<div id="guideList">${guideCards(list)}</div>`;
  return html;
}
export function tgLine(e){return `<b>${e.prim.map(k=>MUSCLE_KO[k]).join(", ")}</b>${e.sec.length?` · ${e.sec.map(k=>MUSCLE_KO[k]).join(", ")}`:""}`;}
export function guideCards(list){
  if(!list.length) return `<div class="empty">검색 결과가 없어요. 위의 Claude 질문 칸에 물어보세요.</div>`;
  return `<div class="glist">`+list.map(e=>`<button class="gx" data-act="exDetail" data-id="${e.id}"><span class="nm">${esc(e.name)}</span><span class="row" style="gap:4px"><span class="chip">${e.part}</span><span class="chip">${e.brand?esc(e.brand==="해머 스트렝스"?"해머":"노틸러스"):e.cat}</span></span><span class="tg">${tgLine(e)} <span class="muted">· ${esc(e.equip)}</span>${e.stretch?` <span class="chip badge-s" style="font-size:11px">스트레치</span>`:""}</span></button>`).join("")+`</div>`;
}
export function exHistory(name){
  const out=[];Object.keys(S.days).sort().forEach(d=>{(S.days[d].workout?.items||[]).forEach(it=>{if(it.name!==name)return;const ds=workSets(it);if(!ds.length)return;const best=ds.reduce((a,s)=>Math.max(a,e1rm(+s.w,+s.r)),0);const top=ds.reduce((a,s)=>(+s.w>+a.w||(+s.w===+a.w&&+s.r>+a.r))?s:a,ds[0]);out.push({d,best,top,n:ds.length,vol:itemVolume(it)});});});
  return out;
}
export function histChart(h){
  if(h.length<2) return "";
  const W=320,H=110,pl=34,pb=18,pt=8;const vals=h.map(x=>x.best);const mx=Math.max(...vals)*1.05,mn=Math.min(...vals)*.9;
  const x=i=>pl+(W-pl-8)*i/(h.length-1), y=v=>pt+(H-pt-pb)*(1-(v-mn)/(mx-mn||1));
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="추정 1RM 추이">`;
  [mn,(mn+mx)/2,mx].forEach(v=>s+=`<line x1="${pl}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-4}" y="${y(v)+4}" text-anchor="end" style="font-size:10px">${Math.round(v)}</text>`);
  const pts=h.map((p,i)=>`${x(i)},${y(p.best)}`).join(" ");
  s+=`<polygon points="${pl},${H-pb} ${pts} ${x(h.length-1)},${H-pb}" fill="var(--accent)" opacity=".12"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  s+=`<circle cx="${x(h.length-1)}" cy="${y(vals[vals.length-1])}" r="4" fill="var(--accent)"/>`;
  s+=`<text x="${pl}" y="${H-3}" style="font-size:10px">${h[0].d.slice(5).replace("-","/")}</text><text x="${W-4}" y="${H-3}" text-anchor="end" style="font-size:10px">${h[h.length-1].d.slice(5).replace("-","/")}</text></svg>`;
  return s;
}
export function exDetail(id,fromName){
  const e=EXMAP[id]; if(!e) return tipsSheetCustom(fromName||"");
  const h=exHistory(e.name); const unit=e.type==="t"?"분":"회";
  let html=`<div class="spread"><h2 style="margin:0">${esc(e.name)}</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
  <div class="row xs muted" style="margin-top:4px"><span class="chip">${e.part}</span><span class="chip">${e.cat}</span><span>${esc(e.equip)}</span>${e.en?`<span>· ${esc(e.en)}</span>`:exMeta(e)?`<span>· ${esc(exMeta(e).en)}</span>`:""}${exMeta(e)&&exMeta(e).level?`<span class="chip" title="출처: free-exercise-db (퍼블릭 도메인)">난이도 ${exMeta(e).level}</span>`:""}</div>
  <div class="viewer"><span class="vhint">드래그해서 돌려보기</span><canvas id="figCanvas" aria-label="${esc(e.name)} 3D 동작"></canvas>
  <div class="vctl"><button class="btn sm" data-act="figPlay" id="figPlayBtn">일시정지</button><button class="btn sm" data-act="figSpeed" id="figSpeedBtn" aria-label="재생 속도">${ui.slow?"0.5x":"1.0x"}</button><span style="flex:1"></span><button class="btn sm ghost" data-act="figView" data-y="0">정면</button><button class="btn sm ghost" data-act="figView" data-y="90">측면</button><button class="btn sm ghost" data-act="figView" data-y="180">뒤</button><button class="btn sm ghost" data-act="figView" data-y="def">기본</button></div>
  <div class="vctl guides" role="group" aria-label="자세 가이드"><button class="tgl on" data-act="figGuide" data-g="trail" aria-pressed="true">궤적선</button><button class="tgl on" data-act="figGuide" data-g="muscles" aria-pressed="true">근육 강조</button><button class="tgl" data-act="figGuide" data-g="lines" aria-pressed="false">기준선·관절각</button></div></div>
  <div class="legend"><span><i class="sw" style="background:var(--fig-prim)"></i>주동근: <b>${e.prim.map(k=>MUSCLE_KO[k]).join(", ")}</b></span>${e.sec.length?`<span><i class="sw" style="background:var(--fig-sec)"></i>보조근: ${e.sec.map(k=>MUSCLE_KO[k]).join(", ")}</span>`:""}</div>
  <div class="xs muted" style="margin-top:4px">점선 = 바·손(또는 발)의 이동 궤적 · 3D 인체 모형: Z-Anatomy, BodyParts3D (CC BY-SA 4.0)</div>
  <div class="grid2" style="margin-top:12px"><div><div class="small" style="font-weight:700;color:var(--good)">운동 포인트</div><ul class="tip-list small">${e.tips.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div><div><div class="small" style="font-weight:700;color:var(--bad)">흔한 실수</div><ul class="tip-list small">${e.mistakes.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div></div>
  <div class="xs muted" style="margin-top:4px">기본 처방: ${e.def[0]}세트 × ${e.def[1]}${unit}${e.def[2]?` · 시작 ${e.def[2]}kg 예시`:""}${e.type!=="t"?` · 권장 휴식 ${e.compound?"2~3분":"1.5~2분"} · 근비대 목표 RIR ${e.compound?"1~2":"0~1"}`:""}</div>
  ${e.stretch?`<div class="hint" style="margin-top:8px;background:color-mix(in srgb,var(--prot) 12%,transparent)"><b>스트레치 강조 운동</b> (근거 ${e.stretch.lvl}) · ${esc(e.stretch.note)}</div>`:""}
  ${e.cat==="머신"||e.cat==="프리웨이트"?`<div class="xs muted" style="margin-top:6px">머신과 프리웨이트는 근비대 효과가 비슷해요. 근력은 훈련한 방식에서 더 늘어요 (Haugen 2023).</div>`:""}`;
  if(h.length){const b=h.reduce((a,x)=>x.best>a.best?x:a,h[0]);
    html+=`<div class="card" style="margin-top:12px;background:var(--surface-2)"><div class="spread"><h3>내 기록</h3>${e.type==="w"?`<span class="small">추정 1RM 최고 <b class="num">${r1(b.best)}</b>kg</span>`:""}</div>${e.type==="w"?histChart(h):""}
    <div class="small" style="margin-top:6px;display:grid;gap:2px">${h.slice(-5).reverse().map(x=>`<div class="spread"><span class="muted">${x.d.slice(5).replace("-","/")}</span><span class="num">${e.type==="w"?`${x.top.w}kg × ${x.top.r}`:`${x.top.r}${unit}`} · ${x.n}세트${e.type==="w"?` · 볼륨 ${r0(x.vol).toLocaleString()}kg`:""}</span></div>`).join("")}</div></div>`;}
  html+=`<div class="row" style="margin-top:12px"><button class="btn primary" data-act="addExToday" data-id="${e.id}">${ui.date===ymd(new Date())?"오늘":"이 날"} 운동에 추가</button><button class="btn" data-act="why" data-rule="${exRuleIds(e)}">권장값의 근거</button></div><div id="tipOut"></div>`;
  openSheet(html);
  const cv=document.getElementById("figCanvas");
  try{ ui.fig=FIG.viewer(cv,e,{overlay:true}); if(ui.slow) ui.fig.setSpeed(.5); }catch(err){ cv.outerHTML=`<p class="small muted" style="padding:12px">3D 동작을 그리지 못했어요.</p>`; }
}
export function tipsSheetCustom(name){
  openSheet(`<div class="spread"><h2>${esc(name)}</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div><p class="muted small">기본 가이드에 없는 운동이에요.</p><button class="btn sm primary ai" data-act="aiTip" data-name="${esc(name)}">Claude에게 운동 포인트 묻기</button><div id="tipOut"></div>`);
}
