import { readFile } from "node:fs/promises";
const [domain,surfaces]=await Promise.all([readFile("src/capabilities/domain.ts","utf8"),readFile("src/capabilities/surfaces.ts","utf8")]);
for(const status of ["live","demo","preview","planned","excluded"]) if(!`${domain}${surfaces}`.includes(`\"${status}\"`)) { console.error(`Missing capability status: ${status}`); process.exitCode=1; }
