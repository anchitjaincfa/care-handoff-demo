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
 await page.emulateMedia({colorScheme:variant.colorScheme});
 await page.addInitScript((nursery)=>{window.localStorage.setItem("nuzzlecue-nursery-theme",String(nursery));},variant.nursery);
 await page.goto(route,{waitUntil:"networkidle"});
 if(variant.nursery)expect(await page.locator(".theme-nursery").count()).toBeGreaterThan(0);
 const results=await new AxeBuilder({page}).analyze();
 const serious=results.violations.filter((v)=>v.impact==="serious"||v.impact==="critical").map((v)=>({id:v.id,impact:v.impact,nodes:v.nodes.map((n)=>n.target)}));
 expect(serious).toEqual([]);
});


test("mobile demo controls remain operable and free of serious violations",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/demo/?surface=timeline",{waitUntil:"networkidle"});
 await expect(page.locator(".timeline-actions").first()).toBeVisible();
 await expect(page.locator(".bottom-nav a[href=\"/demo/?surface=privacy\"]")).toBeVisible();
 await expect(page.locator(".bottom-nav a[href=\"/demo/?surface=settings\"]")).toBeVisible();
 await expect(page.locator(".bottom-nav a[href=\"/\"]")).toBeVisible();
 const results=await new AxeBuilder({page}).analyze();
 const serious=results.violations.filter((v)=>v.impact==="serious"||v.impact==="critical").map((v)=>({id:v.id,impact:v.impact,nodes:v.nodes.map((n)=>n.target)}));
 expect(serious).toEqual([]);
});
