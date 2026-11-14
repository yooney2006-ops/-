const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:420,height:900}});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('file:///home/claude/gymlog/index.html');await p.waitForTimeout(300);
await p.evaluate(()=>{const t=new Date();for(let i=1;i<=6;i+=2){const d=new Date(t);d.setDate(t.getDate()-i);const k=ymd(d);const it=mkItem(EXMAP.bench,3,8,60);it.sets.forEach(s=>{s.done=true;s.rir="1";});const it2=mkItem(EXMAP.squat,3,6,80);it2.sets.forEach(s=>{s.done=true;s.rir="0";});S.days[k]={meals:[],workout:{items:[it,it2]}};}
 const dd=day(); dd.workout.items=cloneItems(S.main.plan[0].items); dd.workout.items[0].sets[0].done=true; dd.workout.items[0].sets[0].rir="2"; lsSave(); ui.tab="workout"; render();});
await p.screenshot({path:'/tmp/b1.png',fullPage:true});
await p.click('[data-tab=plan]');await p.waitForTimeout(200);await p.click('[data-act=tplPlan]');await p.waitForTimeout(300);
await p.evaluate(()=>document.getElementById('sheet').scrollTop=99999);await p.waitForTimeout(100);await p.screenshot({path:'/tmp/b2.png'});
await p.click('[data-act=applyPlan]');await p.waitForTimeout(200);
await p.click('[data-tab=guide]');await p.waitForTimeout(200);await p.click('details.ev summary');await p.waitForTimeout(100);await p.screenshot({path:'/tmp/b3.png'});
await p.click('[data-act=exDetail][data-id=seated_curl]');await p.waitForTimeout(700);await p.evaluate(()=>document.getElementById('sheet').scrollTop=380);await p.screenshot({path:'/tmp/b4.png'});
console.log(errs.join('\n')||'no errors');await b.close();})();
