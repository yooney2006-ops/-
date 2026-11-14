const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const q=JSON.parse(process.argv[2]);const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage({viewport:{width:1500,height:560}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.text())});
await p.goto('file:///home/claude/gymlog/test/anat.html#'+encodeURIComponent(JSON.stringify(q)));await p.waitForTimeout(800);
await p.screenshot({path:process.argv[3],fullPage:true});console.log(errs.slice(0,5).join('\n')||'ok');await b.close();})();
