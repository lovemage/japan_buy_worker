export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<{ success: boolean }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[]; success?: boolean }>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatement;
};
