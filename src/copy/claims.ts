export const BANNED_CLAIM_PATTERNS = [/[Yy]our baby should/, /clinician-ready/i, /doctor-approved/i, /medical-grade/i, /(normal|abnormal)/i, /diagnos/i, /healthy/i];
export function findClaimViolations(text: string): string[] { return BANNED_CLAIM_PATTERNS.filter((pattern) => pattern.test(text)).map(String); }
