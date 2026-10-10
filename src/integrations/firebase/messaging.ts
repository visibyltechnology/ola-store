import { useState, useEffect, useCallback } from 'react';

interface StorageOptions<T> { key: string; initial: T; }

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useLocalStorage<T>({ key, initial }: StorageOptions<T>) {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; }
    catch { return initial; }
  });
  const set = useCallback((v: T) => { setVal(v); localStorage.setItem(key, JSON.stringify(v)); }, [key]);
  return [val, set] as const;
}

export const formatCurrency = (amount: number, currency = 'NGN'): string =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount);

export const slugify = (str: string): string =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> =>
  arr.reduce((acc, item) => {
    const k = String(item[key]); if (!acc[k]) acc[k] = []; acc[k].push(item); return acc;
  }, {} as Record<string, T[]>);