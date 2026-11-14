// 바벨-몸 관통 검사
import { EX } from "../../src/data/exercises.js";
import { FIG } from "../../src/engine/fig.js";
import { pathToFileURL } from "node:url";

globalThis.window ??= { matchMedia: () => ({ matches: false }) };
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => "#888" });

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(...a),norm=a=>mul(a,1/(len(a)||1));
function segDist(p1,q1,p2,q2){ // closest distance between segments, sampled
  let best=1e9,arg=null; for(let i=0;i<=40;i++){const a=add(p1,mul(sub(q1,p1),i/40)); const d=sub(q2,p2),t=Math.max(0,Math.min(1,dot(sub(a,p2),d)/(dot(d,d)||1))); const b=add(p2,mul(d,t)); const L=len(sub(a,b)); if(L<best){best=L;arg=i/40;}} return [best,arg]; }
/** 바벨이 몸을 뚫는 운동 목록을 돌려준다 */
export function barcheck(only=null){ const out=[];
for(const ex of EX){ if(ex.brand) continue; if(only&&!only.includes(ex.id)) continue;
  const eq=ex.equip||''; if(!/바벨|EZ|스미스/.test(eq)&&!(ex.anim&&/bar|smith|ez/.test(ex.anim.tool||''))) continue;
  const rig=FIG.makeRig(ex.anim,ex); const issues=[];
  for(let i=0;i<=20;i++){ const s=i/20; const J=rig.at(s); const L=J.haL,R=J.haR,u=norm(sub(R,L));
    // 바: 양손 사이 (손 근처 6cm 제외) + 손 밖 30cm
    const a=add(L,mul(u,.06)), b=sub(R,mul(u,.06)), aO=sub(L,mul(u,.35)), bO=add(R,mul(u,.35));
    const body=[['몸통',J.pelvis,J.chest,.15],['가슴-목',J.chest,J.neck,.12],['머리',J.head,J.head,.10],['허벅지L',J.hipL,J.knL,.075],['허벅지R',J.hipR,J.knR,.075],['정강이L',J.knL,J.anL,.05],['정강이R',J.knR,J.anR,.05],['상완L',J.shL,J.elL,.045],['상완R',J.shR,J.elR,.045]];
    for(const [nm,p,q,r] of body){ for(const [x,y,tag] of [[a,b,'안'],[aO,sub(L,mul(u,.08)),'밖L'],[add(R,mul(u,.08)),bO,'밖R']]){
      const [d]=segDist(x,y,p,q); const pen=r+.014-d; if(pen>.015) issues.push({s,nm,tag,pen:+pen.toFixed(3)}); } }
  }
  if(issues.length){ const worst={}; for(const it of issues){const k=it.nm+'/'+it.tag; if(!worst[k]||worst[k].pen<it.pen) worst[k]=it;}
    out.push({id:ex.id,detail:Object.values(worst).map(w=>`${w.nm}(${w.tag}) ${Math.round(w.pen*100)}cm @s=${w.s}`).join(', ')}); }
}
return out;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  const out=barcheck(process.argv[2]?process.argv[2].split(','):null);
  out.forEach(o=>console.log(o.id,o.detail));console.log('관통 운동 수:',out.length);
}
