// 물리 타당성 검사: 바닥 관통, 발 접지, 무게중심-지지면, 관절 가동 한계, 무릎 방향
global.window={matchMedia:()=>({matches:false})};global.getComputedStyle=()=>({getPropertyValue:()=>'#888'});
const fs=require('fs');
eval(fs.readFileSync('../src/exdata.js','utf8')+fs.readFileSync('../src/fig.js','utf8')+';global.EX=EX;global.FIG=FIG;');
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],len=a=>Math.hypot(...a),norm=a=>mul(a,1/(len(a)||1));
const ang=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(norm(a),norm(b)))))*180/Math.PI;
const STAND=new Set(['feet','toes','ankleL','floor']);
const only=process.argv[2]?process.argv[2].split(','):null;
const seen=new Set(),out=[];
for(const ex of EX){ if(ex.brand) continue; if(only&&!only.includes(ex.id)) continue; const key=JSON.stringify(ex.anim); if(seen.has(key)) continue; seen.add(key);
  const rig=FIG.makeRig(ex.anim,ex); const P=rig.P; const issues=new Set();
  const freeW=['바벨','덤벨','케틀벨','EZ바','덤벨/케틀벨','덤벨+박스','맨몸'].some(k=>ex.equip===k)||ex.cat==='프리웨이트'||ex.cat==='맨몸';
  for(let i=0;i<=10;i++){ const s=i/10; const J=rig.at(rig.cycle?s:s);
    const pts=['pelvis','chest','neck','head','shL','shR','elL','elR','haL','haR','hipL','hipR','knL','knR','anL','anR','toeL','toeR','heelL','heelR'];
    for(const k of pts){ if(J[k][1]<-.02) issues.add(`바닥 관통 ${k} (s=${s}, y=${J[k][1].toFixed(2)})`); }
    // 관절 한계
    for(const k of ['L','R']){
      const ua=sub(J['el'+k],J['sh'+k]),fa=sub(J['ha'+k],J['el'+k]); const ef=ang(ua,fa); if(ef>155) issues.add(`팔꿈치 과굴곡 ${k} ${ef.toFixed(0)}° (s=${s})`);
      const th=sub(J['kn'+k],J['hip'+k]),sh=sub(J['an'+k],J['kn'+k]); const kf=ang(th,sh); if(kf>155) issues.add(`무릎 과굴곡 ${k} ${kf.toFixed(0)}° (s=${s})`);
      // 무릎 굽힘 방향: 정강이가 허벅지 기준 앞쪽(발끝 방향)으로 꺾이면 비정상
      const thn=norm(th); const sp=sub(norm(sh),mul(thn,dot(norm(sh),thn)));
      const fR=[J.R0[0][2],J.R0[1][2],J.R0[2][2]], uR=[J.R0[0][1],J.R0[1][1],J.R0[2][1]];
      let ap=sub(fR,mul(thn,dot(fR,thn))); if(len(ap)<.3) ap=sub(uR,mul(thn,dot(uR,thn)));
      if(len(sp)>.25&&dot(norm(sp),norm(ap))>.4) issues.add(`무릎 역방향 ${k} (s=${s})`);
      const tor=norm(sub(J.neck,J.pelvis)); const hipA=ang(tor,th); if(hipA<35) issues.add(`고관절 과굴곡 ${k} ${(180-hipA).toFixed(0)}° (s=${s})`);
    }
    if(STAND.has(P.anchor.type)){
      // 발 접지: 양발 최저점
      for(const k of ['L','R']){ const lo=Math.min(J['toe'+k][1],J['heel'+k][1]); if(lo>.07&&!(ex.anim.p==='lunge'||ex.anim.p==='kickback'||ex.anim.p==='cardio'||ex.anim.p==='calf')) issues.add(`발 들림 ${k} (s=${s}, ${lo.toFixed(2)}m)`); }
      if(freeW&&!['cardio','kickback'].includes(ex.anim.p)){
        // 무게중심
        const seg=[[mid(J.pelvis,J.neck),.497],[J.head,.081]];
        for(const k of ['L','R']){ seg.push([mid(J['sh'+k],J['el'+k]),.028],[mid(J['el'+k],J['ha'+k]),.022],[mid(J['hip'+k],J['kn'+k]),.1],[mid(J['kn'+k],J['an'+k]),.0465],[mid(J['heel'+k],J['toe'+k]),.0145]); }
        const load=ex.equip==='바벨'?.6:ex.equip.includes('덤벨')||ex.equip.includes('케틀벨')?.2:0; if(load) seg.push([mid(J.haL,J.haR),load]);
        let m=0,c=[0,0,0]; seg.forEach(([p,w])=>{m+=w;c=add(c,mul(p,w));}); c=mul(c,1/m);
        const fx=[J.toeL,J.toeR,J.heelL,J.heelR].filter(p=>p[1]<.08); if(fx.length){ const xs=fx.map(p=>p[0]),zs=fx.map(p=>p[2]);
          const pad=.03; if(c[0]<Math.min(...xs)-pad||c[0]>Math.max(...xs)+pad||c[2]<Math.min(...zs)-pad||c[2]>Math.max(...zs)+pad) issues.add(`무게중심 지지면 이탈 (s=${s}, COM z=${c[2].toFixed(2)}, 발 z ${Math.min(...zs).toFixed(2)}~${Math.max(...zs).toFixed(2)})`); }
      }
    }
  }
  if(issues.size) out.push(ex.id+' ['+ex.anim.p+']\n   - '+[...issues].slice(0,6).join('\n   - '));
}
function mid(a,b){return mul(add(a,b),.5);}
console.log(out.length?out.join('\n'):'모든 검사 통과');console.log('\n문제 운동 수:',out.length);
