import type { Capability } from "./types";
export const SURFACE_CAPABILITIES: Capability[] = [
  { id:"today", label:"Today and timeline", status:"live", reason:"Runs on this device.", dataScope:"real-local" },
  { id:"handoff", label:"Local handoff briefing", status:"live", reason:"Generated locally with explicit sharing consent.", dataScope:"real-local" },
  { id:"demo", label:"Sample family", status:"demo", reason:"Synthetic data in an isolated database.", dataScope:"demo-local" },
  { id:"cloud-sync", label:"Encrypted caregiver sync", status:"planned", reason:"Requires a separately reviewed server and key-management architecture.", dataScope:"none" },
  { id:"invites", label:"Caregiver invitations", status:"planned", reason:"Depends on accounts and sync.", dataScope:"none" },
  { id:"notifications", label:"User-scheduled reminders", status:"planned", reason:"No launch server or push path.", dataScope:"none" },
];
