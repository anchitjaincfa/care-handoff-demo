import { describe, expect, it } from "vitest";
import { feedEvent } from "../../domain/fixtures";
import { createDefaultProfile } from "@/src/infrastructure/storage/BrowserProfileStore";
import { parseRuntimeBackup } from "@/src/integration/runtime/backup";

function backupFixture() {
  return { format: "nuzzlecue-backup" as const, version: 1 as const, generatedAt: "2026-07-28T05:00:00.000Z", realm: "real" as const, profile: { ...createDefaultProfile("real", "America/Los_Angeles"), householdId: "house-1", babyId: "baby-1" }, events: [feedEvent()] };
}
describe("backup time-zone boundary", () => {
  it("accepts a backup whose profile and events carry IANA zones", () => { expect(parseRuntimeBackup(JSON.stringify(backupFixture()), "real")).toEqual(backupFixture()); });
  it("rejects an invalid profile time zone before import", () => { const backup = backupFixture(); backup.profile.timeZone = "Mars/Olympus_Mons"; expect(() => parseRuntimeBackup(JSON.stringify(backup), "real")).toThrow(); });
  it("rejects an offset-only event time zone before import", () => { const backup = backupFixture(); backup.events = [{ ...backup.events[0]!, timeZone: "+05:30" }]; expect(() => parseRuntimeBackup(JSON.stringify(backup), "real")).toThrow(); });
});
