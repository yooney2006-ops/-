// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { EXMAP, WD } from "./catalog";
import { S } from "./state";
import { addDays, day, esc, parseD, r1, uid, ymd } from "./util";
import { MGROUP, PART2G } from "./views";
import { EX } from "../data/exercises.js";

/* 운동: 회복도 / 추천 / 기록
   ============================================================ */
export function exInfo(it){ return EXMAP[it.exId]||null; }
export function exType(it){ const e=exInfo(it); return it.type||(e?e.type:"w"); }
export function exPart(it){ const e=exInfo(it); return it.part||(e?e.part:"기타"); }
export function doneSets(it){ return (it.sets||[]).filter(s=>s.done); }
/* 세트 종류: kind 없음 = 본 세트, "w" = 워밍업, "d" = 드롭세트.
   통계(볼륨·세트 수·회복도·1RM·신기록)에는 워밍업을 뺀 workSets만 쓴다. 드롭세트는 본 세트로 센다. */
export function workSets(it){ return (it.sets||[]).filter(s=>s.done&&s.kind!=="w"); }
export const SET_KINDS=[["","본 세트"],["w","워밍업"],["d","드롭세트"]];
export function itemVolume(it){ const t=exType(it); return workSets(it).reduce((a,s)=>a+(t==="w"?(+s.w||0)*(+s.r||0):0),0); }
export function e1rm(w,r){ return r>0&&w>0? w*(1+r/30):0; }

