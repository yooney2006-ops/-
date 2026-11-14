const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const p=await b.newPage();
p.on('pageerror',e=>console.error(e.message));
await p.goto('file:///home/claude/gymlog/test/camsearch2.html');
let all={};try{all=JSON.parse(require('fs').readFileSync('cams2.json','utf8'))}catch(e){}const ids=require('./low.json').filter(i=>!all[i]);
const t0=Date.now();for(let i=0;i<ids.length;i+=2){const r=await p.evaluate(x=>run(x),ids.slice(i,i+2));Object.assign(all,r);require('fs').writeFileSync('cams2.json',JSON.stringify(all));require('fs').writeFileSync('prog.txt',i+' '+(Date.now()-t0));}
require('fs').writeFileSync('cams2.json',JSON.stringify(all));console.log('\n',Object.entries(all).map(([k,v])=>k+':'+v.join('/')).join(' '));await b.close();})();
