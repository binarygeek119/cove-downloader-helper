#!/usr/bin/env node
// Reject layout files that the extension would ignore.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layoutDir = path.join(root, 'src', 'layouts');

const context = vm.createContext({ console, URL });
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'shared.js'), 'utf8'), context, {
  filename: 'shared.js',
});
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'layout-schema.js'), 'utf8'), context, {
  filename: 'layout-schema.js',
});

const { validateLayout, isPlainCssSelector, matchLayoutTargets, layoutKindEntity } = context;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runSelfTests() {
  assert(isPlainCssSelector('.video-wrapper .video-actions-tabs'), 'class descendant');
  assert(isPlainCssSelector('.photoAlbum'), 'single class');
  assert(isPlainCssSelector('div > span.item'), 'child combinator');
  assert(isPlainCssSelector('#id, .a + .b'), 'list and sibling');
  assert(isPlainCssSelector('[data-role="download"]'), 'attribute');
  assert(isPlainCssSelector('button.primary:hover'), 'pseudo-class');
  assert(isPlainCssSelector('.a:not(.b)'), 'not selector');
  assert(!isPlainCssSelector(''), 'empty selector');
  assert(!isPlainCssSelector('   '), 'blank selector');
  assert(!isPlainCssSelector('<img>'), 'html selector');
  assert(!isPlainCssSelector('div{color:red}'), 'style block');
  assert(!isPlainCssSelector('.foo;background:url(javascript:alert(1))'), 'injection selector');
  assert(!isPlainCssSelector('expression(alert(1))'), 'expression selector');

  const sample = JSON.parse(fs.readFileSync(path.join(layoutDir, 'pornhub.lay'), 'utf8'));
  assert(validateLayout(sample).length === 0, 'pornhub sample should be valid');
  assert(layoutKindEntity('video') === 'Video', 'video entity');
  assert(layoutKindEntity('image') === 'Image', 'image entity');
  assert(layoutKindEntity('gif') === 'Image', 'gif entity');
  assert(layoutKindEntity('story') === 'Text', 'story entity');

  const video = matchLayoutTargets(
    [sample],
    'https://www.pornhub.com/view_video.php?viewkey=63e69d5ec09f3'
  );
  assert(video.length === 1 && video[0].kind === 'video' && video[0].entity === 'Video', 'video path');

  const album = matchLayoutTargets([sample], 'https://www.pornhub.com/album/80791185');
  assert(album.length === 1 && album[0].kind === 'image' && album[0].entity === 'Image', 'album path');

  const albums = matchLayoutTargets([sample], 'https://pornhub.com/albums');
  assert(albums.length === 1 && albums[0].id === 'album', 'albums prefix');

  const gifs = matchLayoutTargets([sample], 'https://www.pornhub.com/gifs');
  assert(gifs.length === 1 && gifs[0].kind === 'gif' && gifs[0].entity === 'Image', 'gifs path');

  const gifLater = matchLayoutTargets([sample], 'https://www.pornhub.com/user/gifs');
  assert(gifLater.length === 0, 'path must be a prefix, not a later segment');
  const gifShort = matchLayoutTargets([sample], 'https://www.pornhub.com/gif');
  assert(gifShort.length === 0, 'shorter path does not match');

  const otherHost = matchLayoutTargets([sample], 'https://example.com/view_video.php?viewkey=1');
  assert(otherHost.length === 0, 'other host');

  const longer = {
    version: 1,
    hosts: ['pornhub.com'],
    targets: [
      sample.targets[1],
      {
        ...sample.targets[1],
        id: 'album-special',
        path: '/album/special',
      },
    ],
  };
  const special = matchLayoutTargets([longer], 'https://pornhub.com/album/special/1');
  assert(special.length === 1 && special[0].id === 'album-special', 'longest path wins');
  const plainAlbum = matchLayoutTargets([longer], 'https://pornhub.com/album/80791185');
  assert(plainAlbum.length === 1 && plainAlbum[0].id === 'album', 'shorter path stays');

  for (const size of ['small', 'medium', 'large']) {
    for (const showText of [true, false]) {
      const variant = structuredClone(sample);
      variant.targets[0].button.size = size;
      variant.targets[0].button.showText = showText;
      variant.targets[0].button.shape = showText ? 'pill' : 'square';
      assert(validateLayout(variant).length === 0, `${size} showText ${showText} should be valid`);
    }
  }

  const broken = structuredClone(sample);
  broken.targets[0].button.size = 'huge';
  broken.targets[0].button.colors.background = 'orange';
  broken.targets[1].anchor.selector = '';
  broken.targets[2].anchor.selector = '<script>';
  const errors = validateLayout(broken);
  assert(errors.some((error) => error.includes('size')), 'rejects unknown size');
  assert(errors.some((error) => error.includes('background')), 'rejects bad hex');
  assert(errors.some((error) => error.includes('empty')), 'rejects empty selector');
  assert(errors.some((error) => error.includes('plain CSS')), 'rejects non-css selector');

  const missingPath = structuredClone(sample);
  delete missingPath.targets[0].path;
  assert(validateLayout(missingPath).some((error) => error.includes('path')), 'path is required');
}

function checkFiles() {
  const problems = [];
  const files = fs
    .readdirSync(layoutDir)
    .filter((name) => name.endsWith('.lay'))
    .sort();
  const indexPath = path.join(layoutDir, 'index.json');
  let index = null;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    problems.push(`index.json: ${error.message}`);
  }
  if (!Array.isArray(index)) {
    problems.push('index.json must be an array of layout filenames');
  } else {
    const listed = [...index].sort();
    if (listed.join('\n') !== files.join('\n')) {
      problems.push(`index.json must list exactly: ${files.join(', ') || '(none)'}`);
    }
    index.forEach((name) => {
      if (typeof name !== 'string' || !/^[a-z0-9-]+\.lay$/i.test(name)) {
        problems.push(`index.json entry is not a layout filename: ${name}`);
      }
    });
  }

  files.forEach((name) => {
    const fullPath = path.join(layoutDir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    } catch (error) {
      problems.push(`${name}: ${error.message}`);
      return;
    }
    validateLayout(data).forEach((error) => problems.push(`${name}: ${error}`));
  });

  return problems;
}

try {
  runSelfTests();
} catch (error) {
  console.error(`layout self-test failed: ${error.message}`);
  process.exit(1);
}

const problems = checkFiles();
if (problems.length) {
  problems.forEach((problem) => console.error(problem));
  process.exit(1);
}

const count = fs.readdirSync(layoutDir).filter((name) => name.endsWith('.lay')).length;
console.log(`layout files ok (${count})`);
