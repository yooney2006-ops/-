import { FIGGL } from "./figgl.js";
import { BODY } from "./body.js";
/* ============================================================
   FIG: 캔버스 3D 마네킹 렌더러 (외부 라이브러리 없음)
   좌표: y 위, z 정면(몸이 바라보는 쪽), x = 몸의 왼쪽
   팔·다리 방향 = [e, h] : e = 아래로 늘어뜨린 상태에서 들어올린 각도,
                           h = 0 옆, 90 앞, -90 뒤 (좌우 대칭 자동)
   세 번째 원소 'w' = 월드 기준, 없으면 몸통(팔)/골반(다리) 기준
   ============================================================ */
const FIG=(()=>{
const R=Math.PI/180;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const lerp=(a,b,s)=>a+(b-a)*s, lerpV=(a,b,s)=>[lerp(a[0],b[0],s),lerp(a[1],b[1],s),lerp(a[2],b[2],s)];
const mid=(a,b)=>lerpV(a,b,.5);
function rx(a){a*=R;const c=Math.cos(a),s=Math.sin(a);return [[1,0,0],[0,c,-s],[0,s,c]]}
function ry(a){a*=R;const c=Math.cos(a),s=Math.sin(a);return [[c,0,s],[0,1,0],[-s,0,c]]}
function mm(A,B){const o=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++)o[i][j]=A[i][0]*B[0][j]+A[i][1]*B[1][j]+A[i][2]*B[2][j];return o}
function mv(M,v){return [M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]]}
function mtv(M,v){return [M[0][0]*v[0]+M[1][0]*v[1]+M[2][0]*v[2],M[0][1]*v[0]+M[1][1]*v[1]+M[2][1]*v[2],M[0][2]*v[0]+M[1][2]*v[1]+M[2][2]*v[2]]}
function sph(e,h,side){e*=R;h*=R;return [side*Math.sin(e)*Math.cos(h),-Math.cos(e),Math.sin(e)*Math.sin(h)]}

const L={ua:.3,fa:.27,th:.43,sh:.42,hipX:.095,shX:.185,shY:.45};
const DEF={ua:[8,0],fa:[6,10],th:[0,0],sh:[0,0],ft:[68,90,'w']};

/* 키프레임 하나를 '부모 기준 로컬 벡터'로 정리 */
function frames(p){
  const R0=rx(p.rp||0); const Rt=mm(mm(R0,rx(p.t||0)),ry(p.tw||0));
  return {R0,Rt};
}
function specLocal(spec,side,Rparent){
  if(!spec) return null;
  if(spec.v) return mtv(Rparent,[spec.v[0],spec.v[1],spec.v[2]]);
  const d=sph(spec[0],spec[1],side);
  return spec[2]==='w'?mtv(Rparent,d):d;
}
function limb(p,sideKey,name){
  const s=p[sideKey]&&p[sideKey][name]; if(s) return s;
  const g=(name==='ua'||name==='fa')?p.arms:p.legs; if(g&&g[name]) return g[name];
  return DEF[name];
}
function resolve(p){
  const {R0,Rt}=frames(p); const out={};
  for(const [k,side] of [['L',1],['R',-1]]){
    out[k]={ua:specLocal(limb(p,k,'ua'),side,Rt),fa:specLocal(limb(p,k,'fa'),side,Rt),th:specLocal(limb(p,k,'th'),side,R0),sh:specLocal(limb(p,k,'sh'),side,R0),ft:specLocal(limb(p,k,'ft'),side,R0)};
  }
  return out;
}
const SC=['rp','t','tw','scap'];
function blend(pA,pB,lA,lB,s){
  const p={};SC.forEach(k=>p[k]=lerp(pA[k]||0,pB[k]||0,s));
  if(pA.pos||pB.pos) p.pos=lerpV(pA.pos||[0,0,0],pB.pos||pA.pos||[0,0,0],s);
  const loc={};
  for(const k of ['L','R']){loc[k]={};for(const n of ['ua','fa','th','sh','ft']) loc[k][n]=norm(lerpV(lA[k][n],lB[k][n],s));}
  return {p,loc};
}
/* 순운동학 */
function skeleton(p,loc){
  const {R0,Rt}=frames(p); const J={R0,Rt};
  J.pelvis=[0,0,0];
  J.chest=mv(Rt,[0,.36,0]); J.spine=mv(Rt,[0,.18,0]); J.neck=mv(Rt,[0,.5,0]); J.head=mv(Rt,[0,.62,.015]);
  for(const [k,side] of [['L',1],['R',-1]]){
    const sh=mv(Rt,[side*L.shX,L.shY+(p.scap||0),0]);
    const el=add(sh,mul(mv(Rt,loc[k].ua),L.ua));
    const ha=add(el,mul(mv(Rt,loc[k].fa),L.fa));
    const hip=mv(R0,[side*L.hipX,-.07,0]);
    const kn=add(hip,mul(mv(R0,loc[k].th),L.th));
    const an=add(kn,mul(mv(R0,loc[k].sh),L.sh));
    const fd=mv(R0,loc[k].ft);
    const toe=add(an,mul(fd,.17)), heel=add(add(an,mul(fd,-.05)),[0,-.035,0]);
    J['sh'+k]=sh;J['el'+k]=el;J['ha'+k]=ha;J['hip'+k]=hip;J['kn'+k]=kn;J['an'+k]=an;J['toe'+k]=toe;J['heel'+k]=heel;J['fd'+k]=fd;
  }
  return J;
}
function translateJ(J,d){for(const k in J){const v=J[k]; if(Array.isArray(v)&&v.length===3&&typeof v[0]==='number') J[k]=add(v,d);} }
function anchorPoint(J,type){
  switch(type){
    case 'feet': return mid(J.anL,J.anR);
    case 'toes': return mid(J.toeL,J.toeR);
    case 'hands': return mid(J.haL,J.haR);
    case 'handL': return J.haL; case 'handR': return J.haR;
    case 'shoulders': return mid(J.shL,J.shR);
    case 'knees': return mid(J.knL,J.knR);
    case 'elbows': return mid(J.elL,J.elR);
    case 'ankleL': return J.anL;
    default: return J.pelvis;
  }
}
function lowest(J){return Math.min(J.toeL[1],J.toeR[1],J.heelL[1],J.heelR[1])}
function place(J,an,p){
  if(an.type==='floor'){ translateJ(J,[ (an.at?an.at[0]:0)-J.pelvis[0], .035-lowest(J), (an.at?an.at[2]:0)-J.pelvis[2]]); return; }
  if(an.type==='free'){ translateJ(J,p.pos||[0,1,0]); return; }
  const a=anchorPoint(J,an.type); translateJ(J,sub(p.pos&&an.type==='pelvis'?p.pos:an.at,a));
}

/* 패턴 인스턴스: 포즈 계산기 */
/* ---------- 물리 보정 (발 고정·균형·바닥 접지) ---------- */
const MIDFOOT=.056; // 발목에서 발 중앙(뒤꿈치~발끝의 가운데)까지 앞쪽 거리
const ANK=.085, STANDA=new Set(['feet','toes','ankleL','floor']);
function rotX(v,pv,th){const c=Math.cos(th),sn=Math.sin(th);const y=v[1]-pv[1],z=v[2]-pv[2];return [v[0],pv[1]+y*c-z*sn,pv[2]+y*sn+z*c];}
function rotJ(J,pv,th){ const RX=rx(th/R);
  for(const k in J){const v=J[k]; if(Array.isArray(v)&&v.length===3&&typeof v[0]==='number'){ if(/^(heel|toe)/.test(k)) continue; if(/^fd/.test(k)){J[k]=mv(RX,v);continue;} J[k]=rotX(v,pv,th);} }
  J.R0=mm(RX,J.R0); J.Rt=mm(RX,J.Rt); }
function com(J,load){
  const seg=[[mid(J.pelvis,J.neck),.497],[J.head,.081]];
  for(const k of ['L','R']) seg.push([mid(J['sh'+k],J['el'+k]),.028],[mid(J['el'+k],J['ha'+k]),.022],[mid(J['hip'+k],J['kn'+k]),.1],[mid(J['kn'+k],J['an'+k]),.0465]);
  if(load) seg.push([mid(J.haL,J.haR),load]);
  let m=0,c=[0,0,0]; seg.forEach(([q,w])=>{m+=w;c=add(c,mul(q,w));}); return mul(c,1/m);
}
function legIK(J,k,tgt){ const side=k==='L'?1:-1; const hip=J['hip'+k];
  const fR=[J.R0[0][2],J.R0[1][2],J.R0[2][2]]; let bend=norm(add(fR,[side*.15,.2,0]));
  { const ax=norm(sub(tgt,hip)), kb=sub(J['kn'+k],hip), kp=sub(kb,mul(ax,dot(kb,ax))); if(len(kp)>.06) bend=norm(add(mul(norm(kp),2),bend)); }
  const r=ik2(hip,tgt,L.th,L.sh,bend); J['kn'+k]=add(hip,mul(r.d1,L.th)); J['an'+k]=add(J['kn'+k],mul(r.d2,L.sh)); }
function footFix(J,k,flatOK){ // 발: 발목이 낮으면 바닥에 평평, 높으면 발끝이 바닥에
  const an=J['an'+k]; const fR=[J.R0[0][2],0,J.R0[2][2]]; let hf=norm(fR); if(len(fR)<.2) hf=[0,0,1];
  const fl=.17; let fd;
  if(an[1]<=ANK+.02&&flatOK){ fd=norm(add(mul(hf,.93),[0,-.36,0])); }
  else { const drop=Math.max(0,Math.min(fl,an[1]-.02)); const sn=drop/fl; fd=norm(add(mul(hf,Math.sqrt(Math.max(0,1-sn*sn))),[0,-sn,0])); }
  J['fd'+k]=fd; J['toe'+k]=add(an,mul(fd,fl)); J['heel'+k]=add(add(an,mul(fd,-.05)),[0,-.035,0]);
  if(J['heel'+k][1]<0){ const d=-J['heel'+k][1]; J['heel'+k][1]+=d; }
}
function barClear(J){ // 바벨이 몸(몸통·머리·다리)을 뚫지 않게 손을 몸 밖으로 밀고 팔 재계산
  const caps=[[J.pelvis,J.chest,.15],[J.chest,J.neck,.115],[J.head,J.head,.105],[J.hipL,J.knL,.085],[J.hipR,J.knR,.085],[J.knL,J.anL,.058],[J.knR,J.anR,.058]];
  const fR=[J.R0[0][2],J.R0[1][2],J.R0[2][2]];
  const cp=(x,p,q)=>{const d=sub(q,p),dd=dot(d,d); const t=dd?Math.max(0,Math.min(1,dot(sub(x,p),d)/dd)):0; return add(p,mul(d,t));};
  for(let it=0;it<8;it++){
    const u=norm(sub(J.haR,J.haL)), w=len(sub(J.haR,J.haL)); let best=null;
    for(let i=0;i<=24;i++){ const f=-.32+(w+.64)*i/24; const inner=f>.06&&f<w-.06; if(!inner&&!(f<-.08||f>w+.08)) continue;
      const x=add(J.haL,mul(u,f));
      caps.forEach(([p,q,r],ci)=>{ if(!inner&&ci<3) return; const c=cp(x,p,q); let n=sub(x,c); n=sub(n,mul(u,dot(n,u))); const d=len(n); const pen=r+.018-d;
        if(pen>.004&&(!best||pen>best.pen)) best={pen,n:d>.01?mul(n,1/d):norm(sub(fR,mul(u,dot(fR,u))))}; }); }
    if(!best) break;
    const v=mul(best.n,best.pen+.004);
    for(const k of ['L','R']){ const sh=J['sh'+k], t=add(J['ha'+k],v); const el=J['el'+k];
      const ax=norm(sub(t,sh)); let bend=sub(sub(el,sh),mul(ax,dot(sub(el,sh),ax))); bend=len(bend)>.02?norm(bend):norm(sub([0,-1,0],mul(ax,-ax[1])));
      const r=ik2(sh,t,L.ua,L.fa,bend); J['el'+k]=add(sh,mul(r.d1,L.ua)); J['ha'+k]=add(J['el'+k],mul(r.d2,L.fa)); }
  }
}
function makeRig(anim,ex){
  const P=PAT[anim.p](anim.o||{});
  let lA,lB; if(!P.at){lA=resolve(P.A);lB=resolve(P.B);}
  const standing=STANDA.has(P.anchor.type)&&!P.noPhys;
  const eq=(ex&&ex.equip)||'';
  const barEq=/바벨|EZ|스미스/.test(eq);
  const load=P.load!=null?P.load:/바벨|EZ바/.test(eq)?.55:/덤벨|케틀벨/.test(eq)?.22:0;
  const balance=standing&&ex&&(ex.cat==='프리웨이트'||ex.cat==='맨몸')&&!P.at&&P.balance!==false;
  // 바가 발 중앙 위를 지나야 하는 종목: 서서 하는 프리 바벨 운동 (패턴이 barMid:false로 끌 수 있음)
  const barMid=balance&&/바벨/.test(eq)&&P.barMid!==false&&['squat','hinge','ohp','row'].includes(anim.p);
  let plantT=null;
  function base(s){
    let p,loc;
    if(P.at){p=P.at(s);loc=resolve(p);} else {const b=blend(P.A,P.B,lA,lB,s);p=b.p;loc=b.loc;}
    if(P.ik) P.ik(p,loc,s);
    let J=skeleton(p,loc); place(J,P.anchor,p);
    if(P.solveRp){
      let lo=p.rp-30,hi=Math.min(95,p.rp+30);
      for(let i=0;i<22;i++){const m=(lo+hi)/2;const q={...p,rp:m};const Jq=skeleton(q,loc);place(Jq,P.anchor,q);if(Math.min(Jq.toeL[1],Jq.toeR[1])>.03)hi=m;else lo=m;}
      p={...p,rp:(lo+hi)/2}; J=skeleton(p,loc); place(J,P.anchor,p);
    }
    J.p=p; return J;
  }
  const tgtOf=(J,k)=>{ if(!(P.free||[]).includes(k)) return plantT[k]; const a=J['an'+k]; return [a[0],Math.max(ANK,a[1]),a[2]]; };
  function reachFix(J){ let d=0; for(const k of ['L','R']){ const h=J['hip'+k],t=plantT[k]; if((P.free||[]).includes(k)) continue; const dx=Math.hypot(h[0]-t[0],h[2]-t[2]),mx=(L.th+L.sh)*.995; if(dx<mx){ const need=t[1]+Math.sqrt(mx*mx-dx*dx); if(h[1]>need) d=Math.max(d,h[1]-need);} }
    if(d>0){ for(const kk in J){const v=J[kk]; if(Array.isArray(v)&&v.length===3&&typeof v[0]==='number'&&!/^(heel|toe|fd)/.test(kk)) J[kk]=[v[0],v[1]-d,v[2]];} } }
  function at(s){
    const J=base(s);
    if(P.at||P.noPhys||P.solveRp) return J;
    if(standing){
      if(!plantT){ const J0=base(0); const ky=P.keepY||[]; plantT={L:[J0.anL[0],ky.includes('L')?Math.max(ANK,J0.anL[1]):ANK,J0.anL[2]],R:[J0.anR[0],ky.includes('R')?Math.max(ANK,J0.anR[1]):ANK,J0.anR[2]]}; if(P.plantFix) P.plantFix(plantT); }
      // 다리 길이로 닿을 수 있게 골반 높이 보정 (넓은 스탠스 등)
      reachFix(J);
      for(let pass=0;pass<2;pass++){
        ['L','R'].forEach(k=>legIK(J,k,tgtOf(J,k)));
        if(barMid){ // 프리 바벨 스탠딩: 바가 발 중앙(mid-foot) 수직선 위에 오도록 골반(상체 전체)을 앞뒤로 옮기고 다리는 IK로 다시 푼다
          const tz=(plantT.L[2]+plantT.R[2])/2+MIDFOOT, dz=tz-(J.haL[2]+J.haR[2])/2;
          for(const kk in J){const v=J[kk]; if(Array.isArray(v)&&v.length===3&&typeof v[0]==='number'&&!/^(heel|toe|fd|an)/.test(kk)) J[kk]=[v[0],v[1],v[2]+dz];}
          reachFix(J);
        } else if(balance){ // 무게중심을 지지면(발) 중앙 위로: 발목 기준 회전
          const fc=k=>plantT[k][2]+.055, wL=typeof P.supportW==='function'?P.supportW(s):P.supportW?P.supportW[0]:.5, tz=fc('L')*wL+fc('R')*(1-wL);
          const pv=mid(plantT.L,plantT.R);
          let lo=-.5,hi=.5; for(let i=0;i<24;i++){const m=(lo+hi)/2; const Jc={...J}; rotJ(Jc,pv,m); const c=com(Jc,load); if(c[2]>tz) hi=m; else lo=m;}
          rotJ(J,pv,(lo+hi)/2);
        }
      }
      ['L','R'].forEach(k=>{ const fr=(P.free||[]).includes(k); const t=tgtOf(J,k); legIK(J,k,t); if(!fr||t[1]<=ANK+.02) footFix(J,k,t[1]<=ANK+.02); });
    } else {
      // 누운·앉은 자세: 발목이 바닥보다 낮으면 바닥에 딛게
      ['L','R'].forEach(k=>{ const an=J['an'+k]; const below=Math.min(J['toe'+k][1],J['heel'+k][1],an[1]-ANK);
        if(below<-.005||P.feetFloor){ const t0=P.feetFloor?P.feetFloor(J,k):[an[0],ANK,an[2]+.04]; legIK(J,k,t0); footFix(J,k,true); }
        else if(J['toe'+k][1]<0||J['heel'+k][1]<0){ footFix(J,k,false); } });
    }
    if(barMid&&standing){
      // 바는 발 중앙 수직선에 두고, 그 조건을 만족하는 골반 앞뒤 위치를 이분법으로 찾는다.
      // 후보 위치마다 다리를 IK로 다시 풀고 바-몸 간섭(barClear)까지 적용한 뒤 바의 위치를 본다
      // → 바가 정강이·허벅지를 스치듯 지나가는 위치에 몸이 놓인다.
      const tz=(plantT.L[2]+plantT.R[2])/2+MIDFOOT;
      const J0={}; for(const kk in J){const v=J[kk]; J0[kk]=Array.isArray(v)&&typeof v[0]==='number'?v.slice():v;}
      const barZ=Q=>(Q.haL[2]+Q.haR[2])/2;
      const tryAt=(x,h)=>{ const Q={}; for(const kk in J0){const v=J0[kk]; Q[kk]=Array.isArray(v)&&v.length===3&&typeof v[0]==='number'?(/^(heel|toe|fd|an)/.test(kk)?v.slice():[v[0],v[1]+h,v[2]+x]):v;}
        if(h>0&&TH[h]) lean(Q,TH[h]);
        reachFix(Q); ['L','R'].forEach(k=>{ legIK(Q,k,tgtOf(Q,k)); footFix(Q,k,true); }); return Q; };
      // 엉덩이를 높인 만큼 상체를 더 숙여(힙 힌지) 바의 높이는 그대로 유지한다. 팔은 어깨에서 수직으로 늘어뜨린 채.
      const lean=(Q,th)=>{ for(const kk of ['chest','spine','neck','head','shL','shR']) Q[kk]=rotX(Q[kk],Q.pelvis,th); Q.Rt=mm(rx(th/R),Q.Rt);
        ['L','R'].forEach((k,i)=>{ Q['el'+k]=add(Q['sh'+k],arm0[i][0]); Q['ha'+k]=add(Q['sh'+k],arm0[i][1]); }); };
      const arm0=['L','R'].map(k=>[sub(J0['el'+k],J0['sh'+k]),sub(J0['ha'+k],J0['sh'+k])]);
      const TH={}; const leanFor=h=>{ if(h<=0||TH[h]!=null) return; const y0=J0.haL[1]; const yAt=th=>{ TH[h]=th; const y=tryAt(0,h).haL[1]; return y; };
        const sg=yAt(.05)<yAt(-.05)?1:-1; let lo=0,hi=1.2; for(let i=0;i<16;i++){ const m=(lo+hi)/2; if(yAt(sg*m)>y0) lo=m; else hi=m; } TH[h]=sg*(lo+hi)/2; };
      const canClear=barEq&&P.barFix!==false;
      const cleared=Q=>{ const C={}; for(const kk in Q){const v=Q[kk]; C[kk]=Array.isArray(v)&&typeof v[0]==='number'?v.slice():v;} if(canClear) barClear(C); return C; };
      // clear=true면 바-몸 간섭으로 손이 밀린 뒤의 바 위치를 기준으로 푼다 (락아웃에서 바가 허벅지 앞에 얹히는 경우)
      const solveX=(h,clear,c0,w)=>{ let lo=c0-w,hi=c0+w,m=c0; for(let i=0;i<18;i++){ m=(lo+hi)/2; const Q=tryAt(m,h); if(barZ(clear?cleared(Q):Q)>tz) hi=m; else lo=m; } return (lo+hi)/2; };
      let Q=null;
      if(anim.p==='hinge'&&canClear){
        // 바가 무릎·정강이에 깊이 걸리면(무릎이 바의 수직 경로를 막으면) 엉덩이를 조금씩 높여 무릎을 뒤로 뺀다
        let h=0,x=0; for(;h<=.2;h+=.01){ leanFor(h); x=solveX(h,false,-.1,.6); const Q0=tryAt(x,h); if(Math.abs(barZ(cleared(Q0))-barZ(Q0))<.025) break; }
        h=Math.min(h,.2); leanFor(h);
        const x2=solveX(h,true,x,.2); const Q2=cleared(tryAt(x2,h));
        Q=Math.abs(barZ(Q2)-tz)<.01?Q2:cleared(tryAt(x,h));
      } else { const x=solveX(0,false,-.1,.6); const Q2=canClear?cleared(tryAt(solveX(0,true,x,.2),0)):null;
        Q=Q2&&Math.abs(barZ(Q2)-tz)<.01?Q2:cleared(tryAt(x,0)); }
      for(const kk in Q) J[kk]=Q[kk];
      return J;
    }
    if(barEq&&P.barFix!==false) barClear(J);
    return J;
  }
  // 같은 진행도는 다시 풀지 않는다 (1/120 단위로 캐시 → 한 바퀴 돈 뒤에는 계산 없이 재생)
  const memo=new Map(); const atQ=s=>{ const q=Math.round(Math.max(0,Math.min(1,s))*120); let J=memo.get(q); if(!J){ J=at(q/120); memo.set(q,J); } return J; };
  return {P,at:atQ,cycle:!!P.at};
}

