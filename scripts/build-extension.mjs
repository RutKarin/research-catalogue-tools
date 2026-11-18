// Builds the browser extension from one source into two packages:
//   dist/ritlager-chrome-edge/  (+ .zip)  – Chrome and Edge
//   dist/ritlager-firefox/      (+ .zip)  – Firefox
// ritlager/overlay.js is copied as it is, so the bookmarklet and the extension never drift apart.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const base = JSON.parse(readFileSync('extension/src/manifest.base.json', 'utf8'));
base.version = pkg.version;

const targets = {
  'ritlager-chrome-edge': {
    ...base,
    minimum_chrome_version: '111',
    background: { service_worker: 'background.js' }
  },
  'ritlager-firefox': {
    ...base,
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: {
        id: 'ritlager@research-catalogue-tools',
        strict_min_version: '128.0',
        data_collection_permissions: { required: ['none'] }
      }
    }
  }
};

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

rmSync('dist', { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = join('dist', name);
  mkdirSync(join(out, 'ritlager'), { recursive: true });
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  cpSync('extension/src/background.js', join(out, 'background.js'));
  cpSync('extension/src/icons', join(out, 'icons'), { recursive: true });
  cpSync('ritlager/overlay.js', join(out, 'ritlager/overlay.js'));
  cpSync('LICENSE', join(out, 'LICENSE'));

  const entries = {};
  for (const f of files(out)) entries[relative(out, f).split('\\').join('/')] = readFileSync(f);
  writeFileSync(join('dist', `${name}-${pkg.version}.zip`), zipSync(entries, { level: 9 }));
  console.log(`built dist/${name} (${Object.keys(entries).length} files)`);
}
