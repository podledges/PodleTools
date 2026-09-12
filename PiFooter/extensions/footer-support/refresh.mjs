#!/usr/bin/env node
import { refreshRate, cachePath, RATE_SOURCE } from './sgd-rate.mjs';

const args = process.argv.slice(2);
if (args.length && args.join(' ') !== '--help') {
  console.error('Usage: pi-sgd-rate-refresh [--help] (override cache via PI_SGD_RATE_CACHE)');
  process.exitCode = 2;
} else if (args[0] === '--help') {
  console.log(`Refresh USD→SGD from ${RATE_SOURCE}\nCache: ${cachePath()}\nBounded to 5s; no footer-render fetch. Exit: 0 refreshed, 1 retained last-known-good, 2 unavailable.\nJSON stdout includes explicit base/quote/rate/source/asOf/fetchedAt and any error.\nSafe for a daily startup hook without reboot; no service is installed or enabled.`);
} else {
  const result = await refreshRate();
  console.log(JSON.stringify(result));
  process.exitCode = result.status === 'refreshed' ? 0 : result.status === 'retained' ? 1 : 2;
}
