// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { S } from "./state";
import { r0 } from "./util";

/* 목표 계산 (Mifflin-St Jeor)
   ============================================================ */
export const GOALS={cut:"감량",keep:"유지",bulk:"벌크업(증량)"};
export const ACTS=[[1.2,"거의 안 움직임"],[1.375,"주 1~3회 운동"],[1.55,"주 3~5회 운동"],[1.725,"주 6~7회 운동"],[1.9,"육체노동 + 운동"]];
export function calcTargets(){
  const p=S.main.profile;
  const bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="m"?5:-161);
  const tdee=bmr*p.activity;
  const kcal=p.goal==="cut"?tdee-450:p.goal==="bulk"?tdee+300:tdee;
  const protein=p.weight*(p.goal==="keep"?1.6:p.goal==="cut"?2.2:1.8); // Morton 2018
  const fat=kcal*0.25/9;
  const carb=Math.max(0,(kcal-protein*4-fat*9)/4);
  const auto={kcal:r0(kcal),carb:r0(carb),protein:r0(protein),fat:r0(fat),bmr:r0(bmr),tdee:r0(tdee)};
  const o=S.main.override;
  return o?{...auto,...o,bmr:auto.bmr,tdee:auto.tdee,manual:true}:auto;
}
export function sumMeals(meals){
  const t={kcal:0,carb:0,protein:0,fat:0,sugar:0,sodium:0};
  meals.forEach(m=>{for(const k in t) t[k]+=(m[k]||0)*(m.qty||1)});
  return t;
}
