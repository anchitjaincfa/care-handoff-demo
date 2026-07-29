export const INITIAL_DATA_GENERATION = "0";

export type DataGenerationSnapshot = Readonly<{ global: string; realm: string }>;

export function sameDataGeneration(left: DataGenerationSnapshot, right: DataGenerationSnapshot): boolean {
  return left.global === right.global && left.realm === right.realm;
}

export class DataGenerationMismatchError extends Error {
  constructor() {
    super("Browser data was deleted or replaced in another tab; reload before writing new local data");
    this.name = "DataGenerationMismatchError";
  }
}

export interface DataGenerationStore {
  readonly realm: "real" | "demo";
  read(): DataGenerationSnapshot;
  rotateRealm(expected: DataGenerationSnapshot): DataGenerationSnapshot;
  rotateGlobal(expected: DataGenerationSnapshot): DataGenerationSnapshot;
  subscribe?(listener: (generation: DataGenerationSnapshot | null) => void): () => void;
}
