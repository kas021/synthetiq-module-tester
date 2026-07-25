'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const AdmZip = require('adm-zip');
const { inspectModule } = require('../lib/inspect.js');

function makeZip(source) {
  const zip = new AdmZip();
  zip.addFile('example/example.json', Buffer.from(JSON.stringify({
    id: 'example-v1', name: 'Example', contentType: 'video', contractVersion: 3,
    config: { runtime: { entry: 'index.js', mode: 'local' } },
  })));
  zip.addFile('example/index.js', Buffer.from(source));
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'synthetiq-tester-')), 'module.zip');
  zip.writeZip(target);
  return target;
}

test('accepts a valid static video contract', () => {
  const zip = makeZip([
    'globalThis.searchResults = async function() {};',
    'globalThis.extractDetails = async function() {};',
    'globalThis.extractEpisodes = async function() {};',
    'globalThis.extractStreamUrl = async function() {};',
  ].join('\n'));
  const result = inspectModule(zip);
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidenceLevel, 'CONTRACT_ONLY');
  assert.equal(result.playback, 'PLAYBACK_UNVERIFIED');
});

test('rejects nested stream-array source patterns', () => {
  const zip = makeZip([
    'globalThis.searchResults = async function() {};',
    'globalThis.extractDetails = async function() {};',
    'globalThis.extractEpisodes = async function() {};',
    'globalThis.extractStreamUrl = async function() { return { streams: [["Auto", "https://example.test/video.m3u8"]] }; };',
  ].join('\n'));
  const result = inspectModule(zip);
  assert.ok(result.warnings.some((item) => item.code === 'NESTED_STREAMS_POSSIBLE'));
});
