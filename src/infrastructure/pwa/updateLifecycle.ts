export type ServiceWorkerUpdatePrompt = (applyUpdate:()=>Promise<void>)=>void|Promise<void>;
function controllerChange(container:ServiceWorkerContainer,timeoutMs:number):Promise<void>{return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error("Service-worker update timed out")),timeoutMs);container.addEventListener("controllerchange",()=>{clearTimeout(timeout);resolve();},{once:true});});}
export async function applyWaitingServiceWorkerUpdate(registration:ServiceWorkerRegistration,container:ServiceWorkerContainer=navigator.serviceWorker,timeoutMs=10000):Promise<void>{if(!registration.waiting)throw new Error("No service-worker update is waiting");const changed=controllerChange(container,timeoutMs);registration.waiting.postMessage({type:"SKIP_WAITING"});await changed;}
export function monitorServiceWorkerUpdates(registration:ServiceWorkerRegistration,prompt:ServiceWorkerUpdatePrompt,container:ServiceWorkerContainer=navigator.serviceWorker):()=>void{
 let active=false;const offer=async()=>{if(!container.controller||!registration.waiting||active)return;active=true;try{await prompt(()=>applyWaitingServiceWorkerUpdate(registration,container));}finally{active=false;}};
 const found=()=>{const installing=registration.installing;if(!installing)return;installing.addEventListener("statechange",()=>{if(installing.state==="installed")void offer();});};
 registration.addEventListener("updatefound",found);void offer();return()=>registration.removeEventListener("updatefound",found);
}
