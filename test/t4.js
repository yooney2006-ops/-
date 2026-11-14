global.localStorage={getItem:()=>null,setItem:()=>{}};const el=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},focus(){},setSelectionRange(){},querySelector:()=>null});
global.document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}};global.window={scrollTo(){},matchMedia:()=>({matches:false})};
eval(require('fs').readFileSync('/tmp/a.js','utf8')+`
const t=makeTemplate({days:4,goal:"hyper",level:"mid",equip:"gym",pref:"brand"});
console.log(t.days.map(d=>d.title+": "+d.items.map(i=>i.name).join(", ")).join("\\n"));
console.log(planFeedback(t.days,"mid").bad.map(x=>x.t).join("\\n"));
ui.guideBrand="해머 스트렝스"; console.log(guideFilter().length);`);
