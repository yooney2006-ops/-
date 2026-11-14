/* ============================================================
   FIGGL: WebGL 깊이버퍼 렌더러 (투명·겹침 오류 없음)
   FIG.scene()이 만든 프리미티브(m/c/s/poly/l)를 메쉬로 바꿔 그린다
   ============================================================ */
const FIGGL=(()=>{
const VS=`attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute float aF;
uniform mat3 uR;uniform vec3 uT;uniform float uD,uFx,uFy,uOy;
varying vec3 vN;varying vec3 vC;varying float vF;varying float vRim;
void main(){vec3 q=uR*(aP-uT);float dep=uD-q.z;float n=0.05,f=40.0;
 gl_Position=vec4(q.x*uFx,q.y*uFy-uOy*dep,dep*(f+n)/(f-n)-2.0*f*n/(f-n),dep);
 vN=uR*aN;vC=aC;vF=aF;}`;
const FS=`precision mediump float;varying vec3 vN;varying vec3 vC;varying float vF;uniform float uFlat;
void main(){if(uFlat>0.5){gl_FragColor=vec4(vC,1.0);return;}vec3 n=normalize(vN);vec3 L=normalize(vec3(-0.35,0.6,0.75));float d=max(dot(n,L),0.0);
 float fill=max(dot(n,normalize(vec3(0.5,-0.2,0.6))),0.0);
 float hot=step(0.00001,vF);
 float sky=0.5+0.5*n.y;
 vec3 amb=mix(vec3(0.42,0.40,0.38),vec3(0.62,0.62,0.64),sky);
 vec3 c=vC*(amb+0.55*d*vec3(1.0,0.97,0.92)+0.12*fill);
 vec3 H=normalize(L+vec3(0.0,0.0,1.0));c+=vec3(0.12)*pow(max(dot(n,H),0.0),18.0)*(0.5+0.5*hot);
 float edge=1.0-abs(n.z);c*=1.0-mix(0.32,0.42,hot)*pow(edge,2.2);
 if(hot>0.5){float st=abs(sin(vF*44.0));c*=0.93+0.07*smoothstep(0.2,0.9,st);}
 gl_FragColor=vec4(c,1.0);}`;
function sh(gl,t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function create(canvas){
  let gl=null,u32=true;
  try{gl=canvas.getContext('webgl2',{antialias:true,premultipliedAlpha:true,alpha:true});}catch(e){}
  if(!gl){try{gl=canvas.getContext('webgl',{antialias:true,alpha:true});}catch(e){} if(gl) u32=!!gl.getExtension('OES_element_index_uint');}
  if(!gl) return null;
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl,gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl,gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS)) return null;
  const loc={P:gl.getAttribLocation(pr,'aP'),N:gl.getAttribLocation(pr,'aN'),C:gl.getAttribLocation(pr,'aC'),F:gl.getAttribLocation(pr,'aF'),
    R:gl.getUniformLocation(pr,'uR'),T:gl.getUniformLocation(pr,'uT'),D:gl.getUniformLocation(pr,'uD'),Fx:gl.getUniformLocation(pr,'uFx'),Fy:gl.getUniformLocation(pr,'uFy'),Oy:gl.getUniformLocation(pr,'uOy'),Fl:gl.getUniformLocation(pr,'uFlat')};
  const vb=gl.createBuffer(),ib=gl.createBuffer(),lb=gl.createBuffer();
  let V=new Float32Array(1<<18),I=new Uint32Array(1<<18),nv=0,ni=0;
  const grow=()=>{if(nv*10+4000>V.length){const n=new Float32Array(V.length*2);n.set(V);V=n;} if(ni+8000>I.length){const n=new Uint32Array(I.length*2);n.set(I);I=n;}};
  const vert=(p,n,c,f)=>{const o=nv*10;V[o]=p[0];V[o+1]=p[1];V[o+2]=p[2];V[o+3]=n[0];V[o+4]=n[1];V[o+5]=n[2];V[o+6]=c[0];V[o+7]=c[1];V[o+8]=c[2];V[o+9]=f;return nv++;};
  function revolve(a,b,prof,s0,s1,nT,nA,col,fib,od,fl){ // prof(s)->r ; od: 바깥 방향, fl: 두께 비율(납작)
    grow();
    let u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];let L=Math.hypot(u[0],u[1],u[2]);if(L<1e-6){u=[0,1,0];L=0;}else u=[u[0]/L,u[1]/L,u[2]/L];
    let p1;
    if(od){const dd=od[0]*u[0]+od[1]*u[1]+od[2]*u[2];p1=[od[0]-u[0]*dd,od[1]-u[1]*dd,od[2]-u[2]*dd];const lp=Math.hypot(...p1);if(lp<.1)od=null;else p1=p1.map(v=>v/lp);}
    if(!od){const t=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];p1=[u[1]*t[2]-u[2]*t[1],u[2]*t[0]-u[0]*t[2],u[0]*t[1]-u[1]*t[0]];const l1=Math.hypot(...p1);p1=p1.map(v=>v/l1);fl=1;}
    fl=fl||1;
    const p2=[u[1]*p1[2]-u[2]*p1[1],u[2]*p1[0]-u[0]*p1[2],u[0]*p1[1]-u[1]*p1[0]];
    const base=nv;
    for(let i=0;i<=nT;i++){const k=i/nT;const s=s0+(s1-s0)*(.5-.5*Math.cos(Math.PI*k));const r=Math.max(0,prof(s));const e=1e-3*(s1-s0);const dr=(prof(Math.min(s1,s+e))-prof(Math.max(s0,s-e)))/(2*e||1);
      const c=[a[0]+u[0]*s,a[1]+u[1]*s,a[2]+u[2]*s];
      for(let j=0;j<nA;j++){const ang=j/nA*Math.PI*2,ca=Math.cos(ang),sa=Math.sin(ang);const rd=[p1[0]*ca*fl+p2[0]*sa,p1[1]*ca*fl+p2[1]*sa,p1[2]*ca*fl+p2[2]*sa];
        const rn=[p1[0]*ca/fl+p2[0]*sa,p1[1]*ca/fl+p2[1]*sa,p1[2]*ca/fl+p2[2]*sa];const rl=Math.hypot(...rn)||1;
        let n=[rn[0]/rl-u[0]*dr,rn[1]/rl-u[1]*dr,rn[2]/rl-u[2]*dr];const nl=Math.hypot(...n)||1;n=[n[0]/nl,n[1]/nl,n[2]/nl];
        if(i===0)n=[-u[0],-u[1],-u[2]];if(i===nT)n=u;
        vert([c[0]+rd[0]*r,c[1]+rd[1]*r,c[2]+rd[2]*r],n,col,fib?ang/(Math.PI*2)+.0001:0);}}
    for(let i=0;i<nT;i++)for(let j=0;j<nA;j++){const a0=base+i*nA+j,a1=base+i*nA+(j+1)%nA,b0=a0+nA,b1=a1+nA;I[ni++]=a0;I[ni++]=b0;I[ni++]=a1;I[ni++]=a1;I[ni++]=b0;I[ni++]=b1;}
  }
  function capsule(a,b,r,col){const L=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);revolve(a,b,s=>s<0?Math.sqrt(Math.max(0,r*r-s*s)):s>L?Math.sqrt(Math.max(0,r*r-(s-L)*(s-L))):r,-r,L+r,L>r?10:8,12,col,0);}
  function spindle(it,col,hot){const a=it.a,b=it.b,L=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const r=it.r,re=it.re??r*.35,pk=it.pk??.5;
    const pr=s=>{if(s<0)return Math.sqrt(Math.max(0,re*re-s*s));if(s>L)return Math.sqrt(Math.max(0,re*re-(s-L)*(s-L)));const t=s/L;const tt=t<pk?t/pk*.5:.5+(t-pk)/(1-pk)*.5;return re+(r-re)*Math.pow(Math.sin(Math.PI*tt),.7);};
    revolve(a,b,pr,-re,L+re,12,14,col,hot?1:0,it.o,it.fl);}
  function sphere(c,R,col){revolve([c[0],c[1]-R,c[2]],[c[0],c[1]+R,c[2]],s=>Math.sqrt(Math.max(0,R*R-(s-R)*(s-R))),0,2*R,10,14,col,0);}
  function poly(pts,col){grow();const e1=[pts[1][0]-pts[0][0],pts[1][1]-pts[0][1],pts[1][2]-pts[0][2]],e2=[pts[2][0]-pts[0][0],pts[2][1]-pts[0][1],pts[2][2]-pts[0][2]];
    let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];const l=Math.hypot(...n)||1;n=n.map(v=>v/l);
    const base=nv;pts.forEach(p=>vert(p,n,col,0));for(let i=1;i<pts.length-1;i++){I[ni++]=base;I[ni++]=base+i;I[ni++]=base+i+1;}
    // 뒷면(양면)
    const b2=nv;pts.forEach(p=>vert(p,[-n[0],-n[1],-n[2]],col,0));for(let i=1;i<pts.length-1;i++){I[ni++]=b2;I[ni++]=b2+i+1;I[ni++]=b2+i;}}
  const C=(rgb,f=1)=>rgb.map(v=>Math.min(1,v/255*f));
  const BODY=new Set(['muscle','deep','head','hair','tendon','skin']);
  function build(items,pal,flat){
    nv=0;ni=0;
    if(flat){ for(const it of items){ const key=it.c||it.cl; const col=key==='prim'?[1,0,0]:key==='sec'?[1,0,1]:BODY.has(key)?[0,1,0]:[0,0,1];
      if(it.k==='m')spindle(it,col,false);else if(it.k==='c')capsule(it.a,it.b,it.r,col);else if(it.k==='s')sphere(it.c,it.r,col);else if(it.k==='poly')poly(it.pts,col);else if(it.k==='l')capsule(it.a,it.b,.007,col);} return; }
    for(const it of items){
      if(it.k==='m'){const hot=it.c==='prim'||it.c==='sec';spindle(it,C(pal[it.c]||pal.muscle,1),hot);}
      else if(it.k==='c'){capsule(it.a,it.b,it.r,C(pal[it.c]||pal.skin));}
      else if(it.k==='s'){sphere(it.c,it.r,C(pal[it.cl]||pal.skin));}
      else if(it.k==='poly'){poly(it.pts,C(pal[it.c]||pal.frame,it.f||1));}
      else if(it.k==='l'){capsule(it.a,it.b,.007,C(pal[it.c]||pal.metal));}
    }
  }
  function draw(items,view,pal,W,H,dpr,flat){
    build(items,pal,flat);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(pr);
    const R=Math.PI/180,yaw=view.yaw*R,pit=view.pitch*R,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
    // q = Rm*(p-T): x1=qx*cy-qz*sy; z1=qx*sy+qz*cy; y1=qy*cp-z1*sp; z2=qy*sp+z1*cp
    const Rm=[cy,-sy*sp,sy*cp, 0,cp,sp, -sy,-cy*sp,cy*cp]; // column-major mat3
    const d=view.dist||4.2,F=Math.min(W,H*1.15)*d/(view.span||2.5);
    gl.uniformMatrix3fv(loc.R,false,new Float32Array(Rm));gl.uniform3fv(loc.T,new Float32Array(view.target||[0,.9,0]));
    gl.uniform1f(loc.D,d);gl.uniform1f(loc.Fx,F*2/W);gl.uniform1f(loc.Fy,F*2/H);gl.uniform1f(loc.Oy,.1);gl.uniform1f(loc.Fl,flat?1:0);
    // 바닥 격자
    const fl=C(pal.floor);const g=[];for(let i=-3;i<=3;i++){g.push(i*.5,0,-1.5,i*.5,0,1.5,-1.5,0,i*.5,1.5,0,i*.5);}
    const LV=new Float32Array(g.length/3*10);for(let i=0;i<g.length/3;i++){LV.set([g[i*3],g[i*3+1],g[i*3+2],0,0,1,fl[0]*1.6,fl[1]*1.6,fl[2]*1.6,0],i*10);}
    const bind=buf=>{gl.bindBuffer(gl.ARRAY_BUFFER,buf);const st=40;gl.enableVertexAttribArray(loc.P);gl.vertexAttribPointer(loc.P,3,gl.FLOAT,false,st,0);gl.enableVertexAttribArray(loc.N);gl.vertexAttribPointer(loc.N,3,gl.FLOAT,false,st,12);gl.enableVertexAttribArray(loc.C);gl.vertexAttribPointer(loc.C,3,gl.FLOAT,false,st,24);gl.enableVertexAttribArray(loc.F);gl.vertexAttribPointer(loc.F,1,gl.FLOAT,false,st,36);};
    if(!flat){gl.bindBuffer(gl.ARRAY_BUFFER,lb);gl.bufferData(gl.ARRAY_BUFFER,LV,gl.DYNAMIC_DRAW);bind(lb);gl.depthMask(false);gl.drawArrays(gl.LINES,0,g.length/3);gl.depthMask(true);}
    gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,V.subarray(0,nv*10),gl.DYNAMIC_DRAW);bind(vb);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);
    if(u32){gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I.subarray(0,ni),gl.DYNAMIC_DRAW);gl.drawElements(gl.TRIANGLES,ni,gl.UNSIGNED_INT,0);}
    else{const I16=new Uint16Array(I.subarray(0,ni));gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I16,gl.DYNAMIC_DRAW);gl.drawElements(gl.TRIANGLES,ni,gl.UNSIGNED_SHORT,0);}
  }
  return {draw,gl};
}
return {create};
})();

export { FIGGL };
