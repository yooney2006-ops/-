const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:420,height:900},deviceScaleFactor:1});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/claude/gymlog/index.html');await p.waitForTimeout(400);
// 데이터 시드
await p.evaluate(()=>{const t=new Date();for(let i=1;i<=20;i+=3){const d=new Date(t);d.setDate(t.getDate()-i);const k=ymd(d);const it=mkItem(EXMAP.bench,3,8,55+ (20-i));it.sets.forEach(s=>s.done=true);const it2=mkItem(EXMAP.squat,3,6,70+(20-i));it2.sets.forEach(s=>s.done=true);S.days[k]={meals:[{...FOOD_DB[0],meal:"점심",qty:1}],workout:{items:[it,it2]},weight:72-(20-i)*0.05};}lsSave();render();});
await p.screenshot({path:'/tmp/a1.png',fullPage:true});
await p.click('[data-tab=workout]');await p.waitForTimeout(200);await p.screenshot({path:'/tmp/a2.png',fullPage:true});
await p.click('[data-tab=guide]');await p.waitForTimeout(200);await p.screenshot({path:'/tmp/a3.png'});
await p.click('[data-act=exDetail][data-id=bench]');await p.waitForTimeout(900);await p.screenshot({path:'/tmp/a4.png'});
await p.evaluate(()=>document.getElementById('sheet').scrollTop=600);await p.waitForTimeout(200);await p.screenshot({path:'/tmp/a5.png'});
console.log(errs.join('\n')||'no errors');await b.close();})();