// 근육 회복도 (근거: Morán-Navarro 2017, Goulart 2021 — 실패 훈련은 회복 24~48h 지연, 최소 48h)
export const BIGG=new Set(["대퇴사두","햄스트링","둔근","등","가슴"]);
export function groupWeights(it){ // 근육군별 fractional 가중치 (Pelland 2025: 주동 1, 보조 0.5)
  const e=exInfo(it), w={};
  if(!e){ const g=PART2G[exPart(it)]; if(g) w[g]=1; return w; }
  MGROUP.forEach(([g,ks])=>{ if(e.prim.some(k=>ks.includes(k))) w[g]=1; else if(e.sec.some(k=>ks.includes(k))) w[g]=.5; });
  return w;
}
export function rirOf(s){ return (s.rir===""||s.rir==null)?2:+s.rir; }
export function recFactor(rir){ return rir<=0?1.3:rir===1?1.15:rir===2?1:rir===3?.85:.7; }
export function refMs(d){ return d===ymd(new Date())?Date.now():parseD(d).getTime()+12*3600000; }
export function fatigueAt(atMs,refDate){
  const F={}; MGROUP.forEach(([g])=>F[g]=0);
  for(let i=0;i<6;i++){ const d=addDays(refDate,-i); const v=S.days[d]; if(!v||!v.workout) continue;
    (v.workout.items||[]).forEach(it=>{ const W=groupWeights(it); if(exType(it)==="t") return;
      workSets(it).forEach(st=>{ const t=st.t||parseD(d).getTime()+18*3600000; const hrs=(atMs-t)/3600000; if(hrs<0) return; const rir=rirOf(st);
        for(const g in W){ const tau=48+(rir<=0?24:rir===1?12:0)+(BIGG.has(g)?12:0); F[g]+=W[g]*recFactor(rir)*Math.max(0,1-hrs/tau); } });
    });
  }
  return F;
}
export function recovery(refDate){
  const at=refMs(refDate), F=fatigueAt(at,refDate), out={};
  MGROUP.forEach(([g])=>{ const r=Math.max(0,Math.round(100-F[g]*8)); let h=0;
    if(r<90){ for(h=2;h<=120;h+=2){ const F2=fatigueAt(at+h*3600000,refDate); if(100-F2[g]*8>=90) break; } }
    out[g]={r,h}; });
  return out;
}
export function prevRecord(name, before){
  const dates=Object.keys(S.days).filter(d=>d<before).sort().reverse();
  for(const d of dates){
    const it=(S.days[d].workout?.items||[]).find(x=>x.name===name&&workSets(x).length);
    if(it) return {date:d,sets:workSets(it),all:doneSets(it),type:exType(it)};
  }
  return null;
}
// 점진적 과부하 제안
export function suggestNext(it, before){
  const pr=prevRecord(it.name,before); if(!pr) return null;
  const t=pr.type; const top=pr.sets.reduce((a,s)=>(+s.w||0)>(+a.w||0)?s:a,pr.sets[0]);
  const target=(it.sets&&it.sets[0]&&+it.sets[0].r)||+top.r||10;
  const allHit=pr.sets.every(s=>(+s.r||0)>=target);
  const rirs=pr.sets.map(s=>s.rir).filter(v=>v!==""&&v!=null).map(Number); const minR=rirs.length?Math.min(...rirs):null;
  if(t==="w"){
    const inc=(exInfo(it)?.part==="하체"||it.exId==="deadlift")?5:2.5;
    if(allHit&&minR!=null&&minR>=3) return {w:r1((+top.w||0)+inc*2),r:target,msg:`지난번 ${top.w}kg×${top.r}에 RIR ${minR} (여유 많음) → +${inc*2}kg`};
    if(allHit) return {w:r1((+top.w||0)+inc),r:target,msg:`지난번 ${top.w}kg×${top.r} 모두 성공${minR!=null?` (RIR ${minR})`:""} → +${inc}kg 도전`};
    return {w:+top.w||0,r:target,msg:`지난번 ${top.w}kg에서 목표 횟수 미달 → 같은 무게로 ${target}회 채우기`};
  }
  if(t==="b") return {w:0,r:allHit?target+1:target,msg:allHit?`지난번 ${top.r}회 성공 → ${target+1}회 도전`:`지난번 ${top.r}회 → ${target}회 채우기`};
  return null;
}
export function mkItem(e, sets, reps, w){
  return {id:uid(),exId:e?e.id:null,name:e?e.name:"",part:e?e.part:"기타",type:e?e.type:"w",rest:e?e.rest:90,sets:Array.from({length:sets},()=>({w:w??(e?e.def[2]:0),r:reps??(e?e.def[1]:10),done:false}))};
}
export function cloneItems(items){ return JSON.parse(JSON.stringify(items||[])).map(it=>({...it,id:uid(),sets:(it.sets||[]).map(s=>({w:s.w,r:s.r,done:false,rir:"",...(s.kind?{kind:s.kind}:{})}))})); }

