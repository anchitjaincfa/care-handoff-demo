import AxeBuilder from "@axe-core/playwright";
import { expect,test } from "@playwright/test";
import { exportedRoutes } from "./routes";
test.describe.configure({retries:0});
const variants=[
 {name:"default-light",colorScheme:"light",nursery:false},
 {name:"default-dark",colorScheme:"dark",nursery:false},
 {name:"nursery-light",colorScheme:"light",nursery:true},
 {name:"nursery-dark",colorScheme:"dark",nursery:true},
] as const;
for(const route of exportedRoutes())for(const variant of variants)test(`${route} has no serious violations in ${variant.name}`,async({page})=>{
 await page.emulateMedia({colorScheme:variant.colorScheme});await page.goto(route,{waitUntil:"networkidle"});
 await page.evaluate((nursery)=>{if(nursery)document.documentElement.dataset.theme="nursery";else delete document.documentElement.dataset.theme;},variant.nursery);
 const results=await new AxeBuilder({page}).analyze();
 const serious=results.violations.filter((v)=>v.impact==="serious"||v.impact==="critical").map((v)=>({id:v.id,impact:v.impact,nodes:v.nodes.map((n)=>n.target)}));
 expect(serious).toEqual([]);
});
