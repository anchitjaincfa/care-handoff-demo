export type CapabilityStatus = "live" | "demo" | "preview" | "planned" | "excluded";
export type Capability = { id: string; label: string; status: CapabilityStatus; reason: string; dataScope: "real-local" | "demo-local" | "none" };
