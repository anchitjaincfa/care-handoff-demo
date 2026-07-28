import { readFile, readdir } from "node:fs/promises"; import { join, relative, sep } from "node:path";
const capabilities=[...JSON.parse(await readFile("src/capabilities/domain.json","utf8")),...JSON.parse(await readFile("src/capabilities/surfaces.json","utf8"))];
const statuses=new Set(["live","demo","preview","planned","excluded"]); const ids=new Set();
for(const c of capabilities){ if(ids.has(c.id)) throw new Error(`Duplicate capability id: ${c.id}`); ids.add(c.id); if(!statuses.has(c.status)||!c.reason?.trim()) throw new Error(`Invalid capability: ${c.id}`); if(c.status==="excluded"&&c.dataScope!=="none") throw new Error(`Excluded capability has data scope: ${c.id}`); }
async function pages(dir){ const out=[]; for(const e of await readdir(dir,{withFileTypes:true})){ const p=join(dir,e.name); if(e.isDirectory()) out.push(...await pages(p)); else if(e.name==="page.tsx") out.push(p); } return out; }
for(const page of await pages("app")){ const rel=relative("app",page).split(sep).slice(0,-1).join("/"); const route=rel?`/${rel}`:"/"; if(!capabilities.some((c)=>c.route===route)) throw new Error(`Route missing from registry: ${route}`); }