/* ---------- 그리기 ---------- */
function hex(c){c=c.trim();if(c.startsWith('#')){if(c.length===4)c='#'+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]}const m=c.match(/\d+/g);return m?m.slice(0,3).map(Number):[128,128,128]}
function shade(rgb,f){return `rgb(${rgb.map(v=>Math.max(0,Math.min(255,Math.round(f>=1?v+(255-v)*(f-1):v*f)))).join(',')})`}
function palette(el){
  const cs=getComputedStyle(el); const g=n=>hex(cs.getPropertyValue(n)||'#888');
  return {bone:g('--fig-bone'),shorts:g('--fig-shorts'),plate:g('--fig-plate'),hair:g('--fig-hair'),muscle:g('--fig-muscle'),deep:g('--fig-deep'),tendon:g('--fig-tendon'),head:g('--fig-head'),skin:g('--fig-skin'),prim:g('--fig-prim'),sec:g('--fig-sec'),metal:g('--fig-metal'),pad:g('--fig-pad'),frame:g('--fig-frame'),floor:g('--fig-floor'),bg:g('--fig-bg')};
}
/* ---------- 근육 해부도 피겨 ----------
   각 근육 = 근복(spindle): 양 끝(a,b), 최대 반지름 r, 끝 반지름 re, 볼록 위치 pk, 근육 키 */
