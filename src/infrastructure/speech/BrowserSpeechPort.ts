import type { SpeechCapability, SpeechPort } from "@/src/ports/SpeechPort";

export type SpeechFailureCode = "denied" | "unavailable" | "aborted" | "failed";

export class SpeechAccessError extends Error {
  constructor(readonly code: SpeechFailureCode, message: string) {
    super(message);
    this.name = "SpeechAccessError";
  }
}

type RecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type RecognitionEventLike = {
  resultIndex?: number;
  results: ArrayLike<RecognitionResultLike>;
};

type RecognitionErrorLike = { error?: string; message?: string };

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type RecognitionConstructor = {
  new(): RecognitionLike;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function constructorFrom(windowObject: SpeechWindow | undefined): RecognitionConstructor | undefined {
  return windowObject?.SpeechRecognition ?? windowObject?.webkitSpeechRecognition;
}

function permissionDeniedReason(reason: string | undefined): boolean {
  return reason === "not-allowed" || reason === "service-not-allowed";
}

export class BrowserSpeechPort implements SpeechPort {
  private recognition: RecognitionLike | null = null;
  private locality: SpeechCapability["locality"] = "browser-service";

  constructor(
    private readonly windowObject: SpeechWindow | undefined = typeof window === "undefined" ? undefined : window as SpeechWindow,
    private readonly permissions: Permissions | undefined = globalThis.navigator?.permissions,
  ) {}

  async capability(language: string): Promise<SpeechCapability> {
    const Recognition = constructorFrom(this.windowObject);
    if (!Recognition) return { available: false, locality: "unavailable", language, reason: "Speech recognition is unavailable in this browser." };

    try {
      const status = await this.permissions?.query({ name: "microphone" as PermissionName });
      if (status?.state === "denied") return { available: false, locality: "unavailable", language, reason: "Microphone permission is denied." };
    } catch {
      // Permissions.query is not uniformly implemented; recognition itself remains the authority.
    }

    if (Recognition.available) {
      try {
        const probe = new Recognition();
        const availability = await Recognition.available({ langs: [language], processLocally: true });
        if (availability === "available" && "processLocally" in probe) {
          this.locality = "local-confirmed";
          return { available: true, locality: "local-confirmed", language };
        }
      } catch {
        // An inconclusive local probe must never be reported as local processing.
      }
    }

    this.locality = "browser-service";
    return {
      available: true,
      locality: "browser-service",
      language,
      reason: "The browser may use its speech service to transcribe audio.",
    };
  }

  async start(language: string, onFinal: (text: string) => void, onInterim?: (text: string) => void): Promise<void> {
    if (this.recognition) throw new SpeechAccessError("failed", "Speech recognition is already active.");
    const Recognition = constructorFrom(this.windowObject);
    if (!Recognition) throw new SpeechAccessError("unavailable", "Speech recognition is unavailable.");

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    if (this.locality === "local-confirmed" && "processLocally" in recognition) recognition.processLocally = true;
    this.recognition = recognition;

    return new Promise<void>((resolve, reject) => {
      let started = false;
      recognition.onstart = () => { started = true; resolve(); };
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex ?? 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript?.trim();
          if (!transcript) continue;
          if (result?.isFinal) onFinal(transcript);
          else interim = `${interim} ${transcript}`.trim();
        }
        if (interim && onInterim) onInterim(interim);
      };
      recognition.onerror = (event) => {
        this.recognition = null;
        const code = permissionDeniedReason(event.error) ? "denied" : event.error === "aborted" ? "aborted" : "failed";
        const error = new SpeechAccessError(code, code === "denied" ? "Microphone permission was denied." : "Speech recognition could not continue.");
        if (!started) reject(error);
      };
      recognition.onend = () => { this.recognition = null; };
      try {
        recognition.start();
      } catch {
        this.recognition = null;
        reject(new SpeechAccessError("failed", "Speech recognition could not start."));
      }
    });
  }

  stop(): void {
    this.recognition?.stop();
  }

  cancel(): void {
    this.recognition?.abort();
    this.recognition = null;
  }
}