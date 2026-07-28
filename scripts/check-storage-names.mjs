import { readFile } from "node:fs/promises";
const config=JSON.parse(await readFile("src/infrastructure/storage/names.json","utf8"));
const known=[...Object.values(config.databases),...config.legacyEventBases].flatMap((base)=>config.realms.map((realm)=>`${base}-${realm}`));
const workers=await Promise.all([readFile("sw/service-worker.js","utf8"),readFile("public/sw.js","utf8")]);
for(const name of known){if(workers.some((worker)=>!worker.includes(`"${name}"`))){console.error(`Service-worker fallback database list is missing ${name}.`);process.exit(1);}}
const product=await readFile("product.config.ts","utf8");if(!product.includes(`localStorageNamespace: "${config.namespace}"`)){console.error("Product storage namespace differs from the canonical registry.");process.exit(1);}console.log(`Storage registry covers ${known.join(", ")}.`);
