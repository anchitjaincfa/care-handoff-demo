import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),out=path.join(root,"out"),sourcePath=path.join(root,"sw","service-worker.js"),outputPath=path.join(out,"sw.js");
async function walk(directory){const entries=await readdir(directory,{withFileTypes:true});const paths=[];for(const entry of entries){const absolute=path.join(directory,entry.name);if(entry.isDirectory())paths.push(...await walk(absolute));else if(entry.isFile())paths.push(absolute);}return paths;}
const files=(await walk(out)).filter((file)=>file!==outputPath&&!file.endsWith(".map")).sort(),urls=new Set(),fingerprint=createHash("sha256");
for(const file of files){const relative=path.relative(out,file).split(path.sep).join("/");urls.add(`/${relative}`);if(relative==="index.html")urls.add("/");if(relative.endsWith("/index.html"))urls.add(`/${relative.slice(0,-"index.html".length)}`);fingerprint.update(relative).update("\0").update(await readFile(file)).update("\0");}
const names=JSON.parse(await readFile(path.join(root,"src/infrastructure/storage/names.json"),"utf8"));
const known=[...Object.values(names.databases),...names.legacyEventBases].flatMap((base)=>names.realms.map((realm)=>`${base}-${realm}`));
const buildId=fingerprint.digest("hex").slice(0,16),source=await readFile(sourcePath,"utf8");
const withManifest=source.replace(/\/\* __PRECACHE_MANIFEST__ \*\/[\s\S]*?;\nconst KNOWN_DATABASE_NAMES/,`/* __PRECACHE_MANIFEST__ */ ${JSON.stringify([...urls].sort(),null,2)};\nconst KNOWN_DATABASE_NAMES`);
const withNames=withManifest.replace(/\/\* __KNOWN_DATABASE_NAMES__ \*\/[\s\S]*?;\nconst OFFLINE_FALLBACKS/,`/* __KNOWN_DATABASE_NAMES__ */ ${JSON.stringify(known,null,2)};\nconst OFFLINE_FALLBACKS`);
const generated=withNames.replaceAll("__BUILD_ID__",buildId);if(generated===source)throw new Error("Service-worker generation markers were not replaced");await writeFile(outputPath,generated);console.log(`Generated sw.js with ${urls.size} content-hashed URLs (${buildId}).`);
