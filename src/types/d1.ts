export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number; rows_read?: number; rows_written?: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[]; success?: boolean }>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatement;
  // D1 在單一 transaction 中依序執行；任何一句失敗整批回滾。
  batch: <T = Record<string, unknown>>(
    statements: D1PreparedStatement[]
  ) => Promise<{ results: T[]; success?: boolean }[]>;
};