/* 기본 추천 플랜 템플릿 */
export const SPLITS={
  2:{name:"전신 2분할",days:[0,3],sessions:[["전신 A",["squat","bench","bb_row","ohp","plank"]],["전신 B",["deadlift","incline_db","lat_pd","lunge","hanging_lr"]]]},
  3:{name:"전신 3회",days:[0,2,4],sessions:[["전신 A",["squat","bench","bb_row","lateral","plank"]],["전신 B",["deadlift","ohp","lat_pd","lunge","bb_curl"]],["전신 C",["leg_press","incline_db","seated_row","seated_curl","cable_oh"]]]},
  4:{name:"상하체 4분할",days:[0,1,3,4],sessions:[["상체 (근력)",["bench","bb_row","ohp","lat_pd","bb_curl","cable_oh"]],["하체 (근력)",["squat","rdl","leg_press","calf_raise","plank"]],["상체 (볼륨)",["incline_db","seated_row","lateral","db_fly","face_pull","hammer_curl"]],["하체 (볼륨)",["deadlift","bulgarian","leg_ext","seated_curl","hip_thrust","hanging_lr"]]]},
  5:{name:"부위별 5분할",days:[0,1,2,3,4],sessions:[["가슴",["bench","incline_db","db_fly","cable_cross","dips"]],["등",["deadlift","pullup","bb_row","lat_pd","seated_row"]],["하체",["squat","leg_press","rdl","seated_curl","calf_raise"]],["어깨",["ohp","lateral","rear_delt","face_pull","cable_crunch"]],["팔·코어",["bb_curl","oh_ext","preacher","triceps_pd","hanging_lr","plank"]]]},
  6:{name:"PPL ×2",days:[0,1,2,3,4,5],sessions:[["밀기 (가슴·어깨·삼두)",["bench","ohp","incline_db","lateral","cable_oh"]],["당기기 (등·이두)",["deadlift","pullup","bb_row","face_pull","bb_curl"]],["하체",["squat","rdl","leg_press","seated_curl","calf_raise"]],["밀기 B",["incline_db","dips","db_fly","lateral","triceps_pd"]],["당기기 B",["lat_pd","db_row","seated_row","rear_delt","hammer_curl"]],["하체 B",["hip_thrust","bulgarian","leg_ext","seated_curl","hanging_lr"]]]}
};
export const MACHINE_PREF={bench:"chest_press",incline_db:"incline_cp",squat:"hack_squat",bb_row:"row_m",ohp:"shoulder_press_m",pullup:"assist_pullup",dips:"assist_dip",lunge:"smith_lunge",bulgarian:"smith_lunge",bb_curl:"curl_m",oh_ext:"cable_oh",db_fly:"pec_deck",deadlift:"hip_thrust_m",rdl:"seated_curl",hip_thrust:"hip_thrust_m",lateral:"lateral_m",rear_delt:"rev_pec"};
export const BRAND_PREF=(()=>{const m={};["Plate-Loaded","Leverage","MTS","Select","Inspiration","Impact","Plate Loaded"].forEach(line=>EX.filter(e=>e.line===line).forEach(e=>{ if(!m[e.base]) m[e.base]=e.id; }));return m;})();
export const FREE_PREF={chest_press:"bench",leg_press:"front_squat",lat_pd:"pullup",seated_row:"bb_row",leg_ext:"goblet",cable_oh:"oh_ext",triceps_pd:"skull",pec_deck:"db_fly",calf_raise:"calf_raise",hip_thrust_m:"hip_thrust"};
export const NOGYM={bench:"pushup",seated_curl:"rdl",cable_oh:"oh_ext",preacher:"hammer_curl",lat_pd:"pullup",seated_row:"db_row",leg_press:"lunge",leg_ext:"lunge",leg_curl:"rdl",cable_cross:"db_fly",triceps_pd:"skull",face_pull:"rear_delt",cable_crunch:"hanging_lr",bb_row:"db_row",squat:"lunge",deadlift:"rdl",calf_raise:"lunge",ohp:"lateral",hip_thrust:"lunge",bb_curl:"hammer_curl",incline_walk:"bike"};
export function makeTemplate({days,goal,level,equip,focus=[],pref="mix"}){
  const sp=SPLITS[Math.min(6,Math.max(2,days))];
  // 반복·RIR (Schoenfeld 2017: 실패 근처면 무게 범위 무관 / Robinson 2024: 근비대는 RIR 0~2)
  const R=goal==="strength"?{main:5,acc:8,rirM:"2–3",rirA:"1–2"}:goal==="fit"?{main:12,acc:15,rirM:"2–3",rirA:"1–3"}:{main:8,acc:12,rirM:"1–2",rirA:"0–1"};
  const nSets=level==="beg"?3:level==="adv"?4:3;
  const plan=Array.from({length:7},()=>({title:"휴식",items:[]}));
  sp.sessions.forEach(([title,ids],i)=>{
    let list=ids.slice();
    if(level==="beg") list=list.slice(0,4);
    if(equip!=="gym") list=list.map(id=>NOGYM[id]||id);
    else if(pref==="machine") list=list.map(id=>MACHINE_PREF[id]||id);
    else if(pref==="free") list=list.map(id=>FREE_PREF[id]||id);
    else if(pref==="brand") list=list.map(id=>BRAND_PREF[MACHINE_PREF[id]||id]||BRAND_PREF[id]||MACHINE_PREF[id]||id);
    list=list.filter((v,j,a)=>a.indexOf(v)===j&&EXMAP[v]);
    focus.forEach(fp=>{ if(list.some(id=>EXMAP[id]?.part===fp)){ const extra=EX.find(e=>e.part===fp&&!list.includes(e.id)&&e.stretch&&(equip==="gym"||e.cat==="맨몸"||e.equip.includes("덤벨")))||EX.find(e=>e.part===fp&&!list.includes(e.id)&&(equip==="gym"||e.cat==="맨몸"||e.equip.includes("덤벨"))); if(extra) list.push(extra.id); } });
    const items=list.map((id,k)=>{ const e=EXMAP[id]; const main=e.compound&&k<2; const r=e.type==="t"?e.def[1]:(main?R.main:R.acc); const it=mkItem(e,e.type==="t"?e.def[0]:nSets+(main&&level!=="beg"?1:0),r,e.def[2]); it.rirT=main?R.rirM:R.rirA; return it; });
    if(goal==="cut"||goal==="fit") items.push(mkItem(EXMAP[equip==="gym"?"incline_walk":"bike"],1,20,0));
    plan[sp.days[i]]={title,items};
  });
  balancePlan(plan,level,goal,{equip,R});
  return {name:sp.name,days:plan};
}
/* 플랜 볼륨 분석 (fractional sets, 빈도, 세션 최대치) */
export function planStats(plan){
  const st={}; MGROUP.forEach(([g])=>st[g]={sets:0,freq:0,maxS:0});
  plan.forEach(p=>{ const day={}; (p.items||[]).forEach(it=>{ if(exType(it)==="t") return; const W=groupWeights(it); const n=(it.sets||[]).length; for(const g in W) day[g]=(day[g]||0)+W[g]*n; });
    for(const g in day){ st[g].sets+=day[g]; if(day[g]>=1) st[g].freq++; st[g].maxS=Math.max(st[g].maxS,day[g]); } });
  return st;
}
export const VOL_RANGE=lv=>lv==="beg"?[6,12]:[10,20];
export function balancePlan(plan,level,goal,ctx={}){
  if(goal==="strength") return;
  const [lo,hi]=VOL_RANGE(level); const major=["가슴","등","어깨","이두","삼두","대퇴사두","햄스트링","둔근"];
  const okEquip=e=>ctx.equip!=="home"||e.cat==="맨몸"||e.equip.includes("덤벨");
  for(let pass=0;pass<40;pass++){
    let changed=false;
    // 1) 세션당 상한 (~11 fractional sets)
    plan.forEach(p=>{ if(changed) return; const ds=planStats([p]); for(const g of major){ if(ds[g].sets>11){ const c=p.items.filter(it=>groupWeights(it)[g]===1&&it.sets.length>2).sort((a,b)=>b.sets.length-a.sets.length)[0]; if(c){ c.sets.pop(); changed=true; return; } } } });
    if(changed) continue;
    const st=planStats(plan);
    for(const g of major){
      if(st[g].sets<lo){
        const cands=[];plan.forEach((p,d)=>p.items.forEach(it=>{if(groupWeights(it)[g]===1&&it.sets.length<5&&planStats([p])[g].sets+1<=11)cands.push(it);}));
        cands.sort((a,b)=>a.sets.length-b.sets.length);
        if(cands.length){ const it=cands[0],l=it.sets[it.sets.length-1]; it.sets.push({w:l.w,r:l.r,done:false}); changed=true; break; }
        // 해당 부위 주동 운동이 없으면 고립운동 추가 (스트레치 강조 우선)
        const ks=MGROUP.find(x=>x[0]===g)[1];
        const days=plan.map((p,d)=>({p,d,n:planStats([p])[g].sets,len:p.items.length})).filter(x=>x.len&&x.n+3<=11).sort((a,b)=>a.n-b.n||a.len-b.len);
        if(days.length){ const tgt=days[0].p; const have=new Set(tgt.items.map(x=>x.exId));
          const pool=EX.filter(e=>e.type==="w"&&!e.compound&&okEquip(e)&&!have.has(e.id)&&e.prim.some(k=>ks.includes(k)));
          const e=pool.find(x=>x.stretch)||pool[0];
          if(e){ const it=mkItem(e,3,(ctx.R&&ctx.R.acc)||12,e.def[2]); it.rirT=(ctx.R&&ctx.R.rirA)||"0–1"; const cardio=tgt.items.findIndex(x=>exType(x)==="t"); if(cardio>=0) tgt.items.splice(cardio,0,it); else tgt.items.push(it); changed=true; break; } }
      } else if(st[g].sets>hi){
        const cands=[];plan.forEach(p=>p.items.forEach(it=>{if(groupWeights(it)[g]===1&&it.sets.length>(exInfo(it)?.compound?3:2))cands.push(it);}));
        if(cands.length){ cands.sort((a,b)=>(!!exInfo(a)?.compound-!!exInfo(b)?.compound)||b.sets.length-a.sets.length); cands[0].sets.pop(); changed=true; break; }
      }
    }
    if(!changed) break;
  }
}
/* 주간 플랜 피드백: 근거 규칙 기반 좋은 점·아쉬운 점 */
export function planFeedback(plan,level){
  const st=planStats(plan), [lo,hi]=VOL_RANGE(level||"mid"), good=[], bad=[];
  const major=["가슴","등","어깨","이두","삼두","대퇴사두","햄스트링","둔근"];
  const days=plan.map((p,i)=>({i,items:p.items||[]})).filter(d=>d.items.length);
  if(!days.length) return {good,bad:[{t:"플랜이 비어 있어요. 추천 플랜을 받거나 요일별로 운동을 추가하세요.",ev:""}]};
  const all=days.flatMap(d=>d.items); const has=f=>all.some(it=>{const e=exInfo(it);return e&&f(e);});
  // 1) 볼륨
  const ok=major.filter(g=>st[g].sets>=lo&&st[g].sets<=hi), under=major.filter(g=>st[g].sets<lo), over=major.filter(g=>st[g].sets>hi);
  if(ok.length) good.push({t:`${ok.join("·")}의 주간 볼륨이 권장 범위(${lo}~${hi}세트)에 있어요.`,ev:"Pelland 2025"});
  under.forEach(g=>bad.push({t:`${g} ${r1(st[g].sets)}세트로 부족해요. 주동 운동을 ${Math.ceil(lo-st[g].sets)}세트 이상 늘리면 성장 여지가 커요.`,ev:"Pelland 2025"}));
  over.forEach(g=>bad.push({t:`${g} ${r1(st[g].sets)}세트는 많은 편이에요. 세트를 더해도 효율이 점점 줄어서, 회복 여유가 없으면 줄이는 걸 권해요.`,ev:"Pelland 2025"}));
  // 2) 빈도·세션 상한
  const f2=major.filter(g=>st[g].sets>=lo&&st[g].freq>=2), f1=major.filter(g=>st[g].sets>=4&&st[g].freq===1);
  if(f2.length>=5) good.push({t:"주요 부위 대부분을 주 2회 이상 나눠서 훈련해요. 한 세션에 볼륨이 몰리지 않아 좋아요.",ev:"Pelland 2025"});
  if(f1.length) bad.push({t:`${f1.join("·")}는 주 1회만 훈련해요. 같은 세트를 2회로 나누면 세션 질과 회복에 유리해요.`,ev:"Pelland 2025"});
  const cap=major.filter(g=>st[g].maxS>11); if(cap.length) bad.push({t:`${cap.map(g=>`${g}(한 세션 ${r1(st[g].maxS)}세트)`).join(", ")}: 세션당 약 11세트를 넘으면 추가 세트의 효과가 크게 줄어드는 경향이 있어요.`,ev:"Pelland 2024 프리프린트"});
  // 3) 늘어난 위치 운동
  const hamS=has(e=>e.prim.includes("ham")&&e.stretch), triOH=has(e=>e.id==="oh_ext"||e.id==="cable_oh");
  if(hamS) good.push({t:"햄스트링을 늘어난 위치에서 훈련하는 운동(앉은 레그컬·RDL 등)이 있어요.",ev:"Maeo 2021"});
  else if(st["햄스트링"].sets>0||st["대퇴사두"].sets>0) bad.push({t:"햄스트링 운동이 엎드린 레그컬 위주예요. 앉은 레그컬이나 RDL로 바꾸면 성장이 더 컸다는 연구가 있어요(+14% vs +9%).",ev:"Maeo 2021"});
  if(triOH) good.push({t:"삼두에 오버헤드 익스텐션이 들어가 있어 장두를 늘어난 위치에서 자극해요.",ev:"Maeo 2023"});
  else if(st["삼두"].sets>0) bad.push({t:"삼두 운동에 오버헤드 익스텐션이 없어요. 푸시다운만 할 때보다 삼두 성장이 컸어요(+19.9% vs +13.9%).",ev:"Maeo 2023"});
  // 4) 밀기·당기기 / 대퇴사두·햄스트링 / 후면 삼각근
  const push=st["가슴"].sets, pull=st["등"].sets;
  if(push>0&&pull>=push*.9) good.push({t:`당기기(등 ${r1(pull)}세트)가 밀기(가슴 ${r1(push)}세트) 이상이라 어깨 균형이 좋아요.`,ev:"일반 권장"});
  else if(push>0) bad.push({t:`등(${r1(pull)}세트)이 가슴(${r1(push)}세트)보다 적어요. 로우·풀다운을 더해 밀기:당기기 균형을 맞추세요.`,ev:"일반 권장"});
  const q=st["대퇴사두"].sets,h=st["햄스트링"].sets;
  if(q>0&&h<q*.6) bad.push({t:`햄스트링(${r1(h)})이 대퇴사두(${r1(q)})에 비해 적어요. 힙힌지나 레그컬을 추가하세요.`,ev:"일반 권장"});
  if(!has(e=>e.prim.includes("rdelt"))&&!has(e=>e.sec.includes("rdelt")&&e.prim.includes("rhom"))) bad.push({t:"후면 삼각근을 주로 쓰는 운동(페이스풀·리어델트 플라이)이 없어요. 어깨 건강과 균형을 위해 주 1~2회 넣어 보세요.",ev:"일반 권장"});
  // 5) 연속일 회복
  const consec=[];for(let i=0;i<7;i++){const a=planStats([plan[i]]),b=planStats([plan[(i+1)%7]]);major.forEach(g=>{if(a[g].sets>=6&&b[g].sets>=6)consec.push(`${WD[i]}·${WD[(i+1)%7]} ${g}`);});}
  if(consec.length) bad.push({t:`${consec.slice(0,3).join(", ")}: 같은 부위를 이틀 연속 6세트 이상 해요. 실패 근처 훈련 뒤에는 최소 48시간 회복을 권해요.`,ev:"Goulart 2021, Morán-Navarro 2017"});
  else good.push({t:"같은 부위를 이틀 연속 무겁게 훈련하지 않아서, 부위별 회복 간격(48시간 이상)이 확보돼요.",ev:"Goulart 2021"});
  // 6) 세션 길이·휴식일
  const mins=days.map(d=>Math.round(d.items.reduce((a,it)=>a+(exType(it)==="t"?(+it.sets[0]?.r||0)*60:(it.sets||[]).length*((it.rest||exInfo(it)?.rest||90)+40)),0)/60));
  const mx=Math.max(...mins); if(mx>95) bad.push({t:`가장 긴 날이 약 ${mx}분이에요(휴식 포함 추정). 길어지면 후반 세트 질이 떨어지기 쉬워서, 운동을 다른 요일로 옮기는 걸 권해요.`,ev:"추정"});
  else good.push({t:`세션 길이가 약 ${Math.min(...mins)}~${mx}분으로 무리 없는 수준이에요(휴식 포함 추정).`,ev:"추정"});
  if(days.length>=7) bad.push({t:"휴식일이 없어요. 주 1일 이상 쉬는 날을 두세요.",ev:"일반 권장"});
  // 7) RIR·기구
  if(all.some(it=>it.rirT)) good.push({t:"운동마다 목표 RIR이 정해져 있어 실패 근접도를 관리하기 쉬워요.",ev:"Robinson 2024"});
  else bad.push({t:"목표 RIR이 없어요. 근비대 목표라면 고립운동 RIR 0~1, 다관절 1~2를 권해요.",ev:"Robinson 2024"});
  const mc=all.filter(it=>exInfo(it)?.cat==="머신").length, fw=all.filter(it=>exInfo(it)?.cat==="프리웨이트").length;
  good.push({t:`머신 ${mc}개 · 프리웨이트 ${fw}개 구성이에요. 근비대에는 두 방식 차이가 없어서 이 비율 그대로도 괜찮아요.`,ev:"Haugen 2023"});
  return {good,bad};
}
export function feedbackHtml(plan,level){
  const {good,bad}=planFeedback(plan,level);
  const li=(x,ok)=>`<li style="margin:6px 0;list-style:none;display:grid;grid-template-columns:20px 1fr;gap:6px"><span style="color:${ok?"var(--good)":"var(--warn)"};font-weight:800">${ok?"✓":"!"}</span><span>${esc(x.t)}${x.ev?` <span class="xs muted">· ${esc(x.ev)}</span>`:""}</span></li>`;
  return `<div style="display:grid;gap:12px"><div><div class="small" style="font-weight:700;color:var(--good)">좋은 점 ${good.length}</div><ul style="padding:0;margin:4px 0" class="small">${good.map(x=>li(x,1)).join("")}</ul></div><div><div class="small" style="font-weight:700;color:var(--warn)">아쉬운 점 ${bad.length}</div><ul style="padding:0;margin:4px 0" class="small">${bad.length?bad.map(x=>li(x,0)).join(""):`<li class="muted" style="list-style:none">특별히 고칠 점이 없어요.</li>`}</ul></div></div>`;
}
export function planCheckHtml(plan,level){
  const st=planStats(plan); const [lo,hi]=VOL_RANGE(level||"mid");
  let h=`<div style="display:grid;gap:4px">`;
  MGROUP.forEach(([g])=>{ const x=st[g]; const v=r1(x.sets);
    const minor=g==="종아리"||g==="복근";
    const tag=x.sets<lo?(minor?["보통","var(--muted)"]:["부족","var(--warn)"]):x.sets>hi?["많음","var(--accent)"]:["적정","var(--good)"];
    const warn=[]; if(x.maxS>11) warn.push(`한 세션 ${r1(x.maxS)}세트 → 나누기 권장`); if(x.sets>=lo&&x.freq<2&&!minor) warn.push("주 1회 → 2회로 나누면 좋아요");
    h+=`<div class="ms" style="grid-template-columns:72px 1fr auto"><span>${g}</span><span class="small"><b class="num">${v}</b>세트 · 주 ${x.freq}회${warn.length?` <span class="xs" style="color:var(--warn)">· ${warn.join(" · ")}</span>`:""}</span><span class="chip" style="color:${tag[1]}">${tag[0]}</span></div>`; });
  return h+`</div><p class="xs muted" style="margin:6px 0 0">기준: 부위당 주 ${lo}~${hi}세트(주동 1·보조 0.5), 세션당 약 11세트 이하, 주 2회 이상 · 근거: Pelland 2025</p>`;
}
