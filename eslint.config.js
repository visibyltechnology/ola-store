import { useState, useEffect, useCallback } from 'react';

export function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; }
    catch { return initial; }
  });
  const set = useCallback((v) => { setVal(v); localStorage.setItem(key, JSON.stringify(v)); }, [key]);
  return [val, set];
}

export const formatDate = (d, locale = 'en-NG') =>
  new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(d));

export const truncate = (str, n = 100) => str?.length > n ? str.slice(0, n).trimEnd() + '...' : str;

export const classNames = (...args) => args.filter(Boolean).join(' ');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const groupBy = (arr, key) => arr.reduce((acc, item) => {
  const k = item[key]; if (!acc[k]) acc[k] = []; acc[k].push(item); return acc;
}, {});

export const debounce = (fn, delay) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};