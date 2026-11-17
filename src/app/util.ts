// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { S, ui } from "./state";

/* 유틸
   ============================================================ */
export function pad(n){return String(n).padStart(2,"0")}
export function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
export function parseD(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
export function addDays(s,n){const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d)}
export function wIdx(s){return (parseD(s).getDay()+6)%7}
export function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
export function r1(n){return Math.round((+n||0)*10)/10}
export function r0(n){return Math.round(+n||0)}
export function uid(){return Math.random().toString(36).slice(2,9)}
export function day(d=ui.date){ if(!S.days[d]) S.days[d]={meals:[],workout:{items:[]}}; const v=S.days[d]; v.meals=v.meals||[]; v.workout=v.workout||{items:[]}; v.workout.items=v.workout.items||[]; return v; }
export function peekDay(d){ return S.days[d]||{meals:[],workout:{items:[]}}; }
export function toast(t,action){ // action: {label, act} — 토스트 안에 버튼(예: 되돌리기)
  const el=document.getElementById("toast"); el.textContent=t;
  if(action){ const b=document.createElement("button"); b.className="tact"; b.dataset.act=action.act; b.textContent=action.label; el.appendChild(b); }
  el.classList.add("on"); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove("on"),action?5000:2200); }
export function md(t){return esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>")}
