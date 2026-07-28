import Dexie from "dexie";
import { IDBFactory,IDBKeyRange } from "fake-indexeddb";
import { describe,expect,it } from "vitest";
import { deleteAllLocalData } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import { KNOWN_APP_DATABASE_NAMES } from "@/src/infrastructure/storage/names";
const cachesStub=()=>{const names=new Set(["shell"]);return {keys:async()=>[...names],delete:async(name:string)=>names.delete(name)} as unknown as CacheStorage;};
function open(factory:IDBFactory,name:string):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=factory.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore("events");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
describe("deleteAllLocalData",()=>{
 it("deletes known real/demo DBs when databases() is unavailable",async()=>{const factory=new IDBFactory();for(const name of KNOWN_APP_DATABASE_NAMES)(await open(factory,name)).close();const hidden={open:factory.open.bind(factory),deleteDatabase:factory.deleteDatabase.bind(factory),cmp:factory.cmp.bind(factory),databases:undefined} as unknown as IDBFactory;await deleteAllLocalData({cacheStorage:cachesStub(),indexedDb:hidden});expect((await factory.databases()).flatMap(e=>e.name?[e.name]:[])).toEqual([]);});
 it("closes a held-open domain-compatible Dexie connection first",async()=>{const factory=new IDBFactory();const dexie=new Dexie("care-handoff-default-real",{indexedDB:factory,IDBKeyRange});dexie.version(1).stores({events:"++id"});await dexie.open();let closed=false;const unregister=registerClosableLocalConnection({close(){dexie.close();closed=true;}});await expect(deleteAllLocalData({cacheStorage:cachesStub(),indexedDb:factory})).resolves.toEqual(expect.objectContaining({databaseCount:6}));expect(closed).toBe(true);expect((await factory.databases()).map(e=>e.name)).not.toContain("care-handoff-default-real");unregister();});
});
