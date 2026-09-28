#!/usr/bin/env node
// Fail when the extension adds a known vulnerability pattern.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_EXT = new Set(['.js', '.mjs', '.html', '.json', '.yml', '.yaml', '.lay', '.md', '.sh', '.css', '.txt']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isBroadHost(pattern) {
  const value = String(pattern || '').trim().toLowerCase();
  return (
    value === '<all_urls>' ||
    value === '*://*/*' ||
    value === '*://*' ||
    value === 'http://*/*' ||
    value === 'https://*/*' ||
    value === 'http://*' ||
    value === 'https://*'
  );
}

function lineIssues(file, text, rules) {
  const issues = [];
  String(text).split('\n').forEach((line, index) => {
    rules.forEach((rule) => {
      if (rule.test(line)) issues.push(`${file}:${index + 1}: ${rule.message}`);
    });
  });
  return issues;
}

const CODE_RULES = [
  { test: (line) => /\beval\s*\(/.test(line), message: 'eval() runs code from a string' },
  { test: (line) => /\bnew\s+Function\s*\(/.test(line), message: 'new Function() runs code from a string' },
  { test: (line) => /\bsetTimeout\s*\(\s*['"`]/.test(line), message: 'setTimeout must not take a string of code' },
  { test: (line) => /\bsetInterval\s*\(\s*['"`]/.test(line), message: 'setInterval must not take a string of code' },
  { test: (line) => /\bdocument\.write\s*\(/.test(line), message: 'document.write can inject markup' },
  { test: (line) => /\bjavascript\s*:/i.test(line), message: 'javascript: URL runs code from a string' },
  {
    test: (line) => /\bimportScripts\s*\(\s*['"]https?:/i.test(line),
    message: 'importScripts must not load a remote script',
  },
];

const HTML_RULES = [
  {
    test: (line) => /<script\b[^>]*\bsrc\s*=\s*['"]?(?:https?:)?\/\//i.test(line),
    message: 'script src must not load a remote script',
  },
  { test: (line) => /\bjavascript\s*:/i.test(line), message: 'javascript: URL runs code from a string' },
];

const LAYOUT_RULES = [
  { test: (line) => /\bjavascript\s*:/i.test(line), message: 'layout selector must not use a javascript: URL' },
  { test: (line) => /expression\s*\(/i.test(line), message: 'layout selector must not use expression()' },
  { test: (line) => /url\s*\(/i.test(line), message: 'layout selector must not use url()' },
];

const WORKFLOW_RULES = [
  {
    test: (line) => /^\s*pull_request_target\s*:/.test(line),
    message: 'pull_request_target runs untrusted pull request code with this repository’s credentials',
  },
];

const SECRET_RULES = [
  {
    test: (line) => /-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(line),
    message: 'private key is committed',
  },
  { test: (line) => /AKIA[0-9A-Z]{16}/.test(line), message: 'AWS access key is committed' },
  { test: (line) => /cove_pat_[A-Za-z0-9_-]{12,}/.test(line), message: 'Cove API token is committed' },
  { test: (line) => /gh[pousr]_[A-Za-z0-9]{20,}/.test(line), message: 'GitHub token is committed' },
  { test: (line) => /xox[baprs]-[A-Za-z0-9-]{10,}/.test(line), message: 'Slack token is committed' },
];

function exposedResource(resource) {
  const name = String(resource || '').split('?')[0].toLowerCase();
  if (name === '*' || name.endsWith('/*')) return true;
  return (
    /\.(js|mjs|html|htm)$/.test(name) ||
    name.includes('*.js') ||
    name.includes('*.mjs') ||
    name.includes('*.html')
  );
}

function manifestIssues(file, text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    return [`${file}:1: manifest is not valid JSON`];
  }
  const issues = [];
  if (manifest.manifest_version !== 3) {
    issues.push(`${file}:1: manifest_version must be 3`);
  }
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  permissions.forEach((permission) => {
    if (permission === 'debugger' || isBroadHost(permission)) {
      issues.push(`${file}:1: permission ${permission} is broader than this extension needs`);
    }
  });
  const hostPermissions = Array.isArray(manifest.host_permissions) ? manifest.host_permissions : [];
  hostPermissions.forEach((pattern) => {
    if (isBroadHost(pattern)) {
      issues.push(`${file}:1: host_permissions must not require access to every site`);
    }
  });
  const policy = JSON.stringify(manifest.content_security_policy || '');
  if (/unsafe-eval/i.test(policy)) {
    issues.push(`${file}:1: content security policy must not allow unsafe-eval`);
  }
  if (/unsafe-inline/i.test(policy)) {
    issues.push(`${file}:1: content security policy must not allow unsafe-inline`);
  }
  const external = manifest.externally_connectable && manifest.externally_connectable.matches;
  (Array.isArray(external) ? external : []).forEach((pattern) => {
    if (isBroadHost(pattern)) {
      issues.push(`${file}:1: externally_connectable must not accept every site`);
    }
  });
  const scripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  scripts.forEach((entry) => {
    const matches = entry && Array.isArray(entry.matches) ? entry.matches : [];
    matches.forEach((pattern) => {
      if (isBroadHost(pattern)) {
        issues.push(`${file}:1: content_scripts must not match every site`);
      }
    });
  });
  const resources = [];
  const war = manifest.web_accessible_resources;
  if (Array.isArray(war)) {
    war.forEach((item) => {
      if (typeof item === 'string') resources.push(item);
      else if (item && Array.isArray(item.resources)) resources.push(...item.resources);
    });
  }
  resources.forEach((resource) => {
    if (exposedResource(resource)) {
      issues.push(`${file}:1: web_accessible_resources must not expose ${resource}`);
    }
  });
  return issues;
}

function findVulnerabilities(files) {
  const issues = [];
  files.forEach((file) => {
    const name = file.path.replace(/\\/g, '/');
    const ext = path.extname(name).toLowerCase();
    issues.push(...lineIssues(name, file.text, SECRET_RULES));
    // Shipped extension code only. Dev scripts contain rejected samples on purpose.
    if (name.startsWith('src/') && (ext === '.js' || ext === '.mjs')) {
      issues.push(...lineIssues(name, file.text, CODE_RULES));
    }
    if (name.startsWith('src/') && ext === '.html') {
      issues.push(...lineIssues(name, file.text, HTML_RULES.concat(CODE_RULES)));
    }
    if (name.startsWith('src/') && ext === '.lay') issues.push(...lineIssues(name, file.text, LAYOUT_RULES));
    if (name.startsWith('.github/workflows/') && (ext === '.yml' || ext === '.yaml')) {
      issues.push(...lineIssues(name, file.text, WORKFLOW_RULES));
    }
    if (name === 'src/manifest.json') issues.push(...manifestIssues(name, file.text));
  });
  return issues;
}

function runSelfTests() {
  const cleanManifest = JSON.stringify({
    manifest_version: 3,
    permissions: ['storage'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [{ resources: ['icon.png'], matches: ['https://*/*'] }],
  });
  const clean = findVulnerabilities([
    { path: 'src/app.js', text: 'setTimeout(() => {}, 1);\nimportScripts("shared.js");\n' },
    { path: 'src/app.html', text: '<script src="app.js"></script>\n' },
    { path: 'src/layouts/example.lay', text: '{ "selector": ".download" }\n' },
    { path: 'src/manifest.json', text: cleanManifest },
    { path: '.github/workflows/pack.yml', text: 'on:\n  pull_request:\n' },
    { path: 'README.md', text: 'Paste a PAT (`cove_pat_…`).\n' },
  ]);
  assert(clean.length === 0, `clean fixture should pass: ${clean.join('; ')}`);

  const dirty = findVulnerabilities([
    { path: 'src/app.js', text: 'eval(code);\nnew Function(code);\nsetTimeout("bad()", 1);\n' },
    { path: 'src/page.html', text: '<script src="https://cdn.example/app.js"></script>\n' },
    { path: 'src/layouts/example.lay', text: '{ "selector": "a:url(javascript:bad())" }\n' },
    {
      path: 'src/manifest.json',
      text: JSON.stringify({
        manifest_version: 2,
        permissions: ['debugger'],
        host_permissions: ['<all_urls>'],
        content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" },
        externally_connectable: { matches: ['*://*/*'] },
        content_scripts: [{ matches: ['http://*/*'], js: ['content.js'] }],
        web_accessible_resources: [{ resources: ['app.js'], matches: ['<all_urls>'] }],
      }),
    },
    { path: '.github/workflows/bad.yml', text: 'on:\n  pull_request_target:\n' },
    { path: 'README.md', text: 'token cove_pat_abcdefghijkl\n-----BEGIN PRIVATE KEY-----\n' },
  ]);
  assert(dirty.some((issue) => issue.includes('eval()')), 'flags eval');
  assert(dirty.some((issue) => issue.includes('new Function')), 'flags Function');
  assert(dirty.some((issue) => issue.includes('setTimeout')), 'flags string timer');
  assert(dirty.some((issue) => issue.includes('remote script')), 'flags remote script');
  assert(dirty.some((issue) => issue.includes('url()')), 'flags layout url');
  assert(dirty.some((issue) => issue.includes('manifest_version')), 'flags mv2');
  assert(dirty.some((issue) => issue.includes('debugger')), 'flags debugger permission');
  assert(dirty.some((issue) => issue.includes('host_permissions')), 'flags required broad hosts');
  assert(dirty.some((issue) => issue.includes('unsafe-eval')), 'flags unsafe-eval');
  assert(dirty.some((issue) => issue.includes('externally_connectable')), 'flags external wildcard');
  assert(dirty.some((issue) => issue.includes('content_scripts')), 'flags broad content script');
  assert(dirty.some((issue) => issue.includes('app.js')), 'flags exposed script');
  assert(dirty.some((issue) => issue.includes('pull_request_target')), 'flags pull_request_target');
  assert(dirty.some((issue) => issue.includes('Cove API token')), 'flags a real PAT');
  assert(dirty.some((issue) => issue.includes('private key')), 'flags a private key');
}

function loadFiles(dir, base) {
  const files = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'builds' || entry.name === '.git') return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...loadFiles(full, base));
      return;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXT.has(ext)) return;
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (rel === 'scripts/scan-vulnerabilities.mjs') return;
    files.push({ path: rel, text: fs.readFileSync(full, 'utf8') });
  });
  return files;
}

try {
  runSelfTests();
} catch (error) {
  console.error(`vulnerability scan self-test failed: ${error.message}`);
  process.exit(1);
}

const scanned = [];
['src', 'scripts', '.github', 'store'].forEach((dir) => {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) scanned.push(...loadFiles(full, root));
});
['README.md', 'PRIVACY.md'].forEach((name) => {
  const full = path.join(root, name);
  if (fs.existsSync(full)) scanned.push({ path: name, text: fs.readFileSync(full, 'utf8') });
});

const issues = findVulnerabilities(scanned);
if (issues.length) {
  issues.forEach((issue) => console.error(issue));
  process.exit(1);
}

console.log('vulnerability scan ok');
