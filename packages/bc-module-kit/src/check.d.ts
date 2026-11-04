export declare const DEFAULT_LIMIT_BYTES: number;
export declare const FRAMEWORK_PACKAGES: readonly string[];
export declare const FRAMEWORK_MARKERS: ReadonlyArray<{ framework: string; marker: string }>;
export declare function parseLimit(value: string | number): number;
export declare function findFrameworkCode(source: string): string[];
export declare function importsOf(source: string): string[];
export declare function checkEntries(
  manifestPath: string,
  options?: { limit?: number | string; dataEntries?: string[]; metafile?: string },
): { problems: string[]; dataEntries: Array<{ entry: string; files: string[]; bytes: number }> };