function perp(v,u,fb){let w=sub(v,mul(u,dot(v,u)));if(len(w)<.15&&fb)w=sub(fb,mul(u,dot(fb,u)));return norm(w);}
function scene(J,props,musc,uni){
  const items=[];
  const hipT2=['glute','abd','hipflex','add'].some(k=>musc[k]); const SHORTS2=new Set(['glute','abd','hipflex']);
  const TORSO=['chest','uchest','lats','traps','rhom','erect','abs','obl','glute','abd','hipflex'];
  const lv=(key,side)=>{if(!key)return 0;const m=musc[key];if(!m)return 0;if(uni&&side&&side!==uni&&!TORSO.includes(key))return 0;return m;};
  const SH=.985; // 근육을 살짝 줄여 사이 경계(남색)가 보이게
  const M=(a,b,r,key,side,o={})=>{const l=lv(key,side);items.push({k:'m',a,b,r:r*SH*(l?1.04:1),c:l===1?'prim':l===2?'sec':(o.c||(!hipT2&&SHORTS2.has(key)?'shorts':'muscle')),re:(o.re??r*.35)*SH,pk:o.pk,o:o.o,fl:o.fl,lift:o.lift??.035,fib:l?1:0,hot:!!l,glow:l===1});};
  const EL=(a,b,r,c,o={})=>items.push({k:'m',a,b,r,c,re:o.re??r*.6,pk:o.pk??.5,o:o.o,fl:o.fl,fib:0});
  const C=(a,b,r,c,o={})=>items.push({k:'c',a,b,r,c,...o});
  const Sp=(c,r,cl,o={})=>items.push({k:'s',c,r,cl,...o});
  const P=J.pelvis, Rt=J.Rt, R0=J.R0;
  const T=(v,s=1)=>add(P,mv(Rt,[v[0]*s,v[1],v[2]])), Rr=(v,s=1)=>add(P,mv(R0,[v[0]*s,v[1],v[2]]));
  const TO=(v,s=1)=>norm(mv(Rt,[v[0]*s,0,v[2]])); // 몸통 바깥 방향
  const RO=(v,s=1)=>norm(mv(R0,[v[0]*s,0,v[2]]));
  const fT=mv(Rt,[0,0,1]), uT=mv(Rt,[0,1,0]), fR=mv(R0,[0,0,1]);
  // 심부(남색 실루엣)
  C(T([0,.0,0]),T([0,.2,0]),.11,'deep'); C(T([0,.2,0]),T([0,.42,-.01]),.128,'deep');
  C(add(J.hipL,[0,.01,0]),add(J.hipR,[0,.01,0]),.088,hipT2?'deep':'shorts');
  C(T([0,.46,-.01]),add(J.head,mul(uT,-.07)),.05,'deep');
  C(J.shL,J.shR,.07,'deep');
  // 머리: 타원체 + 머리카락 + 코·귀 (얼굴 방향 표시)
  EL(add(J.head,mv(Rt,[0,-.03,-.015])),add(J.head,mv(Rt,[0,.075,-.02])),.088,'head',{re:.07,pk:.45,o:fT,fl:1.12}); // 두개골
  EL(add(J.head,mv(Rt,[0,.03,.035])),add(J.head,mv(Rt,[0,-.1,.045])),.062,'head',{re:.035,pk:.35,o:fT,fl:.85}); // 얼굴
  EL(add(J.head,mv(Rt,[0,.045,-.035])),add(J.head,mv(Rt,[0,.088,-.03])),.084,'head',{re:.06,pk:.5,o:fT,fl:1.12}); // 정수리
  EL(add(J.head,mv(Rt,[0,.03,.06])),add(J.head,mv(Rt,[0,-.035,.098])),.022,'head',{re:.012,pk:.7,o:fT,fl:.8}); // 코
  EL(add(J.head,mv(Rt,[.045,.03,.07])),add(J.head,mv(Rt,[-.045,.03,.07])),.012,'head',{re:.009,o:fT,fl:.7}); // 눈썹뼈
  EL(add(J.head,mv(Rt,[.05,-.06,.055])),add(J.head,mv(Rt,[0,-.105,.085])),.028,'head',{re:.016,o:fT,fl:.8}); EL(add(J.head,mv(Rt,[-.05,-.06,.055])),add(J.head,mv(Rt,[0,-.105,.085])),.028,'head',{re:.016,o:fT,fl:.8}); // 턱
  for(const sx of [1,-1]){ EL(add(J.head,mv(Rt,[sx*.088,.01,-.005])),add(J.head,mv(Rt,[sx*.088,-.035,-.0])),.02,'head',{re:.012,o:mv(Rt,[sx,0,0]),fl:.5}); }
  // 반바지 (엉덩이·고관절이 타깃이면 생략)
  const hipT=['glute','abd','hipflex','add'].some(k=>musc[k]);
  const SHORTS=new Set(['glute','abd','hipflex']);
  for(const [k,s] of [['L',1],['R',-1]]){
    /* ===== 팔 ===== */
    const S=J['sh'+k],E=J['el'+k],W=J['ha'+k],u=norm(sub(E,S)),fa=norm(sub(W,E));
    let fp=sub(fa,mul(u,dot(fa,u)));const b=len(fp)>.3?norm(fp):perp(fT,u,uT);
    const lat=mul(norm(cross(b,u)),s);
    C(S,E,.036,'deep');C(E,W,.03,'deep');
    M(add(add(S,mul(u,.08)),mul(b,.03)),add(add(E,mul(u,-.035)),mul(b,.026)),.045,'bi',k,{pk:.6,re:.012,o:b,fl:.85});
    M(add(add(S,mul(u,.17)),mul(lat,.03)),add(add(E,mul(u,-.01)),mul(lat,.022)),.026,null,k,{pk:.5,re:.01,o:lat,fl:.7}); // 상완근
    M(add(add(S,mul(u,.03)),mul(b,-.034)),add(add(E,mul(u,.01)),mul(b,-.036)),.047,'tri',k,{pk:.42,re:.014,o:mul(b,-1),fl:.85});
    M(add(add(add(S,mul(u,.07)),mul(b,-.018)),mul(lat,.03)),add(add(E,mul(u,-.07)),mul(lat,.024)),.035,'tri',k,{pk:.45,re:.012,o:norm(add(lat,mul(b,-.6))),fl:.75});
    const c=perp(b,fa,lat), latF=mul(norm(cross(c,fa)),s);
    M(add(add(E,mul(c,.022)),mul(latF,-.012)),add(W,mul(c,.012)),.036,'fore',k,{pk:.25,re:.012,o:c,fl:.75});
    M(add(add(E,mul(c,-.02)),mul(latF,.012)),add(W,mul(c,-.01)),.033,'fore',k,{pk:.25,re:.012,o:mul(c,-1),fl:.75});
    M(add(add(E,mul(u,-.08)),mul(latF,.032)),add(add(E,mul(fa,.16)),mul(latF,.022)),.03,'fore',k,{pk:.35,re:.01,o:latF,fl:.75});
    // 손: 손바닥 + 손가락 + 엄지
    EL(add(W,mul(fa,-.01)),add(W,mul(fa,.085)),.04,'skin',{re:.028,o:c,fl:.5}); EL(add(W,mul(fa,.075)),add(W,mul(fa,.165)),.034,'skin',{re:.02,pk:.4,o:c,fl:.5});
    EL(add(add(W,mul(fa,.02)),mul(latF,-.035)),add(add(add(W,mul(fa,.08)),mul(latF,-.05)),mul(c,.02)),.016,'skin',{re:.01});
    /* ===== 삼각근 3두 ===== */
    const D=add(add(S,mul(u,.155)),mul(lat,.014));
    M(T([.12,.475,.07],s),add(D,mul(b,.026)),.054,'fdelt',k,{pk:.35,re:.014,o:norm(add(mul(b,.7),lat)),fl:.7});
    M(T([.215,.49,0],s),add(D,mul(lat,.022)),.056,'sdelt',k,{pk:.3,re:.014,o:lat,fl:.7});
    M(T([.12,.465,-.075],s),add(D,mul(b,-.026)),.052,'rdelt',k,{pk:.35,re:.014,o:norm(add(mul(b,-.7),lat)),fl:.7});
    /* ===== 대흉근 (판 모양) ===== */
    const H=add(add(S,mul(u,.075)),mul(fT,.02));
    M(T([.022,.445,.11],s),H,.068,'uchest',k,{pk:.38,re:.016,o:TO([.4,0,1],s),fl:.42});
    M(T([.02,.37,.128],s),H,.092,'chest',k,{pk:.36,re:.018,o:TO([.3,0,1],s),fl:.38});
    M(T([.04,.285,.118],s),H,.07,'chest',k,{pk:.36,re:.016,o:TO([.4,0,1],s),fl:.4});
    /* ===== 전거근 ===== */
    for(const y of [.33,.29,.25]) M(T([.145,y+.015,.05],s),T([.118,y-.02,.09],s),.022,null,k,{pk:.5,re:.01,o:TO([1,0,.6],s),fl:.5,lift:.02});
    /* ===== 복직근·복사근 ===== */
    for(const y of [.27,.19,.11]) M(T([.04,y+.034,.118],s),T([.04,y-.034,.114],s),.037,'abs',k,{pk:.5,re:.024,o:fT,fl:.34});
    M(T([.033,.045,.108],s),T([.028,-.06,.094],s),.031,'abs',k,{pk:.4,re:.02,o:fT,fl:.45});
    M(T([.125,.27,.03],s),T([.1,-.01,.06],s),.058,'obl',k,{pk:.45,re:.02,o:TO([1,0,.5],s),fl:.45});
    /* ===== 승모·능형·극하·광배·기립근 (등) ===== */
    M(add(J.head,mv(Rt,[s*.025,-.1,-.05])),T([.185,.47,-.02],s),.045,'traps',k,{pk:.3,re:.018,o:norm(add(uT,mv(Rt,[0,0,-1]))),fl:.5});
    M(T([.005,.45,-.125],s),T([.165,.455,-.055],s),.062,'traps',k,{pk:.35,re:.016,o:TO([.3,0,-1],s),fl:.4});
    M(T([.005,.23,-.125],s),T([.1,.42,-.11],s),.055,'traps',k,{pk:.45,re:.014,o:TO([.2,0,-1],s),fl:.4});
    M(T([.03,.4,-.13],s),T([.095,.33,-.125],s),.03,'rhom',k,{pk:.5,re:.014,o:TO([.2,0,-1],s),fl:.4,lift:.02});
    M(T([.07,.36,-.125],s),add(add(S,mul(fT,-.045)),mul(u,.02)),.05,null,k,{pk:.45,re:.014,o:TO([.5,0,-1],s),fl:.45}); // 극하근·소원근
    const Lt=add(add(S,mul(u,.075)),mul(fT,-.035));
    M(T([.03,.07,-.12],s),Lt,.062,'lats',k,{pk:.45,re:.016,o:TO([.4,0,-1],s),fl:.4});
    M(T([.1,.03,-.1],s),Lt,.064,'lats',k,{pk:.5,re:.016,o:TO([.7,0,-1],s),fl:.4});
    M(T([.13,.19,-.05],s),Lt,.05,'lats',k,{pk:.5,re:.014,o:TO([1,0,-.5],s),fl:.45});
    M(T([.036,-.02,-.115],s),T([.036,.37,-.12],s),.038,'erect',k,{pk:.3,re:.016,o:mv(Rt,[0,0,-1]),fl:.6});
    /* ===== 목 ===== */
    M(T([.03,.47,.075],s),add(J.head,mv(Rt,[s*.05,-.06,-.02])),.022,null,k,{pk:.5,re:.012,lift:.02});
    /* ===== 다리 ===== */
    const Hp=J['hip'+k],K=J['kn'+k],A=J['an'+k],th=norm(sub(K,Hp)),shn=norm(sub(A,K));
    let sp=sub(shn,mul(th,dot(shn,th)));const a=len(sp)>.25?norm(mul(sp,-1)):perp(fR,th,fT);
    const l=mul(norm(cross(a,th)),s);
    C(Hp,K,.058,'deep');C(K,A,.038,'deep');
    EL(add(add(K,mul(a,.045)),mul(th,-.03)),add(add(K,mul(a,.04)),mul(shn,.04)),.03,'skin',{re:.018,o:a,fl:.55}); // 무릎뼈
    const Gi=add(add(add(Hp,mul(th,.13)),mul(a,-.05)),mul(l,.028));
    M(Rr([.045,.05,-.1],s),Gi,.1,'glute',k,{pk:.45,re:.026,o:RO([.3,0,-1],s),fl:.55});
    M(Rr([.11,.09,-.07],s),Gi,.09,'glute',k,{pk:.45,re:.022,o:RO([.6,0,-1],s),fl:.55});
    M(Rr([.14,.1,-.01],s),add(add(Hp,mul(th,.04)),mul(l,.055)),.065,'abd',k,{pk:.4,re:.016,o:RO([1,0,-.3],s),fl:.5});
    M(Rr([.12,.08,.05],s),add(add(add(Hp,mul(th,.13)),mul(l,.045)),mul(a,.02)),.045,'hipflex',k,{pk:.4,re:.014,o:RO([1,0,.5],s),fl:.6});
    M(Rr([.06,.06,.085],s),add(add(Hp,mul(a,.04)),mul(th,.06)),.045,'hipflex',k,{pk:.45,re:.014,o:RO([.3,0,1],s),fl:.55}); // 장요근·치골근 부위 // 대퇴근막장근 부위
    M(add(Hp,mul(a,.048)),add(add(K,mul(a,.036)),mul(th,-.03)),.056,'quad',k,{pk:.45,re:.018,o:a,fl:.8});
    M(add(add(add(Hp,mul(th,.08)),mul(l,.05)),mul(a,.005)),add(add(K,mul(th,-.03)),mul(l,.037)),.058,'quad',k,{pk:.55,re:.02,o:l,fl:.75});
    M(add(add(add(Hp,mul(th,.2)),mul(l,-.036)),mul(a,.016)),add(add(K,mul(l,-.043)),mul(a,.02)),.052,'quad',k,{pk:.75,re:.02,o:norm(add(a,mul(l,-1))),fl:.8});
    M(add(add(Rr([.1,.03,.08],s),[0,0,0]),mul(a,.01)),add(add(K,mul(l,-.05)),mul(a,-.01)),.017,null,k,{pk:.5,re:.01,o:norm(add(a,mul(l,-.6))),fl:.6,lift:.05}); // 봉공근
    M(add(add(Hp,mul(l,-.047)),mul(th,.02)),add(add(Hp,mul(th,.3)),mul(l,-.058)),.048,'add',k,{pk:.35,re:.014,o:mul(l,-1),fl:.7});
    M(add(add(add(Hp,mul(th,.06)),mul(a,-.048)),mul(l,.018)),add(add(K,mul(a,-.042)),mul(l,.034)),.05,'ham',k,{pk:.5,re:.016,o:mul(a,-1),fl:.8});
    M(add(add(add(Hp,mul(th,.06)),mul(a,-.048)),mul(l,-.022)),add(add(K,mul(a,-.042)),mul(l,-.036)),.049,'ham',k,{pk:.5,re:.016,o:mul(a,-1),fl:.8});
    const a2=perp(J['fd'+k],shn,a), l2=mul(norm(cross(a2,shn)),s);
    M(add(add(K,mul(a2,-.036)),mul(l2,.025)),add(add(K,mul(shn,.25)),mul(a2,-.032)),.045,'calf',k,{pk:.3,re:.012,o:norm(add(mul(a2,-1),mul(l2,.4))),fl:.8});
    M(add(add(K,mul(a2,-.036)),mul(l2,-.025)),add(add(K,mul(shn,.27)),mul(a2,-.032)),.047,'calf',k,{pk:.3,re:.012,o:norm(add(mul(a2,-1),mul(l2,-.4))),fl:.8});
    M(add(add(K,mul(shn,.12)),mul(a2,-.024)),add(A,mul(a2,-.03)),.036,'calf',k,{pk:.4,re:.012,lift:.02});
    M(add(add(add(K,mul(shn,.04)),mul(a2,.02)),mul(l2,.016)),add(A,mul(a2,.02)),.036,null,k,{pk:.35,re:.012,o:a2,fl:.75}); // 전경골근
    M(add(add(K,mul(shn,.06)),mul(l2,.034)),add(add(A,mul(l2,.024)),mul(shn,-.06)),.03,null,k,{pk:.4,re:.01,o:l2,fl:.7}); // 비골근
    M(add(add(K,mul(shn,.08)),mul(l2,-.03)),add(add(A,mul(l2,-.02)),mul(shn,-.08)),.028,'calf',k,{pk:.35,re:.01,o:mul(l2,-1),fl:.7}); // 가자미근 안쪽
    // 발
    const fu=perp([0,1,0],norm(sub(J['toe'+k],J['heel'+k])),a2);
    EL(add(J['heel'+k],mul(fu,.015)),add(J['toe'+k],mul(fu,.0)),.042,'skin',{re:.026,pk:.35,o:fu,fl:.62});
    C(A,add(J['heel'+k],mul(fu,.03)),.034,'skin');
    if(!hipT){ EL(add(Rr([.07,.05,-.01],s),[0,0,0]),add(add(Hp,mul(th,.2)),mul(l,.004)),.108,'shorts',{re:.088,pk:.4,o:RO([.3,0,-1],s),fl:.95}); }
  }
  return items.concat(props||[]);
}
/* 투영 */
function cam(view,W,H){
  const yaw=view.yaw*R,pit=view.pitch*R,d=view.dist||4.2; const F=Math.min(W,H*1.15)*d/(view.span||2.5);
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
  const T=view.target||[0,.9,0];
  return function(p){const q=sub(p,T);const x1=q[0]*cy-q[2]*sy, z1=q[0]*sy+q[2]*cy; const y1=q[1]*cp-z1*sp, z2=q[1]*sp+z1*cp; const dep=d-z2; const s=F/dep; return {x:W/2+x1*s,y:H*.55-y1*s,d:dep,s};};
}
function draw(ctx,W,H,items,view,pal){
  const pr=cam(view,W,H);
  ctx.clearRect(0,0,W,H);
  // 바닥
  ctx.save();
  for(let i=-3;i<=3;i++){const a=pr([i*.5,0,-1.5]),b=pr([i*.5,0,1.5]),c=pr([-1.5,0,i*.5]),e=pr([1.5,0,i*.5]);ctx.strokeStyle=shade(pal.floor,1);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.moveTo(c.x,c.y);ctx.lineTo(e.x,e.y);ctx.stroke();}
  ctx.restore();
  const list=[];
  for(const it of items){
    if(it.k==='c'){const a=pr(it.a),b=pr(it.b);list.push({it,a,b,d:(a.d+b.d)/2-(it.patch?.03:0)+(it.bias||0)});}
    else if(it.k==='m'){const a=pr(it.a),b=pr(it.b);list.push({it,a,b,d:(a.d+b.d)/2-(it.lift||0)});}
    else if(it.k==='s'){const c=pr(it.c);list.push({it,c,d:c.d-(it.patch?.03:0)+(it.bias||0)});}
    else if(it.k==='poly'){const ps=it.pts.map(pr);let ar=0;for(let i=0;i<ps.length;i++){const p=ps[i],q=ps[(i+1)%ps.length];ar+=p.x*q.y-q.x*p.y;} if(it.cull&&ar>0)continue; list.push({it,ps,d:ps.reduce((a,p)=>a+p.d,0)/ps.length+(it.bias||0)});}
    else if(it.k==='l'){const a=pr(it.a),b=pr(it.b);list.push({it,a,b,d:Math.max(a.d,b.d)+(it.bias||0)});}
  }
  list.sort((p,q)=>q.d-p.d);
  for(const o of list){
    const it=o.it; const base=pal[it.c||it.cl]||pal.skin;
    if(it.k==='m'){drawMuscle(ctx,o,base,it);continue;}
    if(it.k==='c'){
      const w=2*it.r*(o.a.s+o.b.s)/2;
      ctx.lineCap='round';
      ctx.strokeStyle=shade(base,.62);ctx.lineWidth=w+2;ctx.beginPath();ctx.moveTo(o.a.x,o.a.y);ctx.lineTo(o.b.x,o.b.y);ctx.stroke();
      ctx.strokeStyle=shade(base,1);ctx.lineWidth=w;ctx.stroke();
      const dx=o.b.x-o.a.x,dy=o.b.y-o.a.y,l=Math.hypot(dx,dy)||1; const nx=-dy/l,ny=dx/l; const sgn=(nx*-.6+ny*-.8)>0?1:-1; const off=w*.22*sgn;
      ctx.strokeStyle=shade(base,1.28);ctx.globalAlpha=.55;ctx.lineWidth=w*.3;ctx.beginPath();ctx.moveTo(o.a.x+nx*off,o.a.y+ny*off);ctx.lineTo(o.b.x+nx*off,o.b.y+ny*off);ctx.stroke();ctx.globalAlpha=1;
    }else if(it.k==='s'){
      const r=it.r*o.c.s; const g=ctx.createRadialGradient(o.c.x-r*.35,o.c.y-r*.4,r*.1,o.c.x,o.c.y,r);
      g.addColorStop(0,shade(base,1.3));g.addColorStop(1,shade(base,.8));
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(o.c.x,o.c.y,r,0,7);ctx.fill();ctx.strokeStyle=shade(base,.62);ctx.lineWidth=1;ctx.stroke();
    }else if(it.k==='poly'){
      ctx.fillStyle=shade(base,it.f||1);ctx.strokeStyle=shade(base,.6);ctx.lineWidth=1;ctx.beginPath();o.ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.stroke();
    }else if(it.k==='l'){
      ctx.strokeStyle=shade(base,it.f||.9);ctx.lineWidth=it.w||1.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(o.a.x,o.a.y);ctx.lineTo(o.b.x,o.b.y);ctx.stroke();
    }
  }
}

