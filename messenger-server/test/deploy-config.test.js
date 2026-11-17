const fs = require('node:fs');

// render.yaml sanity check (structure without a YAML parser dependency)
const yaml = fs.readFileSync('render.yaml', 'utf8');
const required = ['rootDir: messenger-server', 'buildCommand: npm install', 'startCommand: npm start', 'JWT_SECRET', 'CORS_ORIGIN', 'DB_PATH'];
for (const token of required) {
  if (!yaml.includes(token)) throw new Error(`render.yaml missing: ${token}`);
}
if (yaml.includes('replace-this') || /JWT_SECRET\s*:\s*[^\s]/.test(yaml)) throw new Error('render.yaml must not contain secret values');
console.log('render.yaml structure OK');

// netlify.toml sanity check
const toml = fs.readFileSync('../messenger-client/netlify.toml', 'utf8');
const publish = toml.match(/publish\s*=\s*"([^"]+)"/)?.[1];
if (publish !== 'messenger-client') throw new Error(`netlify publish dir wrong: ${publish}`);
if (/buildCommand/.test(toml)) throw new Error('netlify.toml should have no build command');
if ((toml.match(/\[\[redirects\]\]/g) || []).length !== 2) throw new Error('netlify.toml should have 2 redirects');
console.log('netlify.toml structure OK');
