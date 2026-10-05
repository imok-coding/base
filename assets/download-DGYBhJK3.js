const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/jszip.min-Kk0JdpgT.js","assets/react-DQekVQz4.js"])))=>i.map(i=>d[i]);
import{c as p,a3 as w,a4 as g}from"./index-DCsvUjaK.js";/**
 * @license lucide-react v1.51.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m={name:"lightbulb",size:24,node:[["path",{d:"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",key:"1gvzjb"}],["path",{d:"M9 18h6",key:"x1upvd"}],["path",{d:"M10 22h4",key:"ceow96"}]]};m.node;const v=p(m);/**
 * @license lucide-react v1.51.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h={name:"search",size:24,node:[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]]};h.node;const _=p(h);function d(a,s){const r=URL.createObjectURL(a),t=document.createElement("a");t.href=r,t.download=s,document.body.appendChild(t),t.click(),t.remove(),setTimeout(()=>URL.revokeObjectURL(r),1e3)}function k(a,s){d(new Blob([JSON.stringify(a,null,2)],{type:"application/json"}),s)}function S(a,s){if(!a.length)return;const r=[...a.reduce((n,o)=>(Object.keys(o).forEach(i=>n.add(i)),n),new Set)],t=n=>{const o=n==null?"":String(n);return/[",\n]/.test(o)?`"${o.replace(/"/g,'""')}"`:o},l=[r.join(","),...a.map(n=>r.map(o=>t(n[o])).join(","))].join(`
`);d(new Blob([l],{type:"text/csv"}),s)}async function L(a,s,r){const t=a.filter(e=>e.cover).map((e,c)=>({url:e.cover,name:w(e.title,`manga-${c+1}`)}));if(!t.length)return 0;const{default:l}=await g(async()=>{const{default:e}=await import("./jszip.min-Kk0JdpgT.js").then(c=>c.j);return{default:e}},__vite__mapDeps([0,1])),n=new l,o=n.folder("covers"),i={};let u=0;return await Promise.all(t.map(async e=>{try{const c=await fetch(e.url);if(!c.ok)throw new Error(c.statusText);const b=await c.blob(),f=(e.url.split(".").pop()||"jpg").split(/[?#]/)[0].slice(0,4)||"jpg";i[e.name]=(i[e.name]||0)+1;const y=i[e.name]>1?`-${i[e.name]}`:"";o.file(`${e.name}${y}.${f}`,b),u+=1}catch(c){console.warn("Cover fetch failed",e.url,c)}finally{}})),d(await n.generateAsync({type:"blob"}),s),u}export{v as L,_ as S,S as a,L as b,k as d};
