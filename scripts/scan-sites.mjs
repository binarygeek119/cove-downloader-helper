#!/usr/bin/env node
// Compare the supported-site list, layout files, and SUPPORTED_SITES.md.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function tableRows(sectionBody) {
  const rows = [];
  for (const line of sectionBody.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

function hostsInCell(cell) {
  const hosts = [];
  const pattern = /`([^`]+)`/g;
  let match;
  while ((match = pattern.exec(cell))) {
    const token = match[1].toLowerCase();
    if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(token) && !token.includes('..')) {
      hosts.push(token);
    }
  }
  return hosts;
}

function extensionsInCell(cell) {
  const extensions = [];
  const pattern = /`(\.[a-z0-9]+)`/gi;
  let match;
  while ((match = pattern.exec(cell))) {
    extensions.push(match[1].toLowerCase());
  }
  return unique(extensions).sort();
}

function parseSupportedSitesDoc(markdown) {
  const parts = String(markdown || '').split(/^## /m);
  const sections = parts.slice(1).map((part) => {
    const breakAt = part.indexOf('\n');
    const title = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    const body = breakAt === -1 ? '' : part.slice(breakAt + 1);
    return { title, body };
  });
  const sitesSection = sections.find((section) => section.title === 'Sites');
  const rows = [];
  if (sitesSection) {
    const table = tableRows(sitesSection.body);
    const header = table[0] || [];
    table.slice(1).forEach((cells) => {
      if (header[0] === 'Site' && cells[0] === 'Site') return;
      rows.push({
        site: cells[0] || '',
        hosts: hostsInCell(cells[1] || ''),
        bubble: cells[2] || '',
        stylized: cells[3] || '',
        extensions: extensionsInCell(cells[1] || ''),
      });
    });
  }
  const stylizedSections = sections
    .filter((section) => section.title.endsWith(' stylized button'))
    .map((section) => {
      const site = section.title.slice(0, -' stylized button'.length);
      const table = tableRows(section.body);
      const headerIndex = table.findIndex((cells) => cells[0] === 'Page' && cells[1] === 'Path');
      const paths = [];
      const blankPath = [];
      if (headerIndex !== -1) {
        table.slice(headerIndex + 1).forEach((cells) => {
          const wrapped = (cells[1] || '').match(/`(\/[^`]*)`/);
          if (wrapped) paths.push(wrapped[1]);
          else blankPath.push(cells[0] || '(blank row)');
        });
      }
      return { site, title: section.title, hasPathTable: headerIndex !== -1, paths, blankPath };
    });
  return { hasSitesSection: !!sitesSection, rows, stylizedSections };
}

function readHostList(source) {
  const match = String(source).match(/const SUPPORTED_SITE_HOSTS = (\[[\s\S]*?\]);/);
  if (!match) return null;
  const hosts = vm.runInNewContext(`(${match[1]})`);
  if (!Array.isArray(hosts) || hosts.some((host) => typeof host !== 'string')) return null;
  return hosts.map((host) => host.toLowerCase());
}

function readDirectExtensions(source) {
  const match = String(source).match(/const DIRECT_MEDIA_EXT = \/\\\.\(([^)]+)\)\$\/i;/);
  if (!match) return null;
  return unique(match[1].split('|').map((ext) => `.${ext.toLowerCase()}`)).sort();
}