function drawMuscle(ctx,o,base,it){
  const ax=o.b.x-o.a.x,ay=o.b.y-o.a.y,Lp=Math.hypot(ax,ay);const sA=o.a.s,sB=o.b.s;
  const r=it.r,re=it.re??r*.35,pk=it.pk??.5;const rm=r*(sA+sB)/2;
  const lightSide=(nx,ny)=>(nx*-.6+ny*-.8)>0?1:-1;
  if(Lp<rm*1.2){ // 정면으로 향해 짧게 보일 때
    const cx=(o.a.x+o.b.x)/2,cy=(o.a.y+o.b.y)/2,R=rm*.95;const g=ctx.createRadialGradient(cx-R*.35,cy-R*.4,R*.1,cx,cy,R);
    g.addColorStop(0,shade(base,1.3));g.addColorStop(1,shade(base,.72));ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fill();ctx.strokeStyle=shade(base,.5);ctx.lineWidth=.8;ctx.stroke();return;}
  const nx=-ay/Lp,ny=ax/Lp,N=14,Lft=[],Rgt=[],mids=[];
  for(let i=0;i<=N;i++){const t=i/N;const tt=t<pk?t/pk*.5:.5+(t-pk)/(1-pk)*.5;const w=(re+(r-re)*Math.pow(Math.sin(Math.PI*tt),.7))*(sA+(sB-sA)*t);
    const px=o.a.x+ax*t,py=o.a.y+ay*t;Lft.push([px+nx*w,py+ny*w]);Rgt.push([px-nx*w,py-ny*w]);mids.push([px,py,w]);}
  const sg=lightSide(nx,ny),mx=(o.a.x+o.b.x)/2,my=(o.a.y+o.b.y)/2;
  const g=ctx.createLinearGradient(mx+nx*rm*sg,my+ny*rm*sg,mx-nx*rm*sg,my-ny*rm*sg);
  const hot=it.c==='prim'||it.c==='sec';
  if(hot){g.addColorStop(0,shade(base,1.25));g.addColorStop(.45,shade(base,1));g.addColorStop(1,shade(base,.72));}
  else{g.addColorStop(0,shade(base,1.08));g.addColorStop(.5,shade(base,.98));g.addColorStop(1,shade(base,.8));}
  ctx.beginPath();Lft.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));for(let i=Rgt.length-1;i>=0;i--)ctx.lineTo(Rgt[i][0],Rgt[i][1]);ctx.closePath();
  if(it.glow){ctx.save();ctx.shadowColor=shade(base,1);ctx.shadowBlur=6;ctx.fillStyle=g;ctx.fill();ctx.restore();}
  ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=hot?shade(base,.55):shade(base,.68);ctx.lineWidth=hot?.9:.7;ctx.stroke();
  if(hot&&it.fib&&rm>3){ctx.strokeStyle=shade(base,.72);ctx.globalAlpha=.5;ctx.lineWidth=.7;
    for(const f of [-.55,-.18,.18,.55]){ctx.beginPath();mids.forEach((m,i)=>{const x=m[0]+nx*m[2]*f,y=m[1]+ny*m[2]*f;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();}
    ctx.globalAlpha=1;}
  // 건(힘줄) 끝
  ctx.fillStyle=shade(hexTendon||base,1);
}
let hexTendon=null;
/* ---------- 소품 ---------- */
const PR={
  cap:(a,b,r,c='frame',o={})=>({k:'c',a,b,r,c,...o}),
  ball:(c,r,cl='metal',o={})=>({k:'s',c,r,cl,...o}),
  line:(a,b,c='metal',w=1.5)=>({k:'l',a,b,c,w}),
  disc(c,axis,r,col='metal',n=18){const u=norm(axis);const t=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];const v1=norm(cross(u,t)),v2=cross(u,v1);const pts=[];for(let i=0;i<n;i++){const a=i/n*Math.PI*2;pts.push(add(c,add(mul(v1,Math.cos(a)*r),mul(v2,Math.sin(a)*r))));}return {k:'poly',pts,c:col,f:.85};},
  box(c,s,ax,col='pad',bias=0){ax=ax||[[1,0,0],[0,1,0],[0,0,1]];const h=s.map(x=>x/2);const P=(i,j,k)=>add(c,add(add(mul(ax[0],i*h[0]),mul(ax[1],j*h[1])),mul(ax[2],k*h[2])));
    const F=[[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],1],[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],.8],[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],.9],[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],.9],[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],1.15],[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],.7]];
    return F.map(f=>({k:'poly',pts:f.slice(0,4).map(q=>P(...q)),c:col,f:f[4],cull:1,bias}));},
  barbell(a,b,ext=.5,plates=2,pr=.17){const u=norm(sub(b,a)),m=mid(a,b),hw=len(sub(b,a))/2+ext;const e1=sub(m,mul(u,hw)),e2=add(m,mul(u,hw));const out=[PR.cap(e1,e2,.016,'metal')];
    for(const s of [-1,1]){for(let i=0;i<plates;i++){out.push(PR.disc(add(m,mul(u,s*(hw-.1-i*.05))),u,i?pr*.75:pr,'plate'));}}return out;},
  dumbbell(c,axis,r=.075){const u=norm(axis);return [PR.cap(add(c,mul(u,-.13)),add(c,mul(u,.13)),.017,'metal'),PR.disc(add(c,mul(u,-.1)),u,r,'plate'),PR.disc(add(c,mul(u,.1)),u,r,'plate'),PR.disc(add(c,mul(u,-.075)),u,r,'plate'),PR.disc(add(c,mul(u,.075)),u,r,'plate')];},
  bench(c,len=1.2,h=.45,ang=0){ // ang: 등판 기울기
    const out=PR.box([c[0],h-.05,c[2]],[.3,.09,len],null,'pad');out.push(PR.cap([c[0],.02,c[2]-len*.38],[c[0],h-.1,c[2]-len*.38],.025,'frame'),PR.cap([c[0],.02,c[2]+len*.38],[c[0],h-.1,c[2]+len*.38],.025,'frame'));return out.flat();},
  stack(c,h=1.9){return [...PR.box([c[0],.55,c[2]],[.3,.9,.12],null,'metal'),PR.cap([c[0]-.22,0,c[2]],[c[0]-.22,h,c[2]],.025,'frame'),PR.cap([c[0]+.22,0,c[2]],[c[0]+.22,h,c[2]],.025,'frame'),PR.cap([c[0]-.22,h,c[2]],[c[0]+.22,h,c[2]],.025,'frame')];},
  cable(from,to){return [PR.line(from,to,'metal',1.4),PR.ball(from,.03,'frame')];},
  pad(a,b,r=.05){return PR.cap(a,b,r,'pad');},
  seatBack(J,off=.13,lenUp=.62,w=.34,dyn){ // 등받이: 몸통 뒤에 붙음
    const up=norm(sub(J.neck,J.pelvis)),fw=norm(mv(J.Rt,[0,0,1])),rt=norm(cross(up,fw));
    const c=add(add(J.pelvis,mul(up,lenUp/2-.02)),mul(fw,-off));return PR.box(c,[w,lenUp,.08],[rt,up,fw],'pad');},
  seat(c,w=.36,d=.42,h=.08){return [...PR.box(c,[w,h,d],null,'pad'),PR.cap([c[0],0,c[2]],[c[0],c[1]-h/2,c[2]],.03,'frame')];}
};

