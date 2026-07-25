'use strict';

const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 50;
const CONTENT_TYPES = new Set(['video', 'image', 'text', 'music']);
const REQUIRED_HANDLERS = {
  video: ['searchResults', 'extractDetails', 'extractEpisodes', 'extractStreamUrl'],
  image: ['searchResults', 'extractDetails', 'extractChapters', 'extractImages'],
  text: ['searchResults', 'extractDetails', 'extractChapters', 'extractText'],
  music: ['searchResults', 'extractDetails', 'extractEpisodes', 'extractStreamUrl'],
};

function add(list, level, code, message) {
  list.push({ level, code, message });
}

function exportedBySource(source, handler) {
  const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`globalThis\\.${escaped}\\s*=\\s*(?:async\\s+)?(?:function|\\(|[A-Za-z_$])`).test(source);
}

function inspectModule(zipPath) {
  const errors = [];
  const warnings = [];
  const input = path.resolve(zipPath);

  if (!fs.existsSync(input)) {
    add(errors, 'error', 'ZIP_MISSING', `ZIP does not exist: ${input}`);
    return report(input, null, errors, warnings, []);
  }
  if (fs.statSync(input).size > MAX_ARCHIVE_BYTES) {
    add(errors, 'error', 'ZIP_TOO_LARGE', `ZIP exceeds ${MAX_ARCHIVE_BYTES} byte inspection limit.`);
    return report(input, null, errors, warnings, []);
  }

  let entries;
  try {
    entries = new AdmZip(input).getEntries().filter((entry) => !entry.isDirectory);
  } catch (error) {
    add(errors, 'error', 'ZIP_INVALID', `Could not read ZIP: ${error.message}`);
    return report(input, null, errors, warnings, []);
  }
  if (entries.length > MAX_ENTRIES) add(errors, 'error', 'ZIP_ENTRY_LIMIT', `ZIP has ${entries.length} files; limit is ${MAX_ENTRIES}.`);
  const uncompressed = entries.reduce((sum, entry) => sum + entry.header.size, 0);
  if (uncompressed > MAX_UNCOMPRESSED_BYTES) add(errors, 'error', 'ZIP_UNCOMPRESSED_LIMIT', 'ZIP uncompressed size exceeds inspection limit.');
  if (entries.some((entry) => entry.entryName.startsWith('/') || entry.entryName.split('/').includes('..'))) {
    add(errors, 'error', 'ZIP_PATH_UNSAFE', 'ZIP contains an unsafe path.');
  }

  const jsonEntries = entries.filter((entry) => /\.json$/i.test(entry.entryName));
  const jsEntries = entries.filter((entry) => /\.js$/i.test(entry.entryName));
  if (jsonEntries.length !== 1) add(errors, 'error', 'MANIFEST_COUNT', `Expected exactly one JSON manifest; found ${jsonEntries.length}.`);
  if (jsEntries.length < 1) add(errors, 'error', 'JS_MISSING', 'Expected a JavaScript runtime entry.');
  if (errors.length) return report(input, null, errors, warnings, []);

  let manifest;
  try {
    manifest = JSON.parse(jsonEntries[0].getData().toString('utf8'));
  } catch (error) {
    add(errors, 'error', 'MANIFEST_INVALID_JSON', error.message);
    return report(input, null, errors, warnings, []);
  }

  const id = String(manifest.id || manifest.moduleId || '').trim();
  const name = String(manifest.name || manifest.moduleName || manifest.displayName || '').trim();
  const contentType = String(manifest.contentType || '').trim().toLowerCase();
  const contractVersion = Number(manifest.contractVersion || manifest.formatVersion || 0);
  const entryName = manifest.config?.runtime?.entry;
  if (!id) add(errors, 'error', 'MANIFEST_ID', 'manifest.id (or moduleId) is required.');
  if (!name) add(errors, 'error', 'MANIFEST_NAME', 'manifest.name (or moduleName) is required.');
  if (!CONTENT_TYPES.has(contentType)) add(errors, 'error', 'MANIFEST_CONTENT_TYPE', 'contentType must be video, image, text, or music.');
  if (contractVersion < 3) add(errors, 'error', 'MANIFEST_CONTRACT', 'contractVersion must be 3 or later.');
  if (manifest.config?.runtime?.mode !== 'local') add(errors, 'error', 'MANIFEST_RUNTIME_MODE', 'config.runtime.mode must be "local".');
  if (!entryName) add(errors, 'error', 'MANIFEST_ENTRY', 'config.runtime.entry is required.');
  if (manifest.scriptUrl || manifest.config?.scriptUrl) add(errors, 'error', 'REMOTE_SCRIPT_FORBIDDEN', 'Remote scriptUrl is not allowed.');

  const entry = jsEntries.find((item) => item.entryName.endsWith(`/${entryName}`) || item.entryName === entryName);
  if (!entry) {
    add(errors, 'error', 'ENTRY_NOT_FOUND', `Runtime entry "${entryName}" is not in the ZIP.`);
    return report(input, manifest, errors, warnings, []);
  }
  const source = entry.getData().toString('utf8');
  try {
    new vm.Script(source, { filename: entry.entryName });
  } catch (error) {
    add(errors, 'error', 'JS_SYNTAX', error.message);
  }

  const handlers = REQUIRED_HANDLERS[contentType] || [];
  const exports = handlers.filter((handler) => exportedBySource(source, handler));
  handlers.filter((handler) => !exports.includes(handler)).forEach((handler) => {
    add(errors, 'error', 'HANDLER_MISSING', `globalThis.${handler} export was not found.`);
  });
  if (/streams\s*:\s*\[\s*\[/m.test(source)) {
    add(warnings, 'warning', 'NESTED_STREAMS_POSSIBLE', 'Possible nested streams array found. Synthetiq Player expects the documented flat label/URL stream contract.');
  }
  add(warnings, 'warning', 'CONTRACT_ONLY', 'This tool does not execute module code, make network requests, import into Flutter, or prove playback.');
  return report(input, manifest, errors, warnings, exports);
}

function report(zipPath, manifest, errors, warnings, exports) {
  return {
    tool: 'synthetiq-module-tester',
    evidenceLevel: 'CONTRACT_ONLY',
    status: errors.length ? 'FAIL' : 'PASS',
    playback: 'PLAYBACK_UNVERIFIED',
    zipPath,
    module: manifest ? {
      id: manifest.id || manifest.moduleId || null,
      name: manifest.name || manifest.moduleName || manifest.displayName || null,
      contentType: manifest.contentType || null,
      contractVersion: manifest.contractVersion || manifest.formatVersion || null,
    } : null,
    exports,
    errors,
    warnings,
  };
}

module.exports = { inspectModule };