function findSiteIssues({ markdown, hosts, extensions, layouts }) {
  const issues = [];
  const doc = parseSupportedSitesDoc(markdown);
  if (!doc.hasSitesSection) {
    issues.push('SUPPORTED_SITES.md is missing the Sites section');
    return issues;
  }
  if (!hosts) {
    issues.push('SUPPORTED_SITE_HOSTS is missing from src/shared.js');
    return issues;
  }
  if (!extensions) {
    issues.push('DIRECT_MEDIA_EXT is missing from src/shared.js');
  }

  const documented = [];
  const hostRows = new Map();
  doc.rows.forEach((row) => {
    if (row.bubble !== 'Yes') {
      issues.push(`${row.site} should show the supported-sites bubble`);
    }
    if (row.stylized !== 'Yes' && row.stylized !== 'No') {
      issues.push(`${row.site} stylized column must be Yes or No`);
    }
    row.hosts.forEach((host) => {
      documented.push(host);
      if (hostRows.has(host)) {
        issues.push(`${host} is listed for both ${hostRows.get(host)} and ${row.site}`);
      } else {
        hostRows.set(host, row.site);
      }
    });
  });

  hosts.forEach((host) => {
    if (!hostRows.has(host)) {
      issues.push(`${host} is in SUPPORTED_SITE_HOSTS but missing from SUPPORTED_SITES.md`);
    }
  });
  unique(documented).forEach((host) => {
    if (!hosts.includes(host)) {
      issues.push(`${host} is in SUPPORTED_SITES.md but missing from SUPPORTED_SITE_HOSTS`);
    }
  });

  const directRows = doc.rows.filter((row) => row.site === 'Direct media file');
  if (directRows.length !== 1) {
    issues.push('SUPPORTED_SITES.md must list one Direct media file row');
  } else if (extensions) {
    const listed = directRows[0].extensions;
    listed
      .filter((ext) => !extensions.includes(ext))
      .forEach((ext) => issues.push(`Direct media file lists ${ext}, which the extension does not treat as media`));
    extensions
      .filter((ext) => !listed.includes(ext))
      .forEach((ext) => issues.push(`Direct media file is missing ${ext}`));
  }

  const layoutsByHost = new Map();
  (layouts || []).forEach((layout) => {
    (layout.hosts || []).forEach((host) => {
      const key = String(host).toLowerCase();
      if (!layoutsByHost.has(key)) layoutsByHost.set(key, []);
      layoutsByHost.get(key).push(layout);
    });
  });

  const stylizedBySite = new Map();
  doc.stylizedSections.forEach((section) => {
    if (stylizedBySite.has(section.site)) {
      issues.push(`${section.title} is duplicated`);
    }
    stylizedBySite.set(section.site, section);
  });

  doc.rows
    .filter((row) => row.stylized === 'Yes')
    .forEach((row) => {
      const section = stylizedBySite.get(row.site);
      if (!section) {
        issues.push(`${row.site} is marked with a stylized download button but has no section in SUPPORTED_SITES.md`);
        return;
      }
      if (!section.hasPathTable) {
        issues.push(`${section.title} is missing the path table`);
      }
      section.blankPath.forEach((page) => {
        issues.push(`${section.title} has no path for ${page}`);
      });
      const layoutPaths = [];
      const missingHosts = [];
      row.hosts.forEach((host) => {
        const matches = layoutsByHost.get(host) || [];
        if (!matches.length) missingHosts.push(host);
        matches.forEach((layout) => layoutPaths.push(...layout.paths));
      });
      missingHosts.forEach((host) => {
        issues.push(`${row.site} is marked with a stylized download button but no layout lists ${host}`);
      });
      if (!missingHosts.length && section.hasPathTable) {
        const documentedPaths = unique(section.paths).sort();
        const actualPaths = unique(layoutPaths).sort();
        documentedPaths
          .filter((item) => !actualPaths.includes(item))
          .forEach((item) => issues.push(`${row.site} lists ${item}, which is not a layout path`));
        actualPaths
          .filter((item) => !documentedPaths.includes(item))
          .forEach((item) => issues.push(`${row.site} is missing layout path ${item}`));
      }
    });

  doc.stylizedSections.forEach((section) => {
    const row = doc.rows.find((item) => item.site === section.site);
    if (!row || row.stylized !== 'Yes') {
      issues.push(`${section.title} does not match a site marked with a stylized download button`);
    }
  });

  (layouts || []).forEach((layout) => {
    (layout.hosts || []).forEach((host) => {
      const key = String(host).toLowerCase();
      const site = hostRows.get(key);
      if (!site) return;
      const row = doc.rows.find((item) => item.site === site);
      if (row && row.stylized !== 'Yes') {
        issues.push(`${layout.file} lists ${key}, and SUPPORTED_SITES.md does not mark that host with a stylized download button`);
      }
    });
  });

  return issues;
}

