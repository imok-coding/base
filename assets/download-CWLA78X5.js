const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/jszip.min-Kk0JdpgT.js","assets/react-DQekVQz4.js"])))=>i.map(i=>d[i]);
import{c as u,aA as v,ax as b}from"./index-BeWQGXnj.js";/**
 * @license lucide-react v1.51.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h={name:"file-spreadsheet",size:24,node:[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M8 13h2",key:"yr2amv"}],["path",{d:"M14 13h2",key:"un5t4a"}],["path",{d:"M8 17h2",key:"2yhykz"}],["path",{d:"M14 17h2",key:"10kma7"}]]};h.node;const k=u(h);/**
 * @license lucide-react v1.51.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m={name:"search",size:24,node:[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]]};m.node;const g=u(m);function d(n,s){const r=URL.createObjectURL(n),t=document.createElement("a");t.href=r,t.download=s,document.body.appendChild(t),t.click(),t.remove(),setTimeout(()=>URL.revokeObjectURL(r),1e3)}function _(n,s){d(new Blob([JSON.stringify(n,null,2)],{type:"application/json"}),s)}function S(n,s){if(!n.length)return;const r=[...n.reduce((a,o)=>(Object.keys(o).forEach(i=>a.add(i)),a),new Set)],t=a=>{const o=a==null?"":String(a);return/[",\n]/.test(o)?`"${o.replace(/"/g,'""')}"`:o},l=[r.join(","),...n.map(a=>r.map(o=>t(a[o])).join(","))].join(`
`);d(new Blob([l],{type:"text/csv"}),s)}async function x(n,s,r){const t=n.filter(e=>e.cover).map((e,c)=>({url:e.cover,name:v(e.title,`manga-${c+1}`)}));if(!t.length)return 0;const{default:l}=await b(async()=>{const{default:e}=await import("./jszip.min-Kk0JdpgT.js").then(c=>c.j);return{default:e}},__vite__mapDeps([0,1])),a=new l,o=a.folder("covers"),i={};let p=0;return await Promise.all(t.map(async e=>{try{const c=await fetch(e.url);if(!c.ok)throw new Error(c.statusText);const y=await c.blob(),f=(e.url.split(".").pop()||"jpg").split(/[?#]/)[0].slice(0,4)||"jpg";i[e.name]=(i[e.name]||0)+1;const w=i[e.name]>1?`-${i[e.name]}`:"";o.file(`${e.name}${w}.${f}`,y),p+=1}catch(c){console.warn("Cover fetch failed",e.url,c)}finally{}})),d(await a.generateAsync({type:"blob"}),s),p}export{k as F,g as S,S as a,x as b,_ as d};
