#!/usr/bin/env node
// The xHamster player cipher must match yt-dlp's decipher, and a watch page
// must prefer the playlist from that player.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({ console, URL });
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'shared.js'), 'utf8'), context, {
  filename: 'shared.js',
});
vm.runInContext(fs.readFileSync(path.join(root, 'src', 'xhamster-media.js'), 'utf8'), context, {
  filename: 'xhamster-media.js',
});

const {
  decipherXhamsterHex,
  resolveXhamsterFormatUrl,
  xhamsterStreamUrl,
  xhamsterPlayerCandidates,
  isXhamsterWatchUrl,
  collectXhamsterPlayerUrlsInPage,
} = context;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const python = String.raw`
import json, sys, urllib.parse
def int_to_int32(n):
    n &= 0xFFFFFFFF
    if n & 0x80000000:
        return n - 0x100000000
    return n
class Gen:
    def __init__(self, algo, seed):
        self._s = int_to_int32(seed)
        self._algorithm = getattr(self, f"_algo{algo}")
    def _algo1(self, s):
        s = self._s = int_to_int32(s * 1664525 + 1013904223)
        return s
    def _algo2(self, s):
        s = int_to_int32(s ^ (s << 13))
        s = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 17))
        s = self._s = int_to_int32(s ^ (s << 5))
        return s
    def _algo3(self, s):
        s = self._s = int_to_int32(s + 0x9e3779b9)
        s = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 16))
        s = int_to_int32(s * int_to_int32(0x85ebca77))
        s = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 13))
        s = int_to_int32(s * int_to_int32(0xc2b2ae3d))
        return int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 16))
    def _algo4(self, s):
        s = self._s = int_to_int32(s + 0x6d2b79f5)
        s = int_to_int32((s << 7) | ((s & 0xFFFFFFFF) >> 25))
        s = int_to_int32(s + 0x9e3779b9)
        s = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 11))
        return int_to_int32(s * 0x27d4eb2d)
    def _algo5(self, s):
        s = int_to_int32(s ^ (s << 7))
        s = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 9))
        s = int_to_int32(s ^ (s << 8))
        s = self._s = int_to_int32(s + 0xa5a5a5a5)
        return s
    def _algo6(self, s):
        s = self._s = int_to_int32(s * int_to_int32(0x2c9277b5) + int_to_int32(0xac564b05))
        s2 = int_to_int32(s ^ ((s & 0xFFFFFFFF) >> 18))
        shift = (s & 0xFFFFFFFF) >> 27 & 31
        return int_to_int32((s2 & 0xFFFFFFFF) >> shift)
    def _algo7(self, s):
        s = self._s = int_to_int32(s + int_to_int32(0x9e3779b9))
        e = int_to_int32(s ^ (s << 5))
        e = int_to_int32(e * int_to_int32(0x7feb352d))
        e = int_to_int32(e ^ ((e & 0xFFFFFFFF) >> 15))
        return int_to_int32(e * int_to_int32(0x846ca68b))
    def __next__(self):
        return self._algorithm(self._s) & 0xFF
def encrypt(algo, seed, text):
    gen = Gen(algo, seed)
    body = bytes([b ^ next(gen) for b in text.encode("latin1")])
    return (bytes([algo]) + int(seed).to_bytes(4, "little", signed=True) + body).hex()
def unwrap(format_url):
    parsed = urllib.parse.urlparse(format_url)
    hex_string, rem = __import__("re").search(r"^/([0-9a-fA-F]{12,})([/,].+)$", parsed.path).groups()
    data = bytes.fromhex(hex_string)
    gen = Gen(data[0], int.from_bytes(data[1:5], "little", signed=True))
    text = bytes([b ^ next(gen) for b in data[5:]]).decode("latin1")
    return parsed._replace(path=f"/{text}{rem}").geturl()
samples = json.loads(sys.argv[1])
out = []
for sample in samples:
    cipher = encrypt(sample["algo"], sample["seed"], sample["text"])
    wrapped = "https://files.example/" + cipher + ",rest?token=1"
    out.append({"cipher": cipher, "wrapped": unwrap(wrapped)})
print(json.dumps(out))
`;

const samples = [];
for (let algo = 1; algo <= 7; algo += 1) {
  samples.push({
    algo,
    seed: algo === 3 ? -8951 : 0x10203040 + algo,
    text: `https://cdn.example/video/master.m3u8?q=${algo}`,
  });
}
samples.push({ algo: 1, seed: -2147483648, text: 'https://cdn.example/a.m3u8' });

const oracle = JSON.parse(
  execFileSync('python3', ['-c', python, JSON.stringify(samples)], { encoding: 'utf8' })
);

oracle.forEach((item, index) => {
  const sample = samples[index];
  assert(decipherXhamsterHex(item.cipher) === sample.text, `algo ${sample.algo} decipher`);
  const wrapped = `https://files.example/${item.cipher},rest?token=1`;
  assert(resolveXhamsterFormatUrl(wrapped) === item.wrapped, `algo ${sample.algo} wrapped url`);
});

assert(decipherXhamsterHex('abcd') === '', 'short hex is ignored');
assert(decipherXhamsterHex('001122334455') === '', 'unknown algorithm is ignored');
assert(resolveXhamsterFormatUrl('https://cdn.example/plain/master.m3u8') === 'https://cdn.example/plain/master.m3u8', 'plain playlist');

const playlist = oracle[0].cipher;
const initials = {
  xplayerSettings: {
    sources: {
      hls: { url: playlist, fallback: 'zz' },
      standard: {
        h264: [{ url: 'https://cdn.example/file.mp4', fallback: '' }],
      },
    },
  },
  videoModel: {
    sources: {
      download: { '720p': 'https://cdn.example/download.m3u8' },
      mp4: { '720p': 'https://cdn.example/progressive.mp4' },
    },
  },
};
const candidates = xhamsterPlayerCandidates(initials, [
  'blob:https://xhamster.com/player',
  'https://cdn.example/seen.m3u8',
  'https://cdn.example/poster.jpg',
]);
assert(candidates[0] === playlist, 'hls ciphertext stays first');
assert(!candidates.includes('blob:https://xhamster.com/id'), 'blob addresses are skipped');
assert(candidates.includes('https://cdn.example/download.m3u8') === false, 'download links are skipped');
assert(xhamsterStreamUrl(candidates) === samples[0].text, 'first playlist wins over a later file');

context.window = { initials };
context.document = {
  querySelector() {
    return { currentSrc: 'blob:https://xhamster.com/player', src: '' };
  },
};
context.performance = {
  getEntriesByType() {
    return [{ name: 'https://cdn.example/seen.m3u8' }, { name: 'https://cdn.example/poster.jpg' }];
  },
};
assert(
  JSON.stringify(collectXhamsterPlayerUrlsInPage()) === JSON.stringify(candidates),
  'page collector matches the candidate list'
);

assert(isXhamsterWatchUrl('https://xhamster.com/videos/example-xh7BSw0'), 'watch page');
assert(isXhamsterWatchUrl('https://www.xhamster.com/videos/example-xh7BSw0?foo=1'), 'www watch page');
assert(isXhamsterWatchUrl('https://ge.xhamster.com/videos/example-xh7BSw0'), 'subdomain watch page');
assert(!isXhamsterWatchUrl('https://xhamster.com/'), 'home is not a watch page');
assert(!isXhamsterWatchUrl('https://xhamster.com/categories/example'), 'category is not a watch page');
assert(!isXhamsterWatchUrl('https://example.com/videos/example-xh7BSw0'), 'other hosts are not xhamster');

console.log('xhamster media ok');
