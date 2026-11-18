// Renders extension/src/icon.svg to the PNG sizes browsers need.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync('extension/src/icon.svg', 'utf8');
mkdirSync('extension/src/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(`extension/src/icons/icon-${size}.png`, png);
  console.log('icon-' + size + '.png');
}
