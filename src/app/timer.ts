// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { pad } from "./util";

/* 휴식 타이머
   ============================================================ */
export const timer={end:0,iv:null};
export function startTimer(sec=90){ timer.end=Date.now()+sec*1000; document.getElementById("timer").classList.add("on"); clearInterval(timer.iv); timer.iv=setInterval(tick,250); tick(); }
export function tick(){ const left=Math.max(0,Math.round((timer.end-Date.now())/1000)); document.getElementById("timerT").textContent=Math.floor(left/60)+":"+pad(left%60); if(left<=0){ clearInterval(timer.iv); document.getElementById("timerT").textContent="GO!"; setTimeout(()=>document.getElementById("timer").classList.remove("on"),2500);} }
