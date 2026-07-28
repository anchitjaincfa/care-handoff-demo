import { expect,test } from "@playwright/test";
import { exportedRoutes } from "./routes";
test.describe.configure({retries:0});
for(const route of exportedRoutes())test(`${route} makes no cross-origin requests`,async({page,baseURL})=>{
 const origin=new URL(baseURL??"http://127.0.0.1:4173").origin,egress=new Set<string>();
 page.on("request",(request)=>{const url=new URL(request.url());if(["http:","https:"].includes(url.protocol)&&url.origin!==origin)egress.add(url.href);});
 await page.goto(route,{waitUntil:"networkidle"});await page.waitForTimeout(250);expect([...egress]).toEqual([]);
});
test("event-like content never enters any request URL, header, or body",async({page})=>{
 const token=`PRIVATE_EVENT_CANARY_${crypto.randomUUID()}`;await page.goto("/");
 await page.evaluate((value)=>localStorage.setItem("care-handoff-default-real-capture-canary",JSON.stringify({id:"privacy-canary",note:value,source:"typed",startedAt:"2026-07-28T12:00:00.000Z"})),token);
 const observed:string[]=[],leaks:string[]=[];page.on("request",(request)=>{let payload=[request.url(),JSON.stringify(request.headers()),request.postData()??""].join("\n");try{payload=decodeURIComponent(payload);}catch{}observed.push(request.url());if(payload.includes(token))leaks.push(request.url());});
 await page.reload({waitUntil:"networkidle"});await page.evaluate(()=>fetch("/manifest.webmanifest",{headers:{"X-Privacy-Canary-Probe":"content-stays-local"}}));expect(observed.length).toBeGreaterThan(0);expect(leaks).toEqual([]);
});
test("delete-all clears caches and known real/demo databases",async({page})=>{
 await page.goto("/");await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
 const result=await page.evaluate(async()=>{await caches.open("privacy-delete-canary").then((cache)=>cache.put("/privacy-delete-canary",new Response("canary")));const names=["care-handoff-default-real","care-handoff-default-demo","care-handoff-metrics-real","care-handoff-metrics-demo","care-handoff-real","care-handoff-demo"];
  for(const name of names)await new Promise<void>((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore("canary");request.onsuccess=()=>{request.result.close();resolve();};request.onerror=()=>reject(request.error);});
  const registration=await navigator.serviceWorker.ready;const response=await new Promise<{ok:boolean}>((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>reject(new Error("Deletion timed out")),10000);channel.port1.onmessage=(event)=>{clearTimeout(timeout);resolve(event.data);};registration.active?.postMessage({type:"DELETE_ALL_LOCAL_DATA"},[channel.port2]);});
  return{response,caches:await caches.keys(),remaining:typeof indexedDB.databases==="function"?(await indexedDB.databases()).flatMap((db)=>db.name?[db.name]:[]):[],names};});
 expect(result.response).toEqual(expect.objectContaining({ok:true}));expect(result.caches).not.toContain("privacy-delete-canary");for(const name of result.names)expect(result.remaining).not.toContain(name);
});
