const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:420,height:900}});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('file:///home/claude/gymlog/index.html');await p.waitForTimeout(300);
await p.evaluate(()=>{const t=new Date();for(let i=2;i<=12;i+=2){const d=new Date(t);d.setDate(t.getDate()-i);const k=ymd(d);const it=mkItem(EXMAP.bench,3,8,60);it.sets.forEach(s=>{s.done=true;});S.days[k]={meals:[],workout:{items:[it]}};}
 const dd=day(); dd.workout.items=[mkItem(EXMAP.bench,3,8,65),mkItem(EXMAP.bb_row,3,8,60),mkItem(EXMAP.lateral,3,12,8)]; lsSave(); ui.tab="workout"; render();});
await p.click('[data-act=toggleSet][data-i="0"][data-k="0"]');await p.waitForTimeout(150);
await p.evaluate(()=>{const it=day().workout.items; it[1].sets.forEach(s=>s.done=true); it[2].sets.forEach(s=>s.done=true); render();});
await p.waitForTimeout(600);await p.screenshot({path:'/tmp/d1.png',fullPage:true});
console.log(errs.join('\n')||'no errors');await b.close();})();
