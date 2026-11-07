import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./client";

export interface ApiState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
  setData: (fn: (prev: T | undefined) => T | undefined) => void;
}

/** Minimal fetch hook: keeps the previous data while refetching so role switches don't flash. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): ApiState<T> {
  const [data, setDataState] = useState<T>();
  const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    fetcher()
      .then((d) => {
        if (id !== seq.current) return;
        setDataState(d);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (id !== seq.current) return;
        setError(e instanceof ApiError ? e : new ApiError("http", String(e)));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn: (prev: T | undefined) => T | undefined) => setDataState(fn), []);
  return { data, error, loading, reload, setData };
}