function runSelfTests() {
  const markdown = `# Supported sites

## Sites

| Site | Hosts | Supported-sites bubble | Stylized download button | Notes |
| --- | --- | --- | --- | --- |
| Direct media file | Any host. The path ends in \`.mp4\`, \`.png\` | Yes | No | |
| Example | \`example.com\` | Yes | Yes | |
| Other | \`other.com\`, \`cdn.other.com\` | Yes | No | |

## Example stylized button

| Page | Path | Button | Sends |
| --- | --- | --- | --- |
| Watch | \`/watch\` | Download | Video |
| Clip | \`/watch\` | Icon | Video |
`;
  const clean = findSiteIssues({
    markdown,
    hosts: ['example.com', 'other.com', 'cdn.other.com'],
    extensions: ['.mp4', '.png'],
    layouts: [{ file: 'example.lay', hosts: ['example.com'], paths: ['/watch'] }],
  });
  assert(clean.length === 0, `clean fixture should pass: ${clean.join('; ')}`);

  const drifted = findSiteIssues({
    markdown,
    hosts: ['example.com', 'other.com', 'missing.com'],
    extensions: ['.mp4', '.gif'],
    layouts: [{ file: 'example.lay', hosts: ['example.com'], paths: ['/clip'] }],
  });
  assert(drifted.some((issue) => issue.includes('missing.com') && issue.includes('SUPPORTED_SITE_HOSTS')), 'missing code host');
  assert(drifted.some((issue) => issue.includes('cdn.other.com') && issue.includes('SUPPORTED_SITES.md')), 'extra doc host');
  assert(drifted.some((issue) => issue.includes('lists /watch')), 'documented path removed from the layout');
  assert(drifted.some((issue) => issue.includes('missing layout path /clip')), 'layout path missing from the doc');
  assert(drifted.some((issue) => issue.includes('missing .gif')), 'missing media extension');
  assert(drifted.some((issue) => issue.includes('lists .png')), 'extra media extension');

  const unmarked = findSiteIssues({
    markdown: markdown.replace('| Example | `example.com` | Yes | Yes | |', '| Example | `example.com` | Yes | No | |'),
    hosts: ['example.com', 'other.com', 'cdn.other.com'],
    extensions: ['.mp4', '.png'],
    layouts: [{ file: 'example.lay', hosts: ['example.com'], paths: ['/watch'] }],
  });
  assert(
    unmarked.some((issue) => issue.includes('example.lay') && issue.includes('example.com')),
    'layout host marked stylized No'
  );
  assert(
    unmarked.some((issue) => issue.includes('Example stylized button') && issue.includes('does not match')),
    'orphan stylized section'
  );
}

function loadLayouts(layoutDir) {
  return fs
    .readdirSync(layoutDir)
    .filter((name) => name.endsWith('.lay'))
    .sort()
    .map((file) => {
      const data = JSON.parse(fs.readFileSync(path.join(layoutDir, file), 'utf8'));
      const targets = Array.isArray(data.targets) ? data.targets : [];
      return {
        file,
        hosts: Array.isArray(data.hosts) ? data.hosts : [],
        paths: targets.map((target) => target && target.path).filter((item) => typeof item === 'string'),
      };
    });
}

try {
  runSelfTests();
} catch (error) {
  console.error(`site scan self-test failed: ${error.message}`);
  process.exit(1);
}

const shared = fs.readFileSync(path.join(root, 'src', 'shared.js'), 'utf8');
const issues = findSiteIssues({
  markdown: fs.readFileSync(path.join(root, 'SUPPORTED_SITES.md'), 'utf8'),
  hosts: readHostList(shared),
  extensions: readDirectExtensions(shared),
  layouts: loadLayouts(path.join(root, 'src', 'layouts')),
});

if (issues.length) {
  issues.forEach((issue) => console.error(issue));
  process.exit(1);
}

console.log('supported sites ok');
