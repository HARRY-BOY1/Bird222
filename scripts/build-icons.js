const fs = require('node:fs');
const path = require('node:path');
const dir = 'assets/icons';
const out = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
  const name = f.replace('.svg', '');
  const svg = fs.readFileSync(path.join(dir, f), 'utf8');
  const inner = (svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/) || [])[1] || '';
  out.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${inner}</symbol>`);
}
fs.writeFileSync('assets/icons.svg', `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${out.join('')}</svg>`);
console.log(`sprite built with ${out.length} symbols, bytes: ${fs.statSync('assets/icons.svg').size}`);
