const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:420,height:900}});
const errs=[];p.on('pageerror',e=>errs.push('PE '+e.message));
await p.goto('file:///home/claude/gymlog/index.html');await p.waitForTimeout(300);
await p.click('[data-tab=plan]');await p.waitForTimeout(300);await p.screenshot({path:'/tmp/c1.png',fullPage:true});
await p.click('[data-act=editDay][data-i="0"]');await p.waitForTimeout(200);await p.click('[data-act=addEx][data-target=plan0]');await p.waitForTimeout(300);
await p.click('[data-act=previewEx][data-id=hack_squat]');await p.waitForTimeout(900);await p.screenshot({path:'/tmp/c2.png'});
await p.click('[data-tab=guide]').catch(()=>{});
console.log(errs.join('\n')||'no errors');await b.close();})();
