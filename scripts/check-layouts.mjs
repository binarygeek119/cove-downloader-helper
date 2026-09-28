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
  assert(video[0].button.shape === 'pill' && video[0].button.showText === true, 'video pill');
  assert(video[0].anchor.replace === false, 'insert beside does not replace');
  assert(video[0].button.stack === false, 'default button is a row');
  assert(
    video[0].anchor.selector === '.userActions .js_videoSubscribeButton' && video[0].anchor.insert === 'afterend',
    'video sits beside subscribe'
  );

  const albumUrl = matchLayoutTargets([sample], 'https://www.pornhub.com/album/80791185');
  assert(albumUrl.length === 0, 'album path is not used');

  const photo = matchLayoutTargets([sample], 'https://www.pornhub.com/photo/868704295');
  const photoIds = photo.map((target) => target.id).sort().join();
  assert(photoIds === 'album,photo', 'photo page matches both image targets');
  assert(photo.every((target) => target.entity === 'Image' && target.path === '/photo'), 'photo path');
  const photoBar = photo.find((target) => target.id === 'photo');
  assert(photoBar.button.size === 'small' && photoBar.button.showText === false, 'photo icon');
  assert(photoBar.button.colors.background === '#000000' && photoBar.button.colors.icon === '#ffffff', 'photo icon matches the bar');
  assert(photoBar.anchor.selector === '#ratingSpace > li.omega' && photoBar.anchor.insert === 'afterend', 'photo bar');
  assert(photo.find((target) => target.id === 'album').anchor.selector === '.photoAlbum', 'photo album block');

  const gifPage = matchLayoutTargets([sample], 'https://www.pornhub.com/gif/55153161');
  const gifIds = gifPage.map((target) => target.id).sort().join();
  assert(gifIds === 'gif,gifs', 'gif page matches both gif targets');
  assert(gifPage.every((target) => target.entity === 'Image' && target.path === '/gif'), 'gif path');
  const gifBar = gifPage.find((target) => target.id === 'gif');
  assert(gifBar.button.size === 'small' && gifBar.button.showText === false, 'gif icon');
  assert(gifBar.button.colors.background === '#000000' && gifBar.button.colors.icon === '#ffffff', 'gif icon matches the bar');
  assert(
    gifBar.anchor.selector === 'ul.votingWrap > li:has(#favoriteGifButton)' &&
      gifBar.anchor.insert === 'afterend',
    'gif bar'
  );
  assert(gifPage.find((target) => target.id === 'gifs').anchor.selector === '.gifVideoBlock', 'gif grid');

  const gifListing = matchLayoutTargets([sample], 'https://www.pornhub.com/gifs');
  assert(gifListing.map((target) => target.id).sort().join() === 'gif,gifs', '/gifs uses the /gif prefix');

  const gifLater = matchLayoutTargets([sample], 'https://www.pornhub.com/user/gifs');
  assert(gifLater.length === 0, 'path must be a prefix, not a later segment');
  const gifShort = matchLayoutTargets([sample], 'https://www.pornhub.com/gi');
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
        id: 'photo-special',
        path: '/photo/special',
      },
    ],
  };
  const special = matchLayoutTargets([longer], 'https://pornhub.com/photo/special/1');
  assert(special.length === 1 && special[0].id === 'photo-special', 'longest path wins');
  const plainPhoto = matchLayoutTargets([longer], 'https://pornhub.com/photo/868704295');
  assert(plainPhoto.length === 1 && plainPhoto[0].id === 'album', 'shorter path stays');

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

  const clear = structuredClone(sample);
  clear.targets[0].button.colors.background = 'transparent';
  clear.targets[0].button.colors.border = 'Transparent';
  clear.targets[0].button.colors.hoverBackground = 'transparent';
  assert(validateLayout(clear).length === 0, 'backing colors may be transparent');
  const cleared = matchLayoutTargets(
    [clear],
    'https://www.pornhub.com/view_video.php?viewkey=63e69d5ec09f3'
  );
  assert(cleared[0].button.colors.background === 'transparent', 'transparent background is kept');
  assert(cleared[0].button.colors.border === 'transparent', 'transparent border is normalized');
  assert(cleared[0].button.colors.icon === '#ffffff', 'icon color stays');
  clear.targets[0].button.colors.icon = 'transparent';
  assert(validateLayout(clear).some((error) => error.includes('icon')), 'icon cannot be transparent');

  const replacing = structuredClone(sample);
  replacing.targets[0].anchor = {
    selector: '#download',
    insert: 'beforebegin',
    replace: true,
  };
  assert(validateLayout(replacing).length === 0, 'replace is optional true');
  const replaced = matchLayoutTargets(
    [replacing],
    'https://www.pornhub.com/view_video.php?viewkey=63e69d5ec09f3'
  );
  assert(replaced[0].anchor.replace === true && replaced[0].anchor.insert === 'beforebegin', 'replace is kept');

  const badStack = structuredClone(sample);
  badStack.targets[0].button.stack = 'yes';
  assert(validateLayout(badStack).some((error) => error.includes('stack')), 'stack must be boolean');

  const badReplace = structuredClone(replacing);
  badReplace.targets[0].anchor.replace = 'yes';
  assert(validateLayout(badReplace).some((error) => error.includes('replace')), 'replace must be boolean');
  badReplace.targets[0].anchor.replace = true;
  badReplace.targets[0].anchor.insert = 'beforeend';
  assert(
    validateLayout(badReplace).some((error) => error.includes('beforebegin')),
    'replace cannot insert inside the hidden control'
  );

  const xvideos = JSON.parse(fs.readFileSync(path.join(layoutDir, 'xvideos.lay'), 'utf8'));
  assert(validateLayout(xvideos).length === 0, 'xvideos layout should be valid');
  const watch = matchLayoutTargets([xvideos], 'https://www.xvideos.com/video.exampleid/watch');
  assert(watch.length === 1 && watch[0].id === 'watch' && watch[0].entity === 'Video', 'xvideos watch');
  assert(
    watch[0].anchor.selector === '#anc-tst-dl-btn' &&
      watch[0].anchor.insert === 'beforebegin' &&
      watch[0].anchor.replace === true,
    'xvideos replaces the download button'
  );
  assert(
    watch[0].button.colors.background === '#ffffff' &&
      watch[0].button.colors.icon === '#a8a8a8' &&
      watch[0].button.colors.text === '#000000',
    'xvideos button colors'
  );
  assert(watch[0].button.stack === true && watch[0].button.showText === true, 'xvideos stacks the icon and label');
  const listing = matchLayoutTargets([xvideos], 'https://www.xvideos.com/');
  assert(listing.length === 0, 'xvideos home is not a watch page');
  const liked = matchLayoutTargets([xvideos], 'https://www.xvideos.com/videos-i-like');
  assert(liked.length === 0, 'videos-i-like does not use the watch prefix');
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
