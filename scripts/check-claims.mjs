import { readFile, readdir } from "node:fs/promises"; import { join } from "node:path";
const patterns=[/[Yy]our baby should/,/clinician-ready/i,/doctor-approved/i,/medical-grade/i,/\b(normal|abnormal)\b/i,/diagnos/i,/\bhealthy\b/i];
async function files(dir){ const out=[]; for(const e of await readdir(dir,{withFileTypes:true})){ const p=join(dir,e.name); if(e.isDirectory()) out.push(...await files(p)); else if(/\.(ts|tsx|md)$/.test(e.name)) out.push(p); } return out; }
const violations=[]; for(const file of await files("src/copy")){ if(file.endsWith("claims.ts")) continue; const text=await readFile(file,"utf8"); for(const p of patterns) if(p.test(text)) violations.push(`${file}: ${p}`); }
if(violations.length){ console.error(violations.join("\n")); process.exit(1); }
