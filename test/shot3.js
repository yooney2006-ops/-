const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const list=require(process.argv[2]);const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await b.newPage({viewport:{width:1500,height:400}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('file:///home/claude/gymlog/test/big.html#'+encodeURIComponent(JSON.stringify(list)));await p.waitForTimeout(300);
await p.screenshot({path:process.argv[3],fullPage:true});console.log(errs.join('\n')||'ok');await b.close();})();
