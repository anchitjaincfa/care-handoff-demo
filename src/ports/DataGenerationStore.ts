export const INITIAL_DATA_GENERATION = "0";

export class DataGenerationMismatchError extends Error {
  constructor() {
    super("Browser data was deleted or replaced in another tab; reload before writing new local data");
    this.name = "DataGenerationMismatchError";
  }
}

export interface DataGenerationStore {
  read(): string;
  rotate(expected: string): string;
}
