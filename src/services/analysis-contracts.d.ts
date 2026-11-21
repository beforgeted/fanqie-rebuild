/** Public official-detail metadata. Deliberately excludes personal notes and account data. */
export interface AnalysisInput {
  readonly id: string;
  readonly title: string;
  readonly author: string;
  readonly abstract: string;
  readonly meta: string;
  readonly source: Readonly<{kind: 'official-detail'; url: string}>;
}
export interface AnalysisOutput {
  summary: string;
  findings: {label: string; field: 'title' | 'abstract' | 'meta'; quote: string}[];
  unknowns: string[];
}
export interface AnalysisProvider {
  readonly id: string;
  analyze(input: AnalysisInput, options: {signal: AbortSignal}): Promise<AnalysisOutput>;
}
export interface AnalysisService {
  readonly available: boolean;
  analyze(id: string, options?: {signal?: AbortSignal; timeoutMs?: number}): Promise<
    Readonly<AnalysisOutput & {bookId: string; providerId: string}>
  >;
}
