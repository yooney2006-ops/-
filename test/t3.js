global.localStorage={getItem:()=>null,setItem:()=>{}};
const el=()=>({innerHTML:"",textContent:"",classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},focus(){},setSelectionRange(){},querySelector:()=>null,outerHTML:""});
global.document={getElementById:el,querySelectorAll:()=>[],addEventListener(){}};global.window={scrollTo(){},matchMedia:()=>({matches:false})};global.getComputedStyle=()=>({getPropertyValue:()=>"#888"});
eval(require('fs').readFileSync('/tmp/a.js','utf8')+`
for(const d of [2,3,4,5,6]) for(const pref of ["mix","machine"]){ const t=makeTemplate({days:d,goal:"hyper",level:"mid",equip:"gym",pref}); const st=planStats(t.days);
 console.log(d,pref,Object.entries(st).map(([g,x])=>g+":"+r1(x.sets)+"/"+x.freq+"/"+r1(x.maxS)).join(" ")); }
const dd=day(); const it=mkItem(EXMAP.squat,4,8,80); it.sets.forEach(s=>{s.done=true;s.rir="0";s.t=Date.now()-20*3600000;}); dd.workout.items=[it];
console.log(JSON.stringify(recovery(ui.date)));
console.log(viewWorkout().length, viewPlan().length, viewGuide().length);
`);
