/* ============================================================
   BODY: 실제 인체 모형(해부학 모델, public/models/body.glb)
   - glb를 읽어 정점·가중치·근육 그룹을 꺼낸다
   - fig.js가 계산한 관절(J)을 뼈 24개의 변환 행렬로 바꾼다
   모델 출처: Z-Anatomy (CC BY-SA 4.0), BodyParts3D (CC BY-SA 2.1 JP). tools/model 참고.
   좌표는 fig.js와 같다: y 위, z 몸 앞, x 몸의 왼쪽.
   ============================================================ */
// tools/model/build.py의 BONES와 같은 순서
const BONES=["pelvis","lumbar","torso","head","clavL","clavR","uaL","uaR","fa0L","fa1L","fa2L","fa3L","fa0R","fa1R","fa2R","fa3R","handL","handR","thL","thR","shL","shR","ftL","ftR"];
const BI=Object.fromEntries(BONES.map((n,i)=>[n,i]));
const NFA=4;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const col=(M,j)=>[M[0][j],M[1][j],M[2][j]];
const sstep=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
/* v에서 u 방향 성분을 뺀 단위 벡터. 너무 짧으면 fb로 다시 */
function perp(v,u,fb){let w=sub(v,mul(u,dot(v,u)));if(len(w)<.15&&fb)w=sub(fb,mul(u,dot(fb,u)));return norm(w);}
/* 축 Y와 대략의 앞 방향 Z로 직교 좌표계 [X,Y,Z] */
function frameYZ(Y,Zh){const X=norm(cross(Y,Zh));return [X,Y,cross(X,Y)];}
function frameXY(Xh,Y){const X=perp(Xh,Y);return [X,Y,cross(X,Y)];}
function twist(F,ang){ // Y축 둘레로 회전
  const c=Math.cos(ang),s=Math.sin(ang),[X,Y,Z]=F;
  return [add(mul(X,c),mul(Z,-s)),Y,add(mul(X,s),mul(Z,c))];
}
const I3=[[1,0,0],[0,1,0],[0,0,1]];
// 엔진이 평지에 섰을 때의 발(뒤꿈치→발끝) 방향. 이때 모델의 발이 수평이 되게 기준으로 삼는다
const FOOT_REF=(()=>{const Z=norm([0,-.044,.206]);const Y=perp([0,1,0],Z);return [cross(Y,Z),Y,Z];})();

/* 관절 → 뼈별 좌표계 {o, F:[X,Y,Z]}. bind=true면 해부학 자세(모델 원래 자세) 기준 */
function frames(J,bind,grip){
  const R0=bind?I3:J.R0, Rt=bind?I3:J.Rt, out=new Array(BONES.length);
  const F0=[col(R0,0),col(R0,1),col(R0,2)], Ft=[col(Rt,0),col(Rt,1),col(Rt,2)];
  const fT=Ft[2], uT=Ft[1], fR=F0[2];
  const Ym=norm(add(F0[1],Ft[1])), Fm=frameYZ(Ym,norm(add(F0[2],Ft[2])));
  out[BI.pelvis]={o:J.pelvis,F:F0}; out[BI.lumbar]={o:J.pelvis,F:Fm}; out[BI.torso]={o:J.pelvis,F:Ft};
  out[BI.head]={o:J.neck,F:Ft};
  const hands={};
  for(const k of ['L','R']){
    const S=J['sh'+k],E=J['el'+k],W=J['ha'+k],u=norm(sub(E,S)),fa=norm(sub(W,E));
    out[BI['clav'+k]]={o:S,F:Ft};
    // 위팔: 앞면(이두 쪽)은 팔꿈치가 굽는 방향. 팔이 펴져 있으면 몸 앞쪽
    const fp=sub(fa,mul(u,dot(fa,u))); const z0=perp(fT,u,uT);
    const wb=bind?0:sstep(len(fp),.12,.4);
    const b=wb>0?norm(add(mul(z0,1-wb),mul(norm(fp),wb))):z0;
    const Fu=frameYZ(mul(u,-1),b);
    out[BI['ua'+k]]={o:S,F:Fu};
    // 아래팔: 팔꿈치 경첩 축을 이어받고, 손목 쪽으로 갈수록 회내(pronation)만큼 비튼다
    const Ff=frameXY(Fu[0],mul(fa,-1));
    const pr=bind?0:(((grip&&grip[k])||0)-(J.bindPron||0))*(k==='L'?-1:1);
    for(let j=0;j<NFA;j++) out[BI['fa'+j+k]]={o:E,F:twist(Ff,pr*j/(NFA-1))};
    const Fh=twist(Ff,pr); out[BI['hand'+k]]={o:W,F:Fh}; hands[k]=Ff;
    // 다리
    const H=J['hip'+k],K=J['kn'+k],A=J['an'+k],th=norm(sub(K,H)),shn=norm(sub(A,K));
    const sp=sub(shn,mul(th,dot(shn,th))); const a0=perp(fR,th,fT);
    const wa=bind?0:sstep(len(sp),.1,.35);
    const a=wa>0?norm(add(mul(a0,1-wa),mul(norm(mul(sp,-1)),wa))):a0;
    const Fth=frameYZ(mul(th,-1),a);
    out[BI['th'+k]]={o:H,F:Fth};
    const Fs=frameXY(Fth[0],mul(shn,-1));
    out[BI['sh'+k]]={o:K,F:Fs};
    if(bind) out[BI['ft'+k]]={o:A,F:[[1,0,0],[0,1,0],[0,0,1]]};
    else{
      const Z=norm(sub(J['toe'+k],J['heel'+k])); const Yf=perp(Fs[1],Z,Fs[2]); const P=[cross(Yf,Z),Yf,Z];
      // P * FOOT_REF^T
      const F=[0,1,2].map(c=>{const r=[FOOT_REF[0][c],FOOT_REF[1][c],FOOT_REF[2][c]];return add(add(mul(P[0],r[0]),mul(P[1],r[1])),mul(P[2],r[2]));});
      out[BI['ft'+k]]={o:A,F};
    }
  }
  out.hands=hands;
  return out;
}

