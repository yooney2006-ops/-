const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();
p.on('pageerror',e=>console.error(e.message));
await p.goto('file:///home/claude/gymlog/test/camsearch.html');
let all={};try{all=JSON.parse(require('fs').readFileSync('cams.json','utf8'))}catch(e){}const ids=(await p.evaluate(()=>EX.map(e=>e.id))).filter(i=>!all[i]);
const t0=Date.now();for(let i=0;i<ids.length;i+=5){const r=await p.evaluate(x=>run(x),ids.slice(i,i+5));Object.assign(all,r);require('fs').writeFileSync('cams.json',JSON.stringify(all));require('fs').writeFileSync('prog.txt',i+' '+(Date.now()-t0));}
require('fs').writeFileSync('cams.json',JSON.stringify(all));console.log('\n',Object.entries(all).map(([k,v])=>k+':'+v.join('/')).join(' '));await b.close();})();
