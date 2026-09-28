#!/usr/bin/env node
// Settings export files are tied to the plugin version. A mismatch, a missing
// key, or a wrong type must not be accepted.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, URL });
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'shared.js'), 'utf8'), context, {
  filename: 'shared.js',
});

const { buildSettingsExport, parseSettingsExport, settingsExportFileName } = context;
const DEFAULT_SETTINGS = vm.runInContext('DEFAULT_SETTINGS', context);
const SETTINGS_EXPORT_MAX_BYTES = vm.runInContext('SETTINGS_EXPORT_MAX_BYTES', context);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'));
const version = manifest.version;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sampleSettings(overrides) {
  return Object.assign({}, DEFAULT_SETTINGS, overrides || {});
}

const saved = sampleSettings({
  coveUrl: 'http://127.0.0.1:5000/',
  apiToken: '  cove_pat_example  ',
  preferredMode: 'Audio',
  showInPageButtons: false,
  showOnSupportedSites: true,
  showStylizedDownloadButton: true,
  autoSend: true,
  openQueueOnDownload: true,
  queueAllMatches: true,
  autoApplyMetadata: false,
});

const exported = buildSettingsExport(version, Object.assign({ extra: 'nope' }, saved));
assert(exported.version === version, 'export version');
assert(!Object.prototype.hasOwnProperty.call(exported.settings, 'extra'), 'export drops unknown keys');
assert(
  Object.keys(exported.settings).join() === Object.keys(DEFAULT_SETTINGS).join(),
  'export key order matches defaults'
);
assert(settingsExportFileName(version) === `cove-downloader-helper-settings-${version}.json`, 'filename');
assert(settingsExportFileName('1.0/../x') === 'cove-downloader-helper-settings-1.0..x.json', 'filename strips slashes');

const text = JSON.stringify(exported, null, 2) + '\n';
const parsed = parseSettingsExport(text, version);
assert(parsed.ok, parsed.error || 'round trip');
assert(parsed.settings.coveUrl === 'http://127.0.0.1:5000', 'cove url normalized');
assert(parsed.settings.apiToken === 'cove_pat_example', 'token trimmed');
assert(parsed.settings.preferredMode === 'Audio', 'mode kept');
assert(parsed.settings.showInPageButtons === false, 'false boolean kept');
assert(parsed.settings.showOnSupportedSites === true, 'true boolean kept');
assert(parsed.settings.autoApplyMetadata === false, 'metadata boolean kept');

function reject(body, message) {
  const result = parseSettingsExport(typeof body === 'string' ? body : JSON.stringify(body), version);
  assert(!result.ok, message + ' was accepted');
  return result.error;
}

assert(
  reject({ version: '0.0.1', settings: exported.settings }, 'other version').includes('0.0.1'),
  'mismatch names the file version'
);
assert(reject({ settings: exported.settings }, 'missing version').includes('missing a plugin version'), 'missing version');

const missing = Object.assign({}, exported.settings);
delete missing.autoSend;
reject({ version, settings: missing }, 'missing key');

const extra = Object.assign({}, exported.settings, { futureFlag: true });
reject({ version, settings: extra }, 'extra key');

const stringBool = Object.assign({}, exported.settings, { autoSend: 'true' });
reject({ version, settings: stringBool }, 'string boolean');

const badMode = Object.assign({}, exported.settings, { preferredMode: 'Image' });
reject({ version, settings: badMode }, 'bad mode');

const badUrl = Object.assign({}, exported.settings, { coveUrl: 'javascript:alert(1)' });
reject({ version, settings: badUrl }, 'bad url');

const ftp = Object.assign({}, exported.settings, { coveUrl: 'ftp://files.example/cove' });
reject({ version, settings: ftp }, 'ftp url');

const emptyUrl = Object.assign({}, exported.settings, { coveUrl: '   ' });
const emptyParsed = parseSettingsExport(JSON.stringify({ version, settings: emptyUrl }), version);
assert(emptyParsed.ok && emptyParsed.settings.coveUrl === '', 'empty cove url');

const https = Object.assign({}, exported.settings, { coveUrl: 'https://cove.example/app/' });
const httpsParsed = parseSettingsExport(JSON.stringify({ version, settings: https }), version);
assert(httpsParsed.ok && httpsParsed.settings.coveUrl === 'https://cove.example/app', 'https cove url');

reject('{', 'invalid json');
reject('', 'empty file');
reject('   ', 'blank file');
reject('null', 'null json');
reject('[]', 'array json');
reject('x'.repeat(SETTINGS_EXPORT_MAX_BYTES + 1), 'oversized file');

const hugeToken = Object.assign({}, exported.settings, { apiToken: 'a'.repeat(8001) });
reject({ version, settings: hugeToken }, 'huge token');

const defaults = parseSettingsExport(JSON.stringify(buildSettingsExport(version, {})), version);
assert(defaults.ok, defaults.error || 'defaults');
assert(defaults.settings.showInPageButtons === true, 'default in-page buttons');
assert(defaults.settings.showStylizedDownloadButton === false, 'default stylized button');
assert(defaults.settings.preferredMode === 'Video', 'default mode');

console.log('settings export ok');
