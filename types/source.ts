export interface RawSourceRecord {
  id: string;
  sourceId: string;
  externalId?: string;
  sourceUrl: string;
  fetchedAt: string;
  rawPayload: unknown;
}

export interface NormalizationResult<T> {
  data: T;
  warnings: string[];
  errors: string[];
  confidence: number;
}

export interface SourceAdapter<T> {
  readonly id: string;
  readonly name: string;
  fetch(): Promise<RawSourceRecord[]>;
  normalize(record: RawSourceRecord): Promise<NormalizationResult<T>>;
}
