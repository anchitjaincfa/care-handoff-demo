export type MetricName = "onboarding_completed" | "event_proposed" | "event_confirmed_unchanged" | "event_confirmed_edited" | "parser_refused" | "capture_typed" | "capture_voice" | "capture_manual" | "handoff_generated" | "handoff_qr_displayed" | "handoff_opened" | "privacy_center_opened" | "export_created" | "delete_all_completed";
export type MetricEntry = { name: MetricName; at: string; durationMs?: number };
export interface MetricsPort { record(entry: MetricEntry): Promise<void>; list(): Promise<MetricEntry[]>; exportJson(): Promise<string>; clear(): Promise<void>; }
