import { IDBFactory } from "fake-indexeddb";
import { describe,expect,it } from "vitest";
import { IndexedDbMetricsPort,metricsDatabaseName } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import type { MetricEntry } from "@/src/ports/MetricsPort";
const create=(realm:"real"|"demo",factory=new IDBFactory())=>new IndexedDbMetricsPort(realm,factory);
describe("IndexedDbMetricsPort",()=>{
 it("stores only frozen content-free fields",async()=>{const metrics=create("real");await metrics.record({name:"capture_typed",at:"2026-07-28T08:30:00.000Z",durationMs:250,note:"never store"} as MetricEntry);expect(await metrics.list()).toEqual([{name:"capture_typed",at:"2026-07-28T08:30:00.000Z",durationMs:250}]);await metrics.dispose();});
 it("physically isolates real and demo",async()=>{const factory=new IDBFactory(),real=create("real",factory),demo=create("demo",factory);await real.record({name:"capture_typed",at:"2026-07-28T09:00:00.000Z"});await demo.record({name:"capture_manual",at:"2026-07-28T09:01:00.000Z"});expect(metricsDatabaseName("real")).not.toBe(metricsDatabaseName("demo"));expect((await real.list()).map(e=>e.name)).toEqual(["capture_typed"]);expect((await demo.list()).map(e=>e.name)).toEqual(["capture_manual"]);await real.dispose();await demo.dispose();});
 it("exports realm explicitly and clears",async()=>{const metrics=create("demo");await metrics.record({name:"handoff_generated",at:"2026-07-28T09:00:00.000Z"});expect(JSON.parse(await metrics.exportJson())).toEqual({schemaVersion:1,realm:"demo",entries:[{name:"handoff_generated",at:"2026-07-28T09:00:00.000Z"}]});await metrics.clear();expect(await metrics.list()).toEqual([]);await metrics.dispose();});
 it("tolerates unknown names without pollution",async()=>{const metrics=create("real");await expect(metrics.record({name:"future_metric",at:"2026-07-28T09:00:00.000Z",content:"ignored"} as unknown as MetricEntry)).resolves.toBeUndefined();expect(await metrics.list()).toEqual([]);await metrics.dispose();});
});
