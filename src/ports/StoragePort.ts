export interface StorageStatus { persisted: boolean; quota?: number; usage?: number; }
export interface StoragePort { requestPersistence(): Promise<boolean>; status(): Promise<StorageStatus>; clearApplicationCaches(): Promise<void>; }
