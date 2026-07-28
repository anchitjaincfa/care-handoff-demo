export type SpeechCapability = { available: boolean; locality: "local-confirmed" | "browser-service" | "unavailable"; language: string; reason?: string };
export interface SpeechPort { capability(language: string): Promise<SpeechCapability>; start(language: string, onFinal: (text: string) => void, onInterim?: (text: string) => void): Promise<void>; stop(): void; cancel(): void; }