/* ---------- 동작 패턴 ---------- */
const W=(e,h)=>[e,h,'w'];
const BENCHY=.5; // 벤치 위 골반 높이
function press(o){
  const pos=o.pos||'flat', tool=o.tool||'bar', close=o.grip==='close';
  const rp={flat:-90,incline:-48,decline:-108,seated:-12,standing:0,smith:-90,machine:-12}[pos];
  const sup=pos==='flat'||pos==='incline'||pos==='decline'||pos==='smith';
  const legs = pos==='decline'?{th:W(115,90),sh:W(20,90)} : sup?{th:W(78,90),sh:W(0,0)} : pos==='standing'?{th:[0,0],sh:[0,0]}:{th:W(88,90),sh:W(8,-90)};
  const uaA=close?[22,-55]:tool==='db'?[70,-22]:[72,-15], faA=close?[95,92]:[92,90];
  const uaB=close?[86,86]:tool==='db'?[88,82]:[86,84], faB=[88,88];
  const A={rp,t:pos==='standing'?8:0,arms:{ua:uaA,fa:faA},legs}, B={rp,t:A.t,arms:{ua:uaB,fa:faB},legs};
  // 바(손) 궤적: 몸통 기준 [좌우, 머리쪽, 가슴앞]
  let TA,TB,bend=[1,-.7,-.6];
  const db=tool==='db';
  if(pos==='flat'||pos==='smith'){TA=db?[.40,.35,.15]:[.36,.33,.18];TB=db?[.24,.42,.56]:[.34,.42,.56];}
  // 프리웨이트 벤치: 락아웃은 어깨 수직선 위, 최저점은 명치·하부 흉근(어깨보다 발 쪽) → 사선 궤적
  if(pos==='flat'&&!close) TB[1]=L.shY;
  if(pos==='incline'){TA=db?[.40,.42,.15]:[.36,.41,.18];TB=db?[.24,.66,.48]:[.33,.66,.48];bend=[1,-.5,-.6];}
  if(pos==='decline'){TA=[.36,.28,.18];TB=[.32,.27,.53];}
  if(pos==='seated'||pos==='machine'){TA=[.32,.36,.14];TB=o.decl?[.27,.2,.52]:[.28,.29,.55];bend=[1,-.5,-.7];}
  if(pos==='standing'){TA=[.32,.36,.14];TB=[.26,.3,.56];}
  if(close){TA=[.19,.30,.18];TB=[.2,.40,.56];bend=[.35,-1,-.5];}
  // J-커브: 가슴에서 밀어 올릴 때 바가 먼저 어깨 쪽으로 빠르게 이동하고 그다음 수직으로 올라간다 (스미스·머신은 레일을 따라 직선)
  const jcurve=sup&&pos!=='smith'&&tool!=='machine'?s=>[s,1-Math.pow(1-s,2.4),s]:null;
  // 팔꿈치: 최저점에서는 몸통 쪽으로 접고(약 45~60°), 올라가며 벌어진다
  const bendTop=jcurve&&!close?[bend[0],bend[1]*.55,bend[2]]:null, bendBot=jcurve&&!close?[bend[0],bend[1]*1.25,bend[2]]:bend;
  const ik=armIK(TA,TB,bendBot,bendTop,jcurve);
  const piv = sup?[0,BENCHY,.28]:[0,.58,0];
  if(pos==='incline'){piv[1]=.52;piv[2]=.12}
  if(pos==='decline'){piv[1]=.62;}
  return {A,B,ik,anchor:sup||pos==='seated'||pos==='machine'?{type:'pelvis',at:piv}:{type:'feet',at:[0,.08,0]},
    cam:{yaw:sup?62:55,pitch:sup?24:12,target:sup?[0,.75,-.05]:[0,1.0,.1]},
    props:(J,st)=>{const out=[];
      if(sup){ if(pos==='flat'||pos==='smith') out.push(...PR.bench([0,0,-.05],1.25)); else {out.push(...PR.seatBack(st.JA,.13,.75,.32)); out.push(...PR.seat([0,piv[1]-.14,piv[2]+.12],.32,.36));} }
      if(pos==='seated'||pos==='machine'){out.push(...PR.seatBack(st.JA,.13,.68,.36),...PR.seat([0,.44,.04]));}
      if(tool==='bar') out.push(...PR.barbell(J.haL,J.haR,close?.75:.45));
      if(tool==='db'){out.push(...PR.dumbbell(J.haL,sub(J.haL,J.haR)),...PR.dumbbell(J.haR,sub(J.haL,J.haR)));}
      if(tool==='machine'){out.push(PR.cap(J.haL,add(J.haL,mul(norm(sub(J.haL,J.elL)),-.02)),.03,'metal'));for(const k of ['L','R']){const h=J['ha'+k];const sd=h[0]>J.pelvis[0]?1:-1;const piv=[J.pelvis[0]+sd*.55,h[1]+.05,J.pelvis[2]-.35];out.push(PR.cap(add(h,[0,-.08,0]),add(h,[0,.08,0]),.022,'metal'),PR.cap(h,add(h,[sd*.18,0,0]),.025,'frame'),PR.cap(add(h,[sd*.18,0,0]),piv,.03,'frame'));} out.push(...PR.stack([.65,0,-.35]));}
      if(tool==='cable'){out.push(...PR.cable([.7,1.25,-.6],J.haL),...PR.cable([-.7,1.25,-.6],J.haR),...PR.stack([.75,0,-.6]),...PR.stack([-.75,0,-.6]));}
      if(pos==='smith'){out.push(PR.cap([.72,0,-.12],[.72,2.1,-.12],.03,'frame'),PR.cap([-.72,0,-.12],[-.72,2.1,-.12],.03,'frame'));}
      return out;}};
}
function fly(o){
  const pos=o.pos||'flat', rev=!!o.rev;
  const rp={flat:-90,incline:-48,seated:-8,standing:0,bent:0}[pos];
  const sup=pos==='flat'||pos==='incline';
  let A={rp,arms:{ua:[86,-8],fa:[84,6]}}, B={rp,arms:{ua:[87,70],fa:[87,98]}};
  if(pos==='standing'&&!rev){A={rp:0,t:14,arms:{ua:[108,-6],fa:[100,2]}};B={rp:0,t:14,arms:{ua:[52,72],fa:[46,104]}};if(o.low){A={rp:0,t:4,arms:{ua:[35,-8],fa:[30,0]}};B={rp:0,t:4,arms:{ua:[118,72],fa:[122,100]}};}}
  if(pos==='seated'&&o.mach==='pec'){A={rp,arms:{ua:[85,-20],fa:[88,10]}};B={rp,arms:{ua:[85,62],fa:[87,100]}};}
  if(rev){ if(pos==='bent'){A={t:68,arms:{ua:W(6,95),fa:W(4,100)}};B={t:68,arms:{ua:W(84,8),fa:W(80,14)}};} else {const a=A;A={...B,arms:{ua:[86,84],fa:[86,92]}};B={...a,arms:{ua:[86,-22],fa:[86,-10]}};} }
  const legs=sup?{th:W(78,90),sh:W(0,0)}:pos==='seated'?{th:W(88,90),sh:W(8,-90)}:pos==='bent'?{th:[22,90],sh:[16,-90]}:{L:{},R:{}};
  for(const P of [A,B]){P.legs=legs;}
  if(pos==='standing'){A.L={th:[8,90]};A.R={th:[8,-90],sh:[10,-90]};B.L=A.L;B.R=A.R;}
  const piv=sup?[0,pos==='incline'?.52:BENCHY,pos==='incline'?.12:.28]:[0,.58,0];
  return {A,B,anchor:sup||pos==='seated'?{type:'pelvis',at:piv}:{type:'feet',at:[0,.08,0]},cam:{yaw:sup?35:pos==='bent'?40:30,pitch:sup?35:15,target:sup?[0,.75,0]:[0,1,0]},
    props:(J,st)=>{const out=[];
      if(pos==='flat') out.push(...PR.bench([0,0,-.05],1.25));
      if(pos==='incline'){out.push(...PR.seatBack(st.JA,.13,.75,.32),...PR.seat([0,.38,.24],.32,.36));}
      if(pos==='seated'){ if(rev){ const fw=norm(mv(st.JA.Rt,[0,0,1])),up=norm(mv(st.JA.Rt,[0,1,0])); out.push(...PR.box(add(st.JA.chest,mul(fw,.2)),[.26,.5,.07],[[1,0,0],up,fw],'pad'),...PR.seat([0,.44,.04]),...PR.stack([0,0,.75])); } else out.push(...PR.seatBack(st.JA,.13,.7,.36),...PR.seat([0,.44,.04]),...PR.stack([0,0,-.55])); }
      if(o.tool==='db'){const ax=pos==='bent'?[0,0,1]:norm(sub(J.elL,J.haL));out.push(...PR.dumbbell(J.haL,pos==='bent'?[0,0,1]:mv(J.Rt,[0,1,0])),...PR.dumbbell(J.haR,pos==='bent'?[0,0,1]:mv(J.Rt,[0,1,0])));}
      if(o.tool==='cable'){const hi=o.low?.15:pos==='standing'?2.1:1.4;out.push(...PR.cable([1.0,hi,-.2],J.haL),...PR.cable([-1.0,hi,-.2],J.haR),...PR.stack([1.05,0,-.2]),...PR.stack([-1.05,0,-.2]));}
      if(o.mach){for(const k of ['L','R']){const h=J['ha'+k];out.push(PR.cap(add(h,[0,-.1,0]),add(h,[0,.1,0]),.03,'pad'),PR.cap(J['ha'+k],add(J['sh'+k],[0,.35,rev?.25:-.15]),.022,'frame'));}}
      return out;}};
}
function ohp(o){
  const tool=o.tool||'bar', seated=o.pos!=='standing';
  const A={rp:seated?-6:0,arms:{ua:tool==='bar'?[62,62]:[86,22],fa:tool==='bar'?[168,96]:[174,80]}};
  const B={rp:A.rp,arms:{ua:[170,tool==='bar'?70:30],fa:[172,tool==='bar'?80:40]}};
  if(o.arnold){A.arms={ua:[40,88],fa:[160,92]};}
  const legs=seated?{th:W(88,90),sh:W(8,-90)}:{th:[0,0],sh:[0,0]}; A.legs=B.legs=legs;
  let ik;
  if(tool==='bar'||tool==='smith') ik=armIK([.27,.52,.16],[.26,1.0,.03],[.4,-1,.5]);
  else if(o.arnold) ik=armIK([.12,.55,.17],[.2,1.0,.03],[.3,-1,.9],[1,-.6,.1]);
  else if(tool==='machine') ik=armIK([.32,.56,.08],[.27,.98,.08],[1,-.6,.2]);
  else ik=armIK([.36,.56,.04],[.2,1.0,.03],[1,-.6,.1]);
  return {A,B,ik,anchor:seated?{type:'pelvis',at:[0,.58,0]}:{type:'feet',at:[0,.08,0]},cam:{yaw:48,pitch:10,target:[0,1.15,0]},
    props:(J,st)=>{const out=[];if(seated){out.push(...PR.seatBack(st.JA,.13,.75,.34),...PR.seat([0,.44,.04]));}
      if(tool==='bar')out.push(...PR.barbell(J.haL,J.haR,.45));
      if(tool==='db'){out.push(...PR.dumbbell(J.haL,mv(J.Rt,[1,0,0])),...PR.dumbbell(J.haR,mv(J.Rt,[1,0,0])));}
      if(tool==='machine'){for(const k of ['L','R']){const h=J['ha'+k];out.push(PR.cap(add(h,[0,0,-.06]),add(h,[0,0,.06]),.022,'metal'),PR.cap(h,add(h,[0,-.05,-.5]),.03,'frame'));}out.push(...PR.stack([0,0,-.7]));}
      if(tool==='smith')out.push(...PR.barbell(J.haL,J.haR,.45),PR.cap([.72,0,.05],[.72,2.2,.05],.03,'frame'),PR.cap([-.72,0,.05],[-.72,2.2,.05],.03,'frame'));
      return out;}};
}
function raise(o){ // 레터럴/프론트 레이즈, 업라이트 로우, 슈러그
  const kind=o.kind||'lat', tool=o.tool||'db', uni=o.uni;
  let A,B;
  if(kind==='lat'){A={arms:{ua:[14,8],fa:[12,18]}};B={arms:{ua:[88,14],fa:[84,24]}};}
  if(kind==='front'){A={arms:{ua:[8,88],fa:[8,90]}};B={arms:{ua:[92,88],fa:[94,90]}};}
  if(kind==='upright'){A={arms:{ua:[10,70],fa:[8,118]}};B={arms:{ua:[96,18],fa:[64,168]}};}
  if(kind==='shrug'){A={arms:{ua:[4,10],fa:[3,20]},scap:-.01};B={arms:{ua:[4,10],fa:[3,20]},scap:.07};}
  if(uni){const other={ua:[6,60],fa:[60,90]};A[uni==='R'?'L':'R']=other;B[uni==='R'?'L':'R']=other;if(tool==='cable'){A[uni==='R'?'L':'R']={ua:[20,0],fa:[20,0]};B[uni==='R'?'L':'R']=A[uni==='R'?'L':'R'];}}
  const seated=tool==='machine'; const legs=seated?{th:W(88,90),sh:W(8,-90)}:{th:[0,0],sh:[0,0]};A.legs=B.legs=legs;
  return {A,B,anchor:seated?{type:'pelvis',at:[0,.58,0]}:{type:'feet',at:[0,.08,0]},cam:{yaw:kind==='front'?70:18,pitch:10,target:[0,1.1,0]},
    props:(J,st)=>{const out=[];
      if(tool==='db'){for(const k of ['L','R']){if(uni&&k!==uni)continue;out.push(...PR.dumbbell(J['ha'+k],kind==='front'||kind==='upright'?mv(J.Rt,[1,0,0]):mv(J.Rt,[0,0,1])));}}
      if(tool==='bar')out.push(...PR.barbell(J.haL,J.haR,kind==='shrug'?.45:.3,kind==='shrug'?2:1,kind==='shrug'?.2:.11));
      if(tool==='cable'){const k=uni||'R';const s=k==='L'?1:-1;out.push(...PR.cable([-s*.35,.12,.05],J['ha'+k]),...PR.stack([-s*.45,0,-.15]));}
      if(tool==='machine'){out.push(...PR.seat([0,.44,.04]),...PR.box([0,.95,-.2],[.3,.5,.06],null,'pad'));for(const k of ['L','R'])out.push(PR.cap(J['el'+k],add(J['el'+k],[0,0,-.1]),.045,'pad'));}
      return out;}};
}
function curl(o){
  const tool=o.tool||'bar', st=o.style||'stand', uni=o.uni;
  let A={arms:{ua:[8,92],fa:[6,92]}},B={arms:{ua:[12,92],fa:[146,92]}};
  if(st==='preacher'){A={arms:{ua:[52,90],fa:[42,92]}};B={arms:{ua:[52,90],fa:[152,92]}};}
  if(st==='conc'){A={t:32,R:{ua:W(14,95),fa:W(4,90)},L:{ua:[20,40],fa:W(30,90)}};B={t:32,R:{ua:W(14,95),fa:W(128,-80)},L:A.L};}
  if(o.hammer){A.arms.fa=[6,92];B.arms.fa=[144,92];}
  const seated=st!=='stand'; const legs=seated?{th:W(88,90),sh:W(8,-90)}:{th:[0,0],sh:[0,0]};
  if(st==='conc'){legs.L={th:W(88,60),sh:W(5,-80)};legs.R={th:W(88,60),sh:W(5,-80)};A.L={...A.L,...legs.L};A.R={...A.R,...legs.R};B.L={...B.L,...legs.L};B.R={...B.R,...legs.R};}
  A.legs=B.legs=legs;
  return {A,B,anchor:seated?{type:'pelvis',at:[0,.58,0]}:{type:'feet',at:[0,.08,0]},cam:{yaw:70,pitch:10,target:[0,1.05,0]},
    props:(J,stt)=>{const out=[];
      if(tool==='bar'||tool==='ez')out.push(...PR.barbell(J.haL,J.haR,tool==='ez'?.25:.3,1,.11));
      if(tool==='db'){for(const k of ['L','R']){if(st==='conc'&&k==='L')continue;const ax=o.hammer?mv(J.Rt,[0,1,0]):mv(J.Rt,[1,0,0]);out.push(...PR.dumbbell(J['ha'+k],o.hammer?sub(J['ha'+k],J['el'+k]).map((v,i)=>i===1?v:v).map((v,i)=>[0,0,1][i]):ax));}}
      if(tool==='cable'){out.push(...PR.cable([0,.12,.55],mid(J.haL,J.haR)),PR.cap(J.haL,J.haR,.018,'metal'),...PR.stack([0,0,.65]));}
      if(st==='preacher'||tool==='machine'){out.push(...PR.seat([0,.44,.04]),...PR.box(add(mid(J.elL,J.elR),[0,-.08,.08]),[.5,.06,.32],[[1,0,0],norm([0,1,-.9]),norm([0,.9,1])],'pad'));}
      if(tool==='machine'){out.push(PR.cap(J.haL,J.haR,.02,'metal'));out.push(...PR.stack([-.6,0,-.45]));}
      if(st==='conc')out.push(...PR.bench([0,0,0],1.1));
      return out;}};
}
function triceps(o){
  const k=o.kind||'pushdown', tool=o.tool||'cable';
  let A,B,legs={th:[0,0],sh:[0,0]},anchor={type:'feet',at:[0,.08,0]},sup=false,cam={yaw:75,pitch:10,target:[0,1.05,0]};
  if(k==='pushdown'){A={t:10,arms:{ua:[6,96],fa:[98,92]}};B={t:10,arms:{ua:[6,96],fa:[6,92]}};}
  if(k==='overhead'){A={arms:{ua:[168,86],fa:[52,-92]}};B={arms:{ua:[168,86],fa:[172,88]}};if(tool==='cable'){A.t=B.t=25;}}
  if(k==='skull'){sup=true;A={rp:-90,arms:{ua:[106,90],fa:[160,-90]}};B={rp:-90,arms:{ua:[100,90],fa:[100,90]}};legs={th:W(78,90),sh:W(0,0)};anchor={type:'pelvis',at:[0,BENCHY,.28]};cam={yaw:80,pitch:22,target:[0,.8,-.1]};}
  if(k==='kickback'){A={t:68,R:{ua:W(88,-88),fa:W(4,-80)},L:{ua:W(20,95),fa:W(10,90)}};B={t:68,R:{ua:W(88,-88),fa:W(88,-88)},L:A.L};legs={L:{th:[38,90],sh:[25,-90]},R:{th:[12,-30],sh:[4,-60]}};cam={yaw:80,pitch:12,target:[0,.9,0]};}
  if(k==='seatdip'){A={rp:-8,arms:{ua:[55,-80],fa:[40,80]}};B={rp:-8,arms:{ua:[12,-60],fa:[8,40]}};legs={th:W(88,90),sh:W(8,-90)};anchor={type:'pelvis',at:[0,.58,0]};}
  if(k==='machine'){A={rp:-6,arms:{ua:[70,80],fa:[160,92]}};B={rp:-6,arms:{ua:[70,80],fa:[66,88]}};legs={th:W(88,90),sh:W(8,-90)};anchor={type:'pelvis',at:[0,.58,0]};}
  if(legs.L){A.L={...A.L,...legs.L};A.R={...A.R,...legs.R};B.L={...B.L,...legs.L};B.R={...B.R,...legs.R};} else A.legs=B.legs=legs;
  return {A,B,anchor,cam,props:(J,st)=>{const out=[];
    if(k==='pushdown'){out.push(...PR.cable([0,2.05,.38],mid(J.haL,J.haR)),PR.cap(J.haL,J.haR,.018,'metal'),...PR.stack([0,0,.48],2.1));}
    if(k==='overhead'){if(tool==='db')out.push(...PR.dumbbell(add(mid(J.haL,J.haR),mul(norm(sub(mid(J.haL,J.haR),mid(J.elL,J.elR))),.06)),norm(sub(mid(J.haL,J.haR),mid(J.elL,J.elR)))));else out.push(...PR.cable([0,.3,-.7],mid(J.haL,J.haR)),...PR.stack([0,0,-.8]));}
    if(k==='skull'){out.push(...PR.bench([0,0,-.05],1.25),...PR.barbell(J.haL,J.haR,.25,1,.11));}
    if(k==='kickback'){out.push(...PR.dumbbell(J.haR,[1,0,0]),...PR.bench([.35,0,.35],1.0));}
    if(k==='seatdip'||k==='machine'){out.push(...PR.seatBack(st.JA,.13,.7,.36),...PR.seat([0,.44,.04]),PR.cap(J.haL,J.haR,.025,'metal'),...PR.stack([0,0,-.6]));}
    return out;}};
}
function dip(o){
  const A={t:o.chest?18:6,arms:{ua:[6,-92],fa:[4,10]},legs:{th:[12,90],sh:[70,-90]}}, B={t:o.chest?24:10,arms:{ua:[68,-88],fa:[14,30]},legs:A.legs};
  if(o.assist){A.legs=B.legs={th:[95,90],sh:[5,-90]};}
  return {A,B,anchor:{type:'hands',at:[0,1.15,0]},cam:{yaw:70,pitch:8,target:[0,1.05,0]},props:(J)=>{const out=[];for(const s of [1,-1]){out.push(PR.cap([s*.26,1.13,-.45],[s*.26,1.13,.45],.025,'metal'),PR.cap([s*.26,0,-.4],[s*.26,1.13,-.4],.028,'frame'));}
    if(o.assist)out.push(...PR.box(add(mid(J.knL,J.knR),[0,-.06,0]),[.4,.06,.3],null,'pad'),PR.cap(add(mid(J.knL,J.knR),[0,-.08,0]),[0,0,-.1],.03,'frame'));return out;}};
}
function pushup(o){
  const A={rp:62,arms:{ua:W(2,-90),fa:W(0,0)},legs:{th:[0,0],sh:[0,0],ft:W(8,-90)}}, B={rp:80,arms:{ua:W(92,-50),fa:W(5,-90)},legs:A.legs};
  return {A,B,anchor:{type:'hands',at:[0,.04,0]},solveRp:true,cam:{yaw:72,pitch:12,target:[0,.4,-.5]},props:()=>[]};
}
function plank(o){
  const A={rp:80,arms:{ua:W(0,0),fa:W(90,90)},legs:{th:[0,0],sh:[0,0],ft:W(8,-90)}}, B={...A,rp:79};
  return {A,B,anchor:{type:'elbows',at:[0,.06,0]},solveRp:true,cam:{yaw:72,pitch:14,target:[0,.3,-.5]},props:()=>[]};
}
function vpull(o){ // 랫풀다운, 풀업, 친업, 어시스트: 손(바) 궤적 IK — 당긴 끝에서 바가 쇄골 앞에 옴
  const k=o.kind||'pulldown', grip=o.grip||'wide';
  const G={wide:{A:[.42,1.0,.1],B:[.40,.47,.2],bA:[.9,-1,-.4],bB:[.8,-1,-.7]},
           close:{A:[.13,1.0,.12],B:[.13,.42,.22],bA:[.3,-1,-.2],bB:[.3,-1,-.8]},
           chin:{A:[.17,1.0,.08],B:[.17,.44,.2],bA:[.3,-1,.2],bB:[.3,-1,-.3]}}[k!=='pulldown'&&grip==='close'?'chin':grip]||null;
  const g=G||{A:[.42,1.0,.1],B:[.40,.47,.2],bA:[.9,-1,-.4],bB:[.8,-1,-.7]};
  let A={t:-3,arms:{ua:[160,10],fa:[170,10]}},B={t:k==='pulldown'?-16:-14,arms:{ua:[40,-30],fa:[150,30]}};
  let anchor,cam={yaw:38,pitch:6,target:[0,1.25,0]};
  if(k==='pulldown'){A.legs=B.legs={th:W(88,90),sh:W(8,-90)};anchor={type:'pelvis',at:[0,.58,0]};}
  else {A.legs=B.legs=k==='assist'?{th:[92,90],sh:[2,-90]}:{th:[18,90],sh:[70,-90]};anchor={type:'hands',at:[0,2.45,0]};cam.target=[0,1.55,0];cam.span=2.8;}
  const ik=armIK(g.A,g.B,g.bA,g.bB);
  return {A,B,ik,anchor,cam,noPhys:k!=='pulldown',props:(J)=>{const out=[];
    if(k==='pulldown'){const m=mid(J.haL,J.haR);out.push(PR.cap(add(J.haL,mul(norm(sub(J.haL,J.haR)),.12)),add(J.haR,mul(norm(sub(J.haR,J.haL)),.12)),.018,'metal'),...PR.cable([0,2.3,.12],m),...PR.seat([0,.44,.04]),PR.pad(add(J.knL,[0,.08,.02]),add(J.knR,[0,.08,.02]),.05),...PR.stack([0,0,.62],2.4),PR.cap([0,2.4,.62],[0,2.3,.12],.03,'frame'));}
    else{out.push(PR.cap([.7,2.45,0],[-.7,2.45,0],.022,'metal'),PR.cap([.7,0,0],[.7,2.45,0],.03,'frame'),PR.cap([-.7,0,0],[-.7,2.45,0],.03,'frame'));if(k==='assist')out.push(...PR.box(add(mid(J.knL,J.knR),[0,-.07,0]),[.42,.06,.3],null,'pad'),PR.cap(add(mid(J.knL,J.knR),[0,-.1,0]),[0,0,-.2],.03,'frame'));}
    return out;}};
}
function straightPull(o){
  const A={t:22,arms:{ua:[140,90],fa:[140,90]},legs:{th:[10,90],sh:[10,-90]}}, B={t:22,arms:{ua:[12,-60],fa:[12,-60]},legs:A.legs};
  return {A,B,anchor:{type:'feet',at:[0,.08,0]},cam:{yaw:80,pitch:8,target:[0,1.1,0]},props:J=>[...PR.cable([0,2.1,.75],mid(J.haL,J.haR)),PR.cap(J.haL,J.haR,.018,'metal'),...PR.stack([0,0,.85],2.2)]};
}
function pullover(o){
  if(o.tool==='machine'){const A={rp:-6,arms:{ua:[170,40],fa:[150,80]},legs:{th:W(88,90),sh:W(8,-90)}},B={rp:-6,arms:{ua:[30,-20],fa:[100,90]},legs:A.legs};
    return {A,B,anchor:{type:'pelvis',at:[0,.58,0]},cam:{yaw:75,pitch:10,target:[0,1.1,0]},props:(J,st)=>[...PR.seatBack(st.JA,.13,.75,.36),...PR.seat([0,.44,.04]),PR.cap(J.elL,J.elR,.04,'pad'),...PR.stack([0,0,-.7])]};}
  const A={rp:-90,arms:{ua:[160,-88],fa:[158,-88]},legs:{th:W(78,90),sh:W(0,0)}}, B={rp:-90,arms:{ua:[96,90],fa:[96,90]},legs:A.legs};
  return {A,B,anchor:{type:'pelvis',at:[0,BENCHY,.28]},cam:{yaw:80,pitch:20,target:[0,.8,-.2]},props:J=>[...PR.bench([0,0,-.05],1.25),...PR.dumbbell(mid(J.haL,J.haR),[0,1,0].map((v,i)=>i===1?1:0))]};
}
function row(o){
  const k=o.kind||'cable';
  let A,B,anchor,cam={yaw:80,pitch:10,target:[0,.85,0]},legs;
  if(k==='cable'||k==='machine'||k==='low'){
    const lean=k==='cable';
    A={t:lean?22:2,arms:{ua:[78,90],fa:[78,92]}};B={t:lean?-6:-2,arms:{ua:[34,-76],fa:[96,96]}};
    if(o.grip==='wide'){A.arms={ua:[86,60],fa:[86,80]};B.arms={ua:[86,-30],fa:[88,80]};}
    legs=k==='cable'?{th:W(84,90),sh:W(78,90),ft:W(170,90)}:{th:W(88,90),sh:W(8,-90)};
    anchor={type:'pelvis',at:[0,k==='cable'?.42:.58,0]};
  }
  if(k==='bent'||k==='tbar'||k==='pendlay'){
    A={t:58,arms:{ua:W(2,0),fa:W(0,0)}};B={t:58,arms:{ua:[30,-90],fa:W(2,0)}};legs={th:[24,90],sh:[18,-90]};anchor={type:'feet',at:[0,.08,0]};
    if(k==='tbar'){A.arms={ua:W(2,30),fa:W(0,60)};B.arms={ua:[28,-80],fa:W(4,90)};}
  }
  if(k==='chestpad'){A={rp:0,t:40,arms:{ua:W(4,90),fa:W(2,90)}};B={rp:0,t:40,arms:{ua:[28,-88],fa:W(8,90)}};legs={th:[60,90],sh:[30,-90]};anchor={type:'feet',at:[0,.08,0]};}
  if(k==='onearm'){A={t:78,R:{ua:W(2,0),fa:W(0,0)},L:{ua:W(4,90),fa:W(2,90)}};B={t:78,R:{ua:[28,-92],fa:W(4,10)},L:A.L};legs={L:{th:[32,90],sh:[22,-90]},R:{th:[6,-60],sh:[0,0]}};anchor={type:'feet',at:[0,.08,0]};}
  if(legs.L){A.L={...A.L,...legs.L};A.R={...A.R,...legs.R};B.L={...B.L,...legs.L};B.R={...B.R,...legs.R};}else A.legs=B.legs=legs;
  return {A,B,anchor,cam,props:(J)=>{const out=[];const m=mid(J.haL,J.haR);
    if(k==='cable'){out.push(...PR.cable([0,.45,1.25],m),PR.cap(J.haL,J.haR,.02,'metal'),...PR.box([0,.2,0],[.32,.4,1.5],null,'pad'),...PR.box([0,.2,.9],[.4,.4,.06],null,'frame'),...PR.stack([0,0,1.35]));}
    if(k==='machine'||k==='low'){out.push(...PR.seat([0,.44,.04]),...PR.box(add(J.chest,[0,-.04,.2]),[.16,.32,.06],null,'pad'),PR.cap(add(J.chest,[0,-.2,.24]),[0,.3,.45],.03,'frame'));for(const s of ['L','R'])out.push(PR.cap(add(J['ha'+s],[0,-.07,0]),add(J['ha'+s],[0,.07,0]),.022,'metal'),PR.cap(J['ha'+s],add(J['ha'+s],[0,-.3,.4]),.03,'frame'));}
    if(k==='bent'||k==='pendlay')out.push(...PR.barbell(J.haL,J.haR,.45));
    if(k==='tbar'){out.push(PR.cap(m,[0,.05,-1.1],.02,'metal'),PR.disc(add(m,[0,0,.18]),[0,-.3,1],.18,'plate'),PR.cap(add(m,[.18,0,0]),add(m,[-.18,0,0]),.018,'metal'));}
    if(k==='chestpad'){out.push(...PR.box(add(J.chest,mul(norm(mv(J.Rt,[0,0,1])),.17)),[.34,.42,.08],[[1,0,0],norm(mv(J.Rt,[0,1,0])),norm(mv(J.Rt,[0,0,1]))],'pad'),PR.cap(J.haL,J.haR,.02,'metal'),PR.cap(m,add(m,[0,-.4,-.4]),.03,'frame'));}
    if(k==='onearm'){out.push(...PR.dumbbell(J.haR,[0,0,1]),...PR.bench([.05,0,.75],1.0));}
    return out;}};
}
function facepull(o){
  const A={arms:{ua:[86,88],fa:[86,88]},legs:{th:[0,0],sh:[0,0]}}, B={arms:{ua:[94,-12],fa:[158,64]},legs:A.legs};
  return {A,B,anchor:{type:'feet',at:[0,.08,0]},cam:{yaw:50,pitch:14,target:[0,1.25,0]},props:J=>[...PR.cable([0,1.65,1.1],mid(J.haL,J.haR)),PR.line(J.haL,J.haR,'metal',3),...PR.stack([0,0,1.2],2)]};
}
function squat(o){
  const k=o.kind||'back';
  let A={t:0,legs:{th:[0,0],sh:[0,0]}},B={t:42,legs:{th:[100,70],sh:[36,-82]}};
  let arms={ua:[42,-48],fa:[148,-72]};
  if(k==='front'){arms={ua:[90,86],fa:[160,-90]};B.t=18;B.legs={th:[106,72],sh:[40,-84]};}
  if(k==='goblet'){arms={ua:[38,80],fa:[146,150]};B.t=20;B.legs={th:[108,66],sh:[38,-82]};}
  if(k==='belt'){arms={ua:[40,90],fa:[40,90]};B.t=12;}
  if(k==='hack'||k==='pend'||k==='vsq'){A={rp:-22,t:0,legs:{th:W(25,90),sh:W(18,90)}};B={rp:-30,t:0,legs:{th:W(105,88),sh:W(20,-60)}};arms={ua:[18,30],fa:[160,60]};}
  if(k==='sissy'){}
  A.arms=B.arms=arms;
  const ik=(k==='back'||k==='smith')?armIK([.31,.47,-.11],[.31,.47,-.11],[.3,-1,-.5]):k==='front'?armIK([.17,.44,.17],[.17,.44,.17],[.3,.1,1]):null;
  const anchor={type:'feet',at:[0,.08,k==='hack'||k==='pend'||k==='vsq'?.35:0]};
  return {A,B,anchor,ik,cam:{yaw:72,pitch:10,target:[0,.95,0]},props:(J,st)=>{const out=[];
    if(k==='back'||k==='smith')out.push(...PR.barbell(J.haL,J.haR,.45));
    if(k==='front')out.push(...PR.barbell(J.haL,J.haR,.5));
    if(k==='goblet')out.push(...PR.dumbbell(add(mid(J.haL,J.haR),[0,-.04,.03]),[0,1,0]));
    if(k==='smith')out.push(PR.cap([.72,0,-.08],[.72,2.2,-.08],.03,'frame'),PR.cap([-.72,0,-.08],[-.72,2.2,-.08],.03,'frame'));
    if(k==='belt'){out.push(PR.line(J.pelvis,[0,.25,0],'metal',2),...PR.box([0,.06,0],[.9,.12,.6],null,'frame'));}
    if(k==='hack'||k==='pend'||k==='vsq'){out.push(...PR.seatBack(J,.14,.95,.4),...PR.box([0,.08,.42],[.7,.08,.5],[[1,0,0],norm([0,1,.3]),norm([0,-.3,1])],'frame'));for(const s of ['L','R'])out.push(PR.cap(add(J['sh'+s],[0,.05,0]),add(J['sh'+s],[0,.05,.12]),.045,'pad'));out.push(PR.cap([.4,.1,.35],[.4,1.9,-.3],.03,'frame'),PR.cap([-.4,.1,.35],[-.4,1.9,-.3],.03,'frame'));}
    return out;}};
}
function legpress(o){
  const calf=o.calf;
  const ik=(p,loc,s)=>{};
  // 등받이 45°, 발판이 45° 레일을 따라 움직임
  const A={rp:-58,t:0,arms:{ua:[20,40],fa:[30,80]},legs:{th:W(148,90),sh:W(62,90),ft:W(150,90)}};
  const B={rp:-58,t:0,arms:A.arms,legs:{th:W(138,90),sh:W(134,90),ft:W(150,90)}};
  if(calf){A.legs={th:W(136,90),sh:W(134,90),ft:W(165,90)};B.legs={th:W(136,90),sh:W(134,90),ft:W(115,90)};}
  return {A,B,anchor:{type:'pelvis',at:[0,.45,0]},cam:{yaw:82,pitch:12,target:[0,.8,.4]},props:(J,st)=>{const out=[...PR.seatBack(st.JA,.13,.8,.42),...PR.seat([0,.36,.02],.4,.4)];
    const ft=mid(J.toeL,J.toeR),an=mid(J.anL,J.anR);const n=norm([0,1,1]);
    out.push(...PR.box(add(mid(ft,an),mul(n,-.02)),[.6,.6,.05],[[1,0,0],norm([0,1,-1]),n],'frame'));
    out.push(PR.cap([.42,.2,.3],[.42,1.6,1.7],.03,'frame'),PR.cap([-.42,.2,.3],[-.42,1.6,1.7],.03,'frame'));return out;}};
}
function hinge(o){
  const k=o.kind||'dl';
  let A,B,arms={ua:W(2,0),fa:W(0,0)};
  if(k==='dl'){A={t:66,legs:{th:[70,84],sh:[24,-90]}};B={t:0,legs:{th:[0,0],sh:[0,0]}};}
  if(k==='sumo'){A={t:48,legs:{th:[84,40],sh:[10,-40]}};B={t:0,legs:{th:[6,20],sh:[6,0]}};arms={ua:W(3,90),fa:W(0,0)};}
  if(k==='rdl'||k==='sldl'||k==='dbrdl'){A={t:0,legs:{th:[4,90],sh:[4,-90]}};B={t:78,legs:{th:[14,90],sh:[10,-90]}};}
  if(k==='gm'){A={t:0,legs:{th:[4,90],sh:[4,-90]}};B={t:75,legs:{th:[14,90],sh:[12,-90]}};arms={ua:[42,-48],fa:[148,-72]};}
  if(k==='swing'){A={t:70,legs:{th:[40,80],sh:[20,-90]},arms:{ua:W(30,-90),fa:W(35,-90)}};B={t:0,legs:{th:[0,0],sh:[0,0]},arms:{ua:W(88,90),fa:W(90,90)}};}
  if(!A.arms){A.arms=arms;B.arms=arms;}
  const flip=k==='dl'||k==='sumo'; // 데드리프트는 바닥에서 시작
  return {A:A,B:B,ik:k==='gm'?armIK([.31,.47,-.11],[.31,.47,-.11],[.3,-1,-.5]):null,anchor:{type:'feet',at:[0,.08,0]},cam:{yaw:76,pitch:10,target:[0,.85,0]},props:J=>{const out=[];
    if(k==='dl'||k==='sumo'||k==='rdl'||k==='sldl'||k==='gm')out.push(...PR.barbell(J.haL,J.haR,k==='sumo'?.35:.45));
    if(k==='dbrdl')out.push(...PR.dumbbell(J.haL,[1,0,0]),...PR.dumbbell(J.haR,[1,0,0]));
    if(k==='swing'){const m=mid(J.haL,J.haR);out.push(PR.ball(add(m,mul(norm(sub(m,mid(J.elL,J.elR))),.12)),.1,'metal'));}
    return out;}};
}
function hipthrust(o){
  // 어깨를 벤치에 걸치고 골반을 들어올림
  const A={rp:-62,t:0,arms:{ua:[40,70],fa:[60,130]},legs:{th:W(128,90),sh:W(10,-90)}};
  const B={rp:-90,t:0,arms:A.arms,legs:{th:W(92,90),sh:W(4,-90)}};
  const mach=o.tool==='machine', bridge=o.bridge;
  if(bridge){A.rp=-80;B.rp=-105;}
  return {A,B,anchor:{type:'shoulders',at:[0,bridge?.12:.48,-.25]},cam:{yaw:82,pitch:12,target:[0,.45,.15]},props:(J)=>{const out=[];
    if(!bridge)out.push(...PR.box([0,.22,-.42],[.9,.44,.36],null,'pad'));
    const hb=mid(J.hipL,J.hipR),fw=norm(mv(J.R0,[0,0,1]));
    if(bridge){}else if(mach)out.push(PR.cap(add(add(hb,mul(fw,.12)),[.3,0,0]),add(add(hb,mul(fw,.12)),[-.3,0,0]),.06,'pad'),PR.cap(add(hb,[.35,0,0]),[.35,0,.2],.03,'frame'),PR.cap(add(hb,[-.35,0,0]),[-.35,0,.2],.03,'frame'));
    else out.push(...PR.barbell(add(add(hb,mul(fw,.12)),[.2,0,0]),add(add(hb,mul(fw,.12)),[-.2,0,0]),.55));
    return out;}};
}
function lunge(o){
  const k=o.kind||'fwd';
  let A,B,anchor={type:'ankleL',at:[.09,.08,.35]};
  if(k==='split'||k==='fwd'||k==='walk'||k==='smith'){A={L:{th:[45,90],sh:[18,-90]},R:{th:[30,-90],sh:[34,-90]}};B={t:4,L:{th:[92,90],sh:[8,-90]},R:{th:[4,-90],sh:[86,-90],ft:W(10,90)}};}
  if(k==='bulg'){A={t:4,L:{th:[24,90],sh:[8,-90]},R:{th:[22,-90],sh:[100,-90],ft:W(150,-90)}};B={t:12,L:{th:[82,90],sh:[22,-90]},R:{th:[34,-90],sh:[124,-90],ft:W(150,-90)}};}
  if(k==='stepup'){A={L:{th:W(96,90),sh:W(4,-90)},R:{th:[0,0],sh:[0,0]}};B={L:{th:[0,0],sh:[0,0]},R:{th:[14,-90],sh:[30,-90]}};anchor={type:'ankleL',at:[.09,.53,.25]};}
  for(const P of [A,B]){P.arms=(o.tool==='bar'||k==='smith')?{ua:[42,-48],fa:[148,-72]}:{ua:[6,4],fa:[4,8]};}
  const keepY=k==='bulg'?['R']:k==='stepup'?['L']:['R'];
  const free=k==='stepup'?['R']:null, plantFix=k==='bulg'?(T=>{T.R=[T.R[0],.5,T.L[2]-.82];}):null, balance=k==='bulg'?false:undefined;
  const supportW=k==='bulg'?[.8]:k==='stepup'?(s=>.15+.8*s):[.55];
  return {A,B,anchor,keepY,supportW,plantFix,balance,free,cam:{yaw:80,pitch:10,target:[0,.85,0]},props:J=>{const out=[];
    if(o.tool==='db')out.push(...PR.dumbbell(J.haL,[0,0,1]),...PR.dumbbell(J.haR,[0,0,1]));
    if(o.tool==='bar'||k==='smith')out.push(...PR.barbell(J.haL,J.haR,.45));
    if(k==='smith')out.push(PR.cap([.72,0,.1],[.72,2.2,.1],.03,'frame'),PR.cap([-.72,0,.1],[-.72,2.2,.1],.03,'frame'));
    if(k==='bulg')out.push(...PR.bench([-.09,0,-.62],.5));
    if(k==='stepup')out.push(...PR.box([0,.22,.25],[.7,.44,.5],null,'pad'));
    return out;}};
}
function legext(o){
  const A={rp:-12,arms:{ua:[18,20],fa:[20,40]},legs:{th:W(90,90),sh:W(12,-90)}}, B={rp:-12,arms:A.arms,legs:{th:W(92,90),sh:W(92,90)}};
  return {A,B,anchor:{type:'pelvis',at:[0,.6,0]},cam:{yaw:82,pitch:10,target:[0,.7,.3]},props:(J,st)=>[...PR.seatBack(st.JA,.13,.7,.4),...PR.seat([0,.46,.12]),PR.pad(add(J.anL,[.05,0,.06]),add(J.anR,[-.05,0,.06]),.055),PR.cap(J.knL.map((v,i)=>i===0?.32:v),add(mid(J.anL,J.anR),[.32,0,.06]),.025,'frame'),...PR.stack([.6,0,-.2])]};
}
function legcurl(o){
  if(o.kind==='lying'){
    const A={rp:84,arms:{ua:W(0,0),fa:W(90,90)},legs:{th:[0,0],sh:[0,0],ft:W(30,-90)}}, B={rp:84,arms:A.arms,legs:{th:[2,0],sh:[118,-90],ft:W(30,-90)}};
    return {A,B,anchor:{type:'pelvis',at:[0,.72,0]},cam:{yaw:84,pitch:14,target:[0,.6,0]},props:J=>[...PR.box([0,.6,.2],[.36,.08,1.1],[[1,0,0],norm([0,1,-.12]),norm([0,.12,1])],'pad'),PR.pad(add(J.anL,[.05,.06,0]),add(J.anR,[-.05,.06,0]),.055),PR.cap([0,0,.3],[0,.55,.3],.04,'frame'),...PR.stack([.6,0,-.6])]};
  }
  const A={rp:-14,arms:{ua:[18,20],fa:[20,40]},legs:{th:W(90,90),sh:W(88,90)}}, B={rp:-14,arms:A.arms,legs:{th:W(90,90),sh:W(20,-90)}};
  return {A,B,anchor:{type:'pelvis',at:[0,.6,0]},cam:{yaw:82,pitch:10,target:[0,.7,.3]},props:(J,st)=>[...PR.seatBack(st.JA,.13,.7,.4),...PR.seat([0,.46,.12]),PR.pad(add(J.anL,[.05,.06,-.02]),add(J.anR,[-.05,.06,-.02]),.055),PR.pad(add(J.knL,[.05,.1,-.05]),add(J.knR,[-.05,.1,-.05]),.05),...PR.stack([.6,0,-.2])]};
}
function calf(o){
  const k=o.kind||'stand';
  if(k==='seated'){const A={arms:{ua:[20,60],fa:[40,90]},legs:{th:W(90,90),sh:W(0,0),ft:W(95,90)}},B={...A,legs:{th:W(96,90),sh:W(0,0),ft:W(35,90)}};
    return {A,B,anchor:{type:'toes',at:[0,.12,.55]},cam:{yaw:80,pitch:10,target:[0,.6,.2]},props:J=>[...PR.seat([0,.42,0]),PR.pad(add(J.knL,[.05,.08,0]),add(J.knR,[-.05,.08,0]),.05),...PR.box([0,.06,.55],[.5,.12,.2],null,'frame')]};}
  const A={arms:{ua:k==='db'?[4,10]:[40,-40],fa:k==='db'?[3,20]:[150,-70]},legs:{th:[0,0],sh:[0,0],ft:W(92,90)}}, B={...A,legs:{th:[0,0],sh:[0,0],ft:W(30,90)}};
  return {A,B,anchor:{type:'toes',at:[0,.14,.1]},cam:{yaw:80,pitch:6,target:[0,.9,0]},props:J=>{const out=[...PR.box([0,.06,.12],[.5,.12,.22],null,'frame')];
    if(k==='stand'){for(const s of ['L','R'])out.push(PR.cap(add(J['sh'+s],[0,.06,-.06]),add(J['sh'+s],[0,.06,.1]),.05,'pad'));out.push(PR.cap([.35,.0,-.2],[.35,J.shL[1]+.06,-.2],.03,'frame'),PR.cap([-.35,0,-.2],[-.35,J.shL[1]+.06,-.2],.03,'frame'));}
    if(k==='db')out.push(...PR.dumbbell(J.haL,[0,0,1]),...PR.dumbbell(J.haR,[0,0,1]));
    if(k==='smith')out.push(...PR.barbell(J.haL,J.haR,.45));return out;}};
}
function hipab(o){
  const ab=o.kind!=='add';
  const A={rp:-14,arms:{ua:[16,30],fa:[20,50]},legs:{th:W(90,ab?88:58),sh:W(4,ab?-90:-60)}}, B={rp:-14,arms:A.arms,legs:{th:W(90,ab?52:88),sh:W(4,ab?-50:-90)}};
  return {A,B,anchor:{type:'pelvis',at:[0,.6,0]},cam:{yaw:15,pitch:30,target:[0,.6,.2]},props:(J,st)=>[...PR.seatBack(st.JA,.13,.75,.4),...PR.seat([0,.46,.12]),PR.pad(add(J.knL,[ab?.07:-.07,0,0]),add(J.knL,[ab?.07:-.07,-.2,0]),.045),PR.pad(add(J.knR,[ab?-.07:.07,0,0]),add(J.knR,[ab?-.07:.07,-.2,0]),.045),...PR.stack([0,0,-.7])]};
}
function kickback(o){
  const A={t:45,arms:{ua:[70,90],fa:[70,90]},L:{th:[8,90],sh:[4,-90]},R:{th:[34,90],sh:[64,-90]}}, B={t:45,arms:A.arms,L:A.L,R:{th:[42,-90],sh:[48,-90]}};
  return {A,B,free:['R'],supportW:[1],anchor:{type:'ankleL',at:[.1,.08,0]},cam:{yaw:84,pitch:10,target:[0,.85,0]},props:J=>o.tool==='cable'?[...PR.cable([-.1,.15,.9],J.anR),...PR.stack([-.1,0,1]),PR.cap(J.haL,J.haR,.025,'metal'),PR.cap(mid(J.haL,J.haR),[-.1,mid(J.haL,J.haR)[1],.95],.025,'frame')]:[...PR.box(add(J.chest,mul(norm(mv(J.Rt,[0,0,1])),.16)),[.36,.36,.08],[[1,0,0],norm(mv(J.Rt,[0,1,0])),norm(mv(J.Rt,[0,0,1]))],'pad'),PR.pad(add(J.knR,[.06,-.05,-.08]),add(J.knR,[-.06,-.05,-.08]),.045),PR.cap(mid(J.haL,J.haR),[0,.3,.5],.03,'frame')]};
}
function ab(o){
  const k=o.kind||'crunch';
  if(k==='crunch'){const A={rp:-90,t:0,arms:{ua:[150,60],fa:[160,-40]},legs:{th:W(135,90),sh:W(30,90)}},B={...A,t:38};return {A,B,anchor:{type:'pelvis',at:[0,.12,0]},cam:{yaw:82,pitch:16,target:[0,.3,-.1]},props:()=>[...PR.box([0,.01,-.1],[.7,.02,1.7],null,'pad')]};}
  if(k==='cable'){const A={t:12,arms:{ua:[140,70],fa:[150,-80]},legs:{th:W(0,0),sh:W(90,-90),ft:W(150,-90)}},B={...A,t:72};return {A,B,anchor:{type:'knees',at:[0,.06,0]},cam:{yaw:82,pitch:10,target:[0,.7,0]},props:J=>[...PR.cable([0,2.1,.55],mid(J.haL,J.haR)),...PR.stack([0,0,.62],2.2)]};}
  if(k==='machine'){const A={rp:-6,t:-4,arms:{ua:[30,90],fa:[118,-70]},legs:{th:W(88,90),sh:W(8,-90)}},B={...A,t:40};return {A,B,anchor:{type:'pelvis',at:[0,.58,0]},cam:{yaw:82,pitch:10,target:[0,.95,0]},props:(J,st)=>[...PR.seat([0,.44,.04]),...PR.seatBack(J,.13,.72,.36),PR.cap(J.haL,J.haR,.03,'pad'),...PR.stack([0,0,-.75])]};}
  if(k==='hang'||k==='captain'){const cap=k==='captain';const A={arms:cap?{ua:[4,-90],fa:[90,90]}:{ua:[176,0],fa:[176,0]},legs:{th:[2,90],sh:[2,90]}},B={arms:A.arms,legs:cap?{th:[105,90],sh:[18,-90]}:{th:[96,90],sh:[96,90]},t:cap?0:-6};
    return {A,B,anchor:cap?{type:'elbows',at:[0,1.25,0]}:{type:'hands',at:[0,2.25,0]},cam:{yaw:78,pitch:6,target:[0,cap?1.0:1.35,0],span:cap?2.5:2.9},props:J=>cap?[...PR.box([0,1.0,-.18],[.4,.8,.08],null,'pad'),PR.cap([.25,1.25,-.15],[.25,1.25,.2],.04,'pad'),PR.cap([-.25,1.25,-.15],[-.25,1.25,.2],.04,'pad'),PR.cap([.25,0,-.2],[.25,1.6,-.2],.03,'frame'),PR.cap([-.25,0,-.2],[-.25,1.6,-.2],.03,'frame')]:[PR.cap([.7,2.25,0],[-.7,2.25,0],.022,'metal')]};}
  if(k==='twist'){const A={rp:-4,tw:-38,arms:{ua:[70,80],fa:[70,100]},legs:{th:W(88,90),sh:W(8,-90)}},B={...A,tw:38};return {A,B,anchor:{type:'pelvis',at:[0,.58,0]},cam:{yaw:20,pitch:30,target:[0,1,0]},props:J=>[...PR.seat([0,.44,.04]),PR.cap(J.haL,J.haR,.03,'pad')]};}
  if(k==='backext'){const A={rp:42,t:58,arms:{ua:[150,80],fa:[160,-60]},legs:{th:[0,0],sh:[0,0],ft:W(60,90)}},B={...A,t:0};
    return {A,B,anchor:{type:'pelvis',at:[0,1.0,0]},cam:{yaw:84,pitch:8,target:[0,.8,-.2]},props:J=>[...PR.box(add(J.pelvis,mul(norm(mv(J.R0,[0,0,1])),.14)),[.4,.32,.08],[[1,0,0],norm(mv(J.R0,[0,1,0])),norm(mv(J.R0,[0,0,1]))],'pad'),PR.pad(add(mid(J.anL,J.anR),[.12,.05,-.06]),add(mid(J.anL,J.anR),[-.12,.05,-.06]),.045),PR.cap([0,0,-.6],add(mid(J.anL,J.anR),[0,-.05,0]),.03,'frame'),PR.cap([0,0,-.6],add(J.pelvis,[0,-.15,.1]),.03,'frame')]};}
  if(k==='rollout'){const A={rp:55,t:0,arms:{ua:W(10,90),fa:W(10,90)},legs:{th:W(0,0),sh:W(90,-90),ft:W(150,-90)}},B={rp:80,t:0,arms:{ua:W(80,90),fa:W(80,90)},legs:{th:W(60,-90),sh:W(90,-90),ft:W(150,-90)}};return {A,B,anchor:{type:'knees',at:[0,.06,-.3]},cam:{yaw:82,pitch:10,target:[0,.4,.2]},props:J=>[PR.disc(mid(J.haL,J.haR),[1,0,0],.09,'plate'),PR.cap(J.haL,J.haR,.02,'metal')]};}
}
/* 유산소 (주기형) */
function cardio(o){
  const k=o.kind;
  if(k==='walk'||k==='run'||k==='stair'||k==='ellip'){
    const amp=k==='run'?38:k==='stair'?0:24;
    return {at:ph=>{const a=ph*Math.PI*2;const sw=Math.sin(a);
      const leg=(s)=>{const x=s*sw; if(k==='stair'){const up=Math.max(0,Math.sin(a+(s>0?0:Math.PI)));return {th:[25+55*up,90],sh:[-10+(25+55*up)-70*up,90]};}
        const th=amp*x+(k==='ellip'?8:0); const flex=(k==='run'?55:25)*Math.max(0,Math.sin(a+(s>0?-1.2:Math.PI-1.2))); return {th:[th,90],sh:[th-flex-4,90]};};
      const armSw=(s)=>{const x=-s*sw*(k==='run'?40:k==='ellip'?25:20);return k==='stair'?{ua:[30,80],fa:[80,90]}:{ua:[x,90],fa:[x+(k==='run'?85:k==='ellip'?60:15),90]};};
      return {t:k==='run'?10:k==='stair'?18:4,L:{...leg(1),...armSw(1)},R:{...leg(-1),...armSw(-1)}};},
      anchor:{type:'floor',at:[0,0,0]},cam:{yaw:72,pitch:8,target:[0,.95,0]},props:J=>{
        if(k==='stair'){const out=[];for(let i=0;i<5;i++)out.push(...PR.box([0,.03+i*.2,.05+i*.24],[.6,.06,.26],null,'frame'));out.push(PR.cap([.4,0,.6],[.4,1.4,.2],.03,'frame'),PR.cap([-.4,0,.6],[-.4,1.4,.2],.03,'frame'));return out;}
        if(k==='ellip')return [PR.cap([.3,0,.6],[.3,1.4,.6],.03,'frame'),PR.cap(J.haL,[.3,1.0,.55],.025,'metal'),PR.cap(J.haR,[-.3,1.0,.55],.025,'metal'),...PR.box([0,.05,0],[.6,.08,1.5],null,'frame')];
        return [...PR.box([0,.02,0],[.7,.06,1.8],null,'frame'),PR.cap([.36,0,.85],[.36,1.15,.75],.03,'frame'),PR.cap([-.36,0,.85],[-.36,1.15,.75],.03,'frame'),...PR.box([0,1.2,.75],[.8,.2,.1],null,'metal')];
      }};
  }
  if(k==='bike'){
    const hip=[0,.95,-.12], crank=[0,.32,.28], cr=.17;
    return {at:ph=>({t:28,arms:{ua:[72,90],fa:[80,92]},L:{},R:{}}),anchor:{type:'pelvis',at:hip},
      ik:(p,loc,ph)=>{for(const [k2,s,off] of [['L',1,0],['R',-1,Math.PI]]){const a=ph*Math.PI*2+off;const tgt=[s*.1,crank[1]+Math.sin(a)*cr+.05,crank[2]+Math.cos(a)*cr];const hp=[s*L.hipX,hip[1]-.07,hip[2]];const r=ik2(hp,tgt,L.th,L.sh,[0,0,1]);loc[k2].th=r.d1;loc[k2].sh=r.d2;loc[k2].ft=norm([0,-.35,1]);}},
      cam:{yaw:78,pitch:10,target:[0,.85,.1]},props:J=>[...PR.seat([0,hip[1]-.12,hip[2]],.22,.28),PR.cap([0,0,-.2],[0,hip[1]-.15,hip[2]],.04,'frame'),PR.cap([0,0,.2],crank,.04,'frame'),PR.cap(crank,[0,1.15,.45],.04,'frame'),PR.cap([.22,1.18,.42],[-.22,1.18,.42],.025,'metal'),PR.disc(crank,[1,0,0],.2,'metal'),PR.cap(add(J.toeL,[0,0,-.06]),add(J.toeL,[.06,0,-.06]),.03,'metal')]};
  }
  if(k==='row'){
    const A={t:22,pos:[0,.42,.15],arms:{ua:[80,90],fa:[80,92]}},B={t:-18,pos:[0,.42,-.42],arms:{ua:[34,-74],fa:[100,96]}};
    const foot=[0,.28,.7];
    const ik=(p,loc)=>{const R0=frames(p).R0;for(const [k2,s] of [['L',1],['R',-1]]){const hp=add(p.pos,mv(R0,[s*L.hipX,-.07,0]));const r=ik2(hp,[s*.12,foot[1],foot[2]],L.th,L.sh,[0,1,0]);loc[k2].th=mtv(R0,r.d1);loc[k2].sh=mtv(R0,r.d2);loc[k2].ft=mtv(R0,norm([0,.9,.4]));}};
    return {A,B,ik,anchor:{type:'pelvis',at:[0,.42,0]},cam:{yaw:82,pitch:10,target:[0,.6,.1]},props:J=>[...PR.box([0,.15,0],[.2,.1,2.2],null,'frame'),...PR.box([J.pelvis[0],.33,J.pelvis[2]],[.32,.07,.3],null,'pad'),...PR.box([0,.3,.78],[.4,.3,.04],[[1,0,0],norm([0,1,.5]),norm([0,-.5,1])],'frame'),PR.cap(J.haL,J.haR,.02,'metal'),PR.line(mid(J.haL,J.haR),[0,.45,1.05],'metal',1.4),PR.disc([0,.45,1.15],[1,0,0],.22,'metal')]};
  }
}
function ik2(hip,tgt,a,b,bend){
  let d=sub(tgt,hip);let dl=len(d);dl=Math.min(dl,a+b-.001);const u=norm(d);
  const cosA=(a*a+dl*dl-b*b)/(2*a*dl);const sinA=Math.sqrt(Math.max(0,1-cosA*cosA));
  let n=sub(bend,mul(u,dot(bend,u)));n=norm(n);
  const knee=add(hip,add(mul(u,a*cosA),mul(n,a*sinA)));const ank=add(hip,mul(u,dl));
  return {d1:norm(sub(knee,hip)),d2:norm(sub(ank,knee))};
}
/* 손 목표점 기반 팔 IK (몸통 좌표, x는 왼쪽 기준) */
function armIK(TA,TB,bA,bB,curve){
  return (p,loc,s)=>{for(const [k,side] of [['L',1],['R',-1]]){
    const c=curve?curve(s):null; // 축마다 다른 진행도 → 직선이 아닌 궤적(예: 벤치프레스 J-커브)
    const t=c?[lerp(TA[0],TB[0],c[0]),lerp(TA[1],TB[1],c[1]),lerp(TA[2],TB[2],c[2])]:lerpV(TA,TB,s), b=lerpV(bA,bB||bA,s);
    const sh=[side*L.shX,L.shY+(p.scap||0),0];
    const r=ik2(sh,[side*t[0],t[1],t[2]],L.ua,L.fa,norm([side*b[0],b[1],b[2]]));
    loc[k].ua=r.d1;loc[k].fa=r.d2;}};
}
const PAT={press,fly,ohp,raise,curl,triceps,dip,pushup,plank,vpull,straightPull,pullover,row,facepull,squat,legpress,hinge,hipthrust,lunge,legext,legcurl,calf,hipab,kickback,ab,cardio};
// cardio 'ik' 함수가 R 기준이 아닌 월드 벡터를 줄 때(자전거) 처리
for(const n of ['cardio']){const f=PAT[n];PAT[n]=o=>{const P=f(o);if(o.kind==='bike'){const ik0=P.ik;P.ik=(p,loc,ph)=>{ik0(p,loc,ph);const R0=frames(p).R0;for(const k of ['L','R'])for(const m of ['th','sh','ft'])loc[k][m]=mtv(R0,loc[k][m]);};}return P;};}

