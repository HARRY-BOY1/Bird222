// ينزّل حزمة ملصقات Fluent Emoji (ترخيص MIT) من microsoft/fluentui-emoji
// ويولّد js/stickers.js — لا يُشغّل وقت التشغيل، فقط عند التحديث.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const STICKERS = [
  ['Smiling face with smiling eyes', 'smiling_face_with_smiling_eyes', 'ابتسامة'],
  ['Grinning face', 'grinning_face', 'ضحكة'],
  ['Face with tears of joy', 'face_with_tears_of_joy', 'ضحك'],
  ['Winking face', 'winking_face', 'غمزة'],
  ['Smiling face with hearts', 'smiling_face_with_hearts', 'حب'],
  ['Face blowing a kiss', 'face_blowing_a_kiss', 'قبلة'],
  ['Thinking face', 'thinking_face', 'تفكير'],
  ['Star-struck', 'star_struck', 'إعجاب'],
  ['Face screaming in fear', 'face_screaming_in_fear', 'صدمة'],
  ['Melting face', 'melting_face', 'إحراج'],
  ['Red heart', 'red_heart', 'قلب'],
  ['Thumbs up', 'thumbs_up', 'ممتاز'],
  ['Clapping hands', 'clapping_hands', 'تصفيق'],
  ['Fire', 'fire', 'نار'],
  ['Party popper', 'party_popper', 'احتفال'],
  ['Rocket', 'rocket', 'صاروخ'],
  ['Sparkles', 'sparkles', 'بريق'],
  ['Hundred points', 'hundred_points', 'مئة'],
];

const OUT_DIR = path.join(__dirname, '..', 'assets', 'stickers');
fs.mkdirSync(OUT_DIR, { recursive: true });

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'bird-build' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return fetchBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`${res.statusCode} ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

(async () => {
  const items = [];
  for (const [folder, slug, label] of STICKERS) {
    const url = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${encodeURIComponent(folder)}/Flat/${slug}_flat.svg`;
    try {
      const data = await fetchBuffer(url);
      fs.writeFileSync(path.join(OUT_DIR, `${slug}.svg`), data);
      items.push({ id: slug, label });
      console.log(`ok ${slug} (${data.length}b)`);
    } catch (error) {
      console.warn(`skip ${slug}: ${error.message}`);
    }
  }
  const js = `// تم التوليد بواسطة scripts/fetch-stickers.js — Fluent Emoji (MIT, Microsoft)\nwindow.StickerPack = ${JSON.stringify({ name: 'ملصقات Bird', items }, null, 2)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'stickers.js'), js);
  console.log(`stickers: ${items.length}`);
})();