/* 손이 바를 쥐는 운동: 손등 가로축이 바 방향과 나란해지는 회내 각도를 고른다(선호 각도에 가까운 쪽) */
function barGrip(J,pref){
  const d=norm(sub(J.haL,J.haR)); const g={};
  const fr=frames(J,false,null).hands;
  for(const k of ['L','R']){
    const [X,Y,Z]=fr[k]; const dp=sub(d,mul(Y,dot(d,Y)));
    if(len(dp)<.3){g[k]=pref;continue;}
    // twist(F,a)의 X = X cos a − Z sin a  →  a = atan2(−d·Z, d·X), 그리고 반대 방향(±π)
    const sg=k==='L'?-1:1; let a=Math.atan2(-dot(dp,Z),dot(dp,X))*sg;
    const cands=[a,a+Math.PI,a-Math.PI]; let best=cands[0];
    for(const c of cands) if(Math.abs(c-pref)<Math.abs(best-pref)) best=c;
    g[k]=best;
  }
  return g;
}

const D2R=Math.PI/180;
/* 운동별 손 모양(회내 각도). 0 = 손바닥이 앞(언더그립), 90 = 손바닥이 몸쪽(뉴트럴), 그 이상 = 오버그립 */
function gripSpec(ex){
  const p=ex.anim.p,o=ex.anim.o||{},eq=ex.equip||'';
  const bar=/바벨|EZ|스미스/.test(eq)||/bar|smith|ez/.test(o.tool||'')||p==='vpull'||(p==='triceps'&&o.kind==='pushdown');
  let pref=90;
  if(p==='curl') pref=o.hammer?90:0;
  else if(p==='vpull') pref=o.grip==='close'?0:150;
  else if(p==='fly') pref=o.rev?120:20;
  else if(p==='raise') pref=o.kind==='front'?150:110;
  else if(['press','ohp','pushup','dip','plank','row','hinge','squat','triceps','straightPull','facepull','pullover'].includes(p)) pref=bar?150:100;
  return {bar,pref:pref*D2R};
}

/* 관절 J → 스키닝 행렬(4x4 열 우선) 24개 */
function makePoser(body,ex){
  const bindF=frames(body.joints,true,null); const spec=gripSpec(ex); const out=new Float32Array(BONES.length*16);
  return J=>{
    const grip=spec.bar?barGrip(J,spec.pref):{L:spec.pref,R:spec.pref};
    J.bindPron=body.bindPron; const P=frames(J,false,grip);
    for(let i=0;i<BONES.length;i++){
      const p=P[i],b=bindF[i],o=i*16;
      // R = Fp * Fb^T ,  t = op − R*ob
      for(let r=0;r<3;r++)for(let c=0;c<3;c++) out[o+c*4+r]=p.F[0][r]*b.F[0][c]+p.F[1][r]*b.F[1][c]+p.F[2][r]*b.F[2][c];
      for(let r=0;r<3;r++) out[o+12+r]=p.o[r]-(out[o+r]*b.o[0]+out[o+4+r]*b.o[1]+out[o+8+r]*b.o[2]);
      out[o+3]=out[o+7]=out[o+11]=0; out[o+15]=1;
    }
    return out;
  };
}