/* ---------- 뷰어 ---------- */
function viewer(canvas,ex,opts={}){
  let glr=null; try{ if(opts.gl!==false&&typeof FIGGL!=='undefined') glr=FIGGL.create(canvas); }catch(e){glr=null;}
  const ctx=glr?null:canvas.getContext('2d'); const rig=makeRig(ex.anim,ex);
  const JA=rig.cycle?rig.at(0):rig.at(0);
  const POST=new Set(['tri','lats','rdelt','ham','glute','calf','erect','traps','rhom','abd']);
  const prim=ex.prim||[]; const noRot=['legcurl','legpress','hipab','legext','hipthrust','kickback'].includes(ex.anim.p)||(ex.anim.o&&ex.anim.o.kind==='seated');
  const back=!noRot&&prim.length&&prim.filter(m=>POST.has(m)).length>prim.length/2;
  const baseYaw=back?rig.P.cam.yaw+(rig.P.cam.yaw>=0&&rig.P.cam.yaw<90?140:90):rig.P.cam.yaw;
  const camY=ex.cam?ex.cam[0]:baseYaw, camP=ex.cam?ex.cam[1]:rig.P.cam.pitch;
  const view={yaw:camY,pitch:camP,target:rig.P.cam.target,dist:4.2,span:(rig.P.cam.span||2.5)*1.02};
  const musc={};(ex.prim||[]).forEach(m=>musc[m]=1);(ex.sec||[]).forEach(m=>{if(!musc[m])musc[m]=2;});
  let playing=opts.autoplay!==false, speed=1, t0=performance.now(), tAcc=0, raf=0, last=performance.now(), alive=true;
  let pal=palette(canvas), body=null; const NOMUSC={};
  if(glr&&opts.body!==false) BODY.load().then(()=>{ dirty=true; if(alive&&!playing) frame(phase(tAcc)); });
  // 템포: 단축성(들어 올리는) 구간은 빠르게 출발해 정점에서 감속, 신장성(내리는) 구간은 더 길게 버티며 내린다.
  // 케이블·머신 고립 운동은 정점 수축에서 조금 더 멈춘다.
  // 시작 자세(A)→끝 자세(B)가 '내리는(신장성)' 구간인 운동. 전 운동의 A→B 높이 변화를 표로 뽑아 확인한 규칙:
  // 스쿼트·런지·푸시업·딥스·RDL·굿모닝·롤아웃은 A가 선 자세, 그 밖(스텝업·케틀벨 스윙·레그프레스 포함)은 A가 늘어난 시작 자세
  const ak=(ex.anim.o||{}).kind, ap=ex.anim.p;
  const ECC_AB=ap==='squat'||ap==='pushup'||ap==='dip'||(ap==='lunge'&&ak!=='stepup')||(ap==='hinge'&&['rdl','sldl','dbrdl','gm'].includes(ak))||(ap==='ab'&&ak==='rollout');
  const iso=!ex.compound&&/머신|케이블/.test(ex.cat||'');
  const tCon=1.05,tEcc=1.55,hPeak=iso?.5:.3,hStretch=.22;
  // A→B가 신장성이면 [A 유지, 내리기, B(최저점) 유지, 올리기] 순서
  const seg=ECC_AB?[hPeak*.6,tEcc,hStretch,tCon]:[hStretch,tCon,hPeak,tEcc];
  const T=seg[0]+seg[1]+seg[2]+seg[3];
  const eCon=x=>1-Math.pow(1-x,2.2)*(1-.25*x), eEcc=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
  function phase(t){ if(rig.cycle) return (t/1.6)%1; let u=t%T;
    if(u<seg[0]) return 0; u-=seg[0];
    if(u<seg[1]) return (ECC_AB?eEcc:eCon)(u/seg[1]); u-=seg[1];
    if(u<seg[2]) return 1; u-=seg[2];
    return 1-(ECC_AB?eCon:eEcc)(u/seg[3]);}
  function frame(s){
    const dpr=Math.min(2,window.devicePixelRatio||1); const W=canvas.clientWidth||300,H=canvas.clientHeight||300;
    const J=rig.at(s);
    // 실제 인체 모델이 준비됐으면 몸은 모델로, 기구만 도형으로 그린다. 아니면 예전 도형 모형
    if(glr&&opts.body!==false&&!BODY.settled()) return; // 모델을 받는 중: 잠깐 빈 화면 (도형 모형이 번쩍 보였다 바뀌지 않게)
    const bm=glr&&opts.body!==false?BODY.get():null;
    drawGuides(J,W,H,dpr);
    const mu=guide.muscles?musc:NOMUSC;
    if(bm){ if(!body||body.body!==bm||body.mu!==mu) body={body:bm,mu,pose:BODY.makePoser(bm,ex),colors:BODY.colors(bm,mu,ex.uni,pal,opts.heat)};
      body.mats=body.pose(J); glr.draw(rig.P.props(J,{JA})||[],view,pal,W,H,dpr,false,body); return; }
    const items=scene(J,rig.P.props(J,{JA}),mu,ex.uni);
    if(glr){ glr.draw(items,view,pal,W,H,dpr); return; }
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    draw(ctx,W,H,items,view,pal);
  }
  /* ----- 가이드 오버레이 (2D 캔버스를 3D 위에 겹침) ----- */
  const guide={trail:true,lines:false,muscles:true};
  let ov=null,octx=null;
  if(opts.overlay&&canvas.parentElement){ ov=document.createElement('canvas'); ov.className='fig-ov'; ov.style.cssText='position:absolute;left:0;top:0;pointer-events:none;cursor:default'; canvas.parentElement.insertBefore(ov,canvas.nextSibling); octx=ov.getContext('2d'); }
  const mid3=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
  // 궤적을 그릴 점: 동작 중 가장 많이 움직이는 끝점(바·손, 다리 운동이면 발목, 그 외 골반·머리)
  const TRACK=[J=>mid3(J.haL,J.haR),J=>mid3(J.anL,J.anR),J=>J.pelvis,J=>J.head];
  let trail=null; function getTrail(){ if(trail) return trail; let best=null,bd=-1;
    // 손(바)이 의미 있게 움직이면(15cm 이상) 손의 궤적을 우선한다 — 데드리프트에서 머리가 더 많이 움직여도 보여 줄 것은 바의 경로
    const cand=TRACK.map(f=>{ const pts=[]; for(let i=0;i<=40;i++) pts.push(f(rig.at(i/40))); let d=0; for(let i=1;i<pts.length;i++) d+=len(sub(pts[i],pts[i-1])); return {pts,f,d}; });
    if(cand[0].d>=.15) best=cand[0]; else for(const c of cand){ if(c.d>bd*1.15){bd=c.d;best=c;} }
    return (trail=best); }
  function proj(p,W,H){ const Rr=Math.PI/180,yaw=view.yaw*Rr,pit=view.pitch*Rr,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
    const t=view.target||[0,.9,0],x=p[0]-t[0],y=p[1]-t[1],z=p[2]-t[2];
    const x1=x*cy-z*sy,z1=x*sy+z*cy,y1=y*cp-z1*sp,z2=y*sp+z1*cp; const d=view.dist||4.2,F=Math.min(W,H*1.15)*d/(view.span||2.5),dep=d-z2;
    return [W/2+x1*F/dep,H/2-y1*F/dep+.05*H]; }
  const angAt=(a,b,c)=>{const u=norm(sub(a,b)),v=norm(sub(c,b));return Math.acos(Math.max(-1,Math.min(1,dot(u,v))))*180/Math.PI;};
  function drawGuides(J,W,H,dpr){
    if(!octx) return; if(ov.width!==Math.round(W*dpr)||ov.height!==Math.round(H*dpr)){ov.width=Math.round(W*dpr);ov.height=Math.round(H*dpr);}
    octx.setTransform(dpr,0,0,dpr,0,0); octx.clearRect(0,0,W,H);
    const acc='rgb('+pal.prim.join(',')+')', ink=getComputedStyle(canvas).getPropertyValue('--ink')||'#222';
    if(guide.lines){
      // 발 중앙 수직선 (서서 하는 운동)
      if(STANDA.has(rig.P.anchor.type)&&!rig.P.noPhys){ const mz=(J.heelL[2]+J.toeL[2]+J.heelR[2]+J.toeR[2])/4, mx=(J.anL[0]+J.anR[0])/2; const a=proj([mx,0,mz],W,H),b=proj([mx,2.05,mz],W,H);
        octx.strokeStyle='#2f9e62';octx.lineWidth=1.5;octx.setLineDash([6,5]);octx.beginPath();octx.moveTo(a[0],a[1]);octx.lineTo(b[0],b[1]);octx.stroke();octx.setLineDash([]);
        octx.fillStyle='#2f9e62';octx.font='600 11px system-ui,sans-serif';octx.fillText('발 중앙',a[0]+5,a[1]-4); }
      // 관절 각도: 동작 중 15° 이상 변하는 관절만 (카메라 쪽 팔다리)
      const k=ex.uni||((()=>{const l=proj(J.shL,W,H),r=proj(J.shR,W,H);return view.yaw%360>0&&view.yaw%360<180?'L':'R';})());
      const JS=[['팔꿈치',Q=>[Q['sh'+k],Q['el'+k],Q['ha'+k]]],['무릎',Q=>[Q['hip'+k],Q['kn'+k],Q['an'+k]]],['고관절',Q=>[Q['sh'+k],Q['hip'+k],Q['kn'+k]]]];
      const JA0=rig.at(0),JB0=rig.at(1),JM=rig.at(.5);
      octx.font='700 12px system-ui,sans-serif';
      for(const [nm,f] of JS){ const r=[JA0,JM,JB0].map(Q=>angAt(...f(Q))); if(Math.max(...r)-Math.min(...r)<15) continue;
        const [a,b,c]=f(J); const deg=Math.round(angAt(a,b,c)); const pb=proj(b,W,H),pa=proj(a,W,H),pc=proj(c,W,H);
        const a1=Math.atan2(pa[1]-pb[1],pa[0]-pb[0]),a2=Math.atan2(pc[1]-pb[1],pc[0]-pb[0]); let da=a2-a1; while(da>Math.PI)da-=2*Math.PI; while(da<-Math.PI)da+=2*Math.PI;
        octx.strokeStyle='#1c7ed6';octx.lineWidth=2;octx.beginPath();octx.arc(pb[0],pb[1],16,a1,a2,da<0);octx.stroke();
        const am=a1+da/2,tx=pb[0]+Math.cos(am)*30,ty=pb[1]+Math.sin(am)*30; const lab=deg+'°';
        octx.fillStyle='rgba(255,255,255,.88)';const tw=octx.measureText(lab).width;octx.fillRect(tx-tw/2-3,ty-9,tw+6,16);octx.fillStyle='#1864ab';octx.textAlign='center';octx.fillText(lab,tx,ty+3);octx.textAlign='left'; }
    }
    if(guide.trail&&!rig.cycle){ const tr=getTrail(); octx.strokeStyle=acc;octx.lineWidth=2;octx.setLineDash([3,5]);octx.lineCap='round';octx.beginPath();
      tr.pts.forEach((p,i)=>{const q=proj(p,W,H); if(i)octx.lineTo(q[0],q[1]); else octx.moveTo(q[0],q[1]);}); octx.stroke();octx.setLineDash([]);
      const c=proj(tr.f(J),W,H); octx.fillStyle='#fff';octx.beginPath();octx.arc(c[0],c[1],5,0,7);octx.fill();octx.fillStyle=acc;octx.beginPath();octx.arc(c[0],c[1],3.5,0,7);octx.fill(); }
  }
  let visible=true, dirty=true;
  if(typeof IntersectionObserver!=='undefined'){ try{ const io=new IntersectionObserver(es=>{visible=es[0].isIntersecting;dirty=true;}); io.observe(canvas); }catch(e){} }
  // 화면에 안 보이거나(스크롤 밖·백그라운드 탭) 멈춘 상태에서 바뀐 게 없으면 그리지 않는다 → 배터리·메인 스레드 절약
  function loop(now){ if(!alive)return; const dt=Math.min(.1,(now-last)/1000); last=now;
    if(visible&&!document.hidden&&(playing||dirty)){ if(playing) tAcc+=dt*speed; frame(phase(tAcc)); dirty=false; }
    raf=requestAnimationFrame(loop); }
  // 드래그 회전
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw:view.yaw,pitch:view.pitch};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;dirty=true;view.yaw=drag.yaw-(e.clientX-drag.x)*.5;view.pitch=Math.max(-10,Math.min(70,drag.pitch+(e.clientY-drag.y)*.3));if(!playing)frame(phase(tAcc));});
  canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
  const reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce) speed=.5;
  raf=requestAnimationFrame(loop);
  return {
    setView(y,p){view.yaw=y;if(p!=null)view.pitch=p;frame(phase(tAcc));},
    setGuide(name,on){guide[name]=on;dirty=true;if(!playing)frame(phase(tAcc));}, guide:()=>({...guide}),
    setSpan(v,t){view.span=v;if(t)view.target=t;},
    defaultView(){view.yaw=camY;view.pitch=camP;},
    toggle(){playing=!playing;return playing;}, setSpeed(v){speed=v;}, playing:()=>playing,
    repaint(){pal=palette(canvas);body=null;},
    stop(){alive=false;cancelAnimationFrame(raf);if(ov)ov.remove();},
    frameAt(s){frame(s);}, isGL:()=>!!glr
  };
}
return {viewer,makeRig,scene,draw,palette,body:BODY};
})();

export { FIG };
