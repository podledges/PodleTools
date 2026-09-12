/** USD -> SGD display estimates. No imports from Pi, provider mutation, or render I/O. */
import { readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const RATE_SOURCE = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=SGD';
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
export const FETCH_TIMEOUT_MS = 5000;
export const cachePath = () => process.env.PI_SGD_RATE_CACHE || join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'pi', 'usd-sgd.json');
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

export function validateRate(record, now = Date.now()) {
  if (!record || record.schema !== 1 || record.base !== 'USD' || record.quote !== 'SGD' || record.source !== RATE_SOURCE || !positive(record.rate)) throw new Error('Invalid USD/SGD cache record');
  if (!validDate(record.asOf) || Date.parse(record.asOf) > now) throw new Error('Invalid rate observation date');
  if (typeof record.fetchedAt !== 'string' || !Number.isFinite(Date.parse(record.fetchedAt)) || new Date(record.fetchedAt).toISOString() !== record.fetchedAt || Date.parse(record.fetchedAt) > now + 60000 || Date.parse(record.fetchedAt) < Date.parse(record.asOf)) throw new Error('Invalid rate fetch timestamp');
  return record;
}
export function parseRateResponse(data, now = Date.now()) {
  if (!data || data.base !== 'USD' || data.amount !== 1 || !positive(data.rates?.SGD)) throw new Error('Invalid USD/SGD response');
  return validateRate({ schema: 1, base: 'USD', quote: 'SGD', rate: data.rates.SGD, asOf: data.date, fetchedAt: new Date(now).toISOString(), source: RATE_SOURCE }, now);
}
export function readRateCache(path = cachePath(), now = Date.now()) {
  try { return validateRate(JSON.parse(readFileSync(path, 'utf8')), now); }
  catch { return undefined; }
}
export function needsRefresh(record, now = Date.now()) {
  return !record || now - Date.parse(record.fetchedAt) >= REFRESH_AFTER_MS;
}
export function formatSgdCost(usd, record) {
  // usage.cost.total ALREADY includes cache-token costs. Multiply the accumulated
  // USD total exactly once, then round once for display; never change that usage.
  const sgd = positive(record?.rate) ? usd * record.rate : NaN;
  return Number.isFinite(sgd) ? sgd.toFixed(3) : '—';
}
export function writeRateCache(record, path = cachePath()) {
  validateRate(record);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify(record) + '\n');
    fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path); // Same filesystem: readers see whole old or new record.
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporary); } catch {}
  }
}

/** One bounded request including body consumption. Failed refresh never overwrites LKG. */
export async function refreshRate({ path = cachePath(), fetchImpl = fetch, now = Date.now(), timeoutMs = FETCH_TIMEOUT_MS, signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? new Error('Rate refresh cancelled'));
  signal?.addEventListener('abort', abort, { once: true });
  let timer;
  try {
    if (signal?.aborted) abort();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Rate refresh timed out')); }, Math.max(1, Math.min(timeoutMs, FETCH_TIMEOUT_MS)));
    });
    const request = (async () => {
      controller.signal.throwIfAborted();
      const response = await fetchImpl(RATE_SOURCE, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`Rate source HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 65536) throw new Error('Rate response too large');
      return parseRateResponse(JSON.parse(text), now);
    })();
    const candidate = await Promise.race([request, deadline]);
    controller.signal.throwIfAborted();
    // A stale response must not roll a concurrently refreshed/source-newer cache back.
    const current = readRateCache(path, now);
    if (current && (candidate.asOf < current.asOf || candidate.fetchedAt < current.fetchedAt)) throw new Error('Rate response is older than last-known-good');
    writeRateCache(candidate, path);
    return { status: 'refreshed', rate: candidate };
  } catch (error) {
    const retained = readRateCache(path, now);
    return { status: retained ? 'retained' : 'unavailable', rate: retained, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