/* glb 읽기 (이 프로젝트가 만든 단순한 glb 전용: 메쉬마다 프리미티브 하나, float32 위치·법선, u8 조인트·가중치, u32 인덱스) */
function parse(buf){
  const dv=new DataView(buf); if(dv.getUint32(0,true)!==0x46546C67) throw new Error('glb가 아님');
  const jl=dv.getUint32(12,true); const g=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,jl)));
  const b0=20+jl+8;
  const acc=(i,T,n)=>{const a=g.accessors[i],v=g.bufferViews[a.bufferView];return new T(buf.slice(b0+v.byteOffset,b0+v.byteOffset+v.byteLength),0,a.count*n);};
  let nv=0,ni=0; for(const m of g.meshes){const pr=m.primitives[0];nv+=g.accessors[pr.attributes.POSITION].count;ni+=g.accessors[pr.indices].count;}
  const pos=new Float32Array(nv*3),nrm=new Float32Array(nv*3),jnt=new Uint8Array(nv*4),wgt=new Uint8Array(nv*4),grp=new Uint8Array(nv),idx=new Uint32Array(ni);
  const groups=[]; let vo=0,io=0;
  g.meshes.forEach((m,gi)=>{const pr=m.primitives[0],A=pr.attributes;
    const p=acc(A.POSITION,Float32Array,3),n=acc(A.NORMAL,Float32Array,3),j=acc(A.JOINTS_0,Uint8Array,4),w=acc(A.WEIGHTS_0,Uint8Array,4),ix=acc(pr.indices,Uint32Array,1);
    pos.set(p,vo*3);nrm.set(n,vo*3);jnt.set(j,vo*4);wgt.set(w,vo*4);grp.fill(gi,vo,vo+p.length/3);
    for(let k=0;k<ix.length;k++) idx[io+k]=ix[k]+vo;
    const [key,side]=m.name.split('|'); groups.push({keys:key.split('+'),side});
    vo+=p.length/3;io+=ix.length;});
  return {pos,nrm,jnt,wgt,grp,idx,groups,nv,joints:g.extras.joints,bindPron:(g.extras.bindPron||{}).L||0,id:++SEQ};
}
let SEQ=0;

/* 근육 그룹별 색 → 정점 색 버퍼. musc: {근육키: 1(주동) | 2(보조)}, uni: 한쪽만 하는 운동이면 'L'/'R' */
const TORSO=new Set(['chest','uchest','lats','traps','rhom','erect','abs','obl','glute','abd','hipflex']);
function colors(body,musc,uni,pal){
  const C=k=>pal[k].map(v=>v/255); const out=new Float32Array(body.nv*4);
  const gc=body.groups.map(g=>{
    let lv=0; for(const k of g.keys){const m=musc[k]; if(!m) continue; if(uni&&g.side&&g.side!==uni&&!TORSO.has(k)) continue; lv=lv?Math.min(lv,m):m;}
    if(lv===1) return [...C('prim'),1]; if(lv===2) return [...C('sec'),1];
    const k=g.keys[0]; return [...C(k==='bone'?'bone':k==='tendon'?'tendon':'muscle'),0];
  });
  for(let i=0;i<body.nv;i++) out.set(gc[body.grp[i]],i*4);
  return out;
}

let loaded=null, loading=null, failed=false;
const BODY={
  BONES,
  /** 모델을 (한 번만) 내려받는다. 실패하면 null — 그때는 예전 도형 모형으로 그린다 */
  load(url){
    if(loaded||failed) return Promise.resolve(loaded);
    if(!loading) loading=fetch(url||BODY.url).then(r=>{if(!r.ok) throw new Error(r.status);return r.arrayBuffer();}).then(b=>(loaded=parse(b)))
      .catch(e=>{failed=true;console.warn('인체 모델을 불러오지 못해 기본 모형으로 표시합니다',e);return null;});
    return loading;
  },
  get:()=>loaded, settled:()=>!!loaded||failed, parse, makePoser, colors, frames, gripSpec,
  url:(typeof import.meta!=='undefined'&&import.meta.env?import.meta.env.BASE_URL:'/')+'models/body.glb',
};
export { BODY };
