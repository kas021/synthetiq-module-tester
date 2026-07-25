#!/usr/bin/env node
'use strict';

const { inspectModule } = require('../lib/inspect.js');

const args = process.argv.slice(2);
const zipPath = args.find((arg) => !arg.startsWith('-'));
if (!zipPath || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: synthetiq-module-tester <module.zip> [--json]');
  console.log('Static contract inspection only. Playback remains unverified.');
  process.exit(zipPath ? 0 : 1);
}

const result = inspectModule(zipPath);
if (args.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${result.status} · ${result.evidenceLevel} · ${result.playback}`);
  if (result.module) console.log(`Module: ${result.module.name || result.module.id || 'unknown'}`);
  result.errors.forEach((item) => console.log(`ERROR [${item.code}] ${item.message}`));
  result.warnings.forEach((item) => console.log(`NOTE [${item.code}] ${item.message}`));
}
process.exit(result.status === 'PASS' ? 0 : 1);
