# نشر Bird (خادم + واجهة)

## الروابط الحالية

| الجزء | الرابط |
|---|---|
| الواجهة (GitHub Pages) | https://harry-boy1.github.io/Bird222/ |
| المستودع | https://github.com/HARRY-BOY1/Bird222 |
| الخادم | يُحدَّث في `messenger-client/config.js` (نفق Cloudflare مؤقت) |

> رابط الخادم يتغيّر عند كل إعادة تشغيل للنفق. بعد التغيير: حدّث `SERVER_URL` في `config.js`،
> وأضف الأصل الجديد (إن لزم) إلى `CORS_ORIGIN`، ثم ارفع الكود ليُعاد نشر الواجهة.

## بنية المستودع

```
messenger-server/   خادم Express + Socket.IO + SQLite
messenger-client/   واجهة Bird (PWA ثابتة، بلا build)
render.yaml         إعداد نشر الخادم على Render
.github/workflows/deploy-pages.yml   نشر الواجهة على GitHub Pages
```

## 1) الخادم على Render

1. Render Dashboard → **New** → **Blueprint** → اختر هذا المستودع.
2. Render يقرأ `render.yaml` وينشئ خدمة `bird-server` من المجلد `messenger-server`.
3. عند أول نشر يطلب قيمة `CORS_ORIGIN` — ضع رابط الواجهة (GitHub Pages) هنا، مثال:
   `https://USERNAME.github.io/bird`
   ويمكن وضع أكثر من أصل مفصولة بفاصلة.
4. أسماء المتغيرات فقط (لا تُكتب القيم في أي ملف):
   - `JWT_SECRET` — يولّده Render تلقائياً (`generateValue: true`).
   - `CORS_ORIGIN` — رابط الواجهة.
   - `DB_PATH` — مسار ملف SQLite.
   - `PORT` — يضبطه Render تلقائياً.
5. بعد النشر تحقق من: `https://<service>.onrender.com/health` → `{"ok":true}`.

### حفظ البيانات (مهم)
الخطة المجانية في Render لا تدعم قرصاً دائماً، لذلك **تُفقد قاعدة SQLite عند كل إعادة نشر أو إعادة تشغيل**.
للحفظ الدائم: غيّر `plan` إلى `starter` في `render.yaml`، وأزل التعليق عن `disk`، واضبط:

```
DB_PATH=/var/data/bird.sqlite
mountPath: /var/data
```

## 2) الواجهة على GitHub Pages

1. ارفع المشروع إلى GitHub (فرع `main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. أي دفعة على `messenger-client/` تشغّل `deploy-pages.yml` وتنشر الواجهة.
4. رابط الواجهة: `https://USERNAME.github.io/REPO/`

## 3) ربط الواجهة بالخادم

عدّل السطر الوحيد في `messenger-client/config.js`:

```js
const SERVER_URL = 'https://<service>.onrender.com';
```

ثم أضف رابط الواجهة إلى `CORS_ORIGIN` في Render (وإلا سيرفض المتصفح الطلبات).

## 4) بدائل

- **Railway / Fly.io**: نفس مجلد `messenger-server`، أمر التشغيل `npm start`، ويحتاج **Volume** على `/var/data` مع `DB_PATH=/var/data/bird.sqlite`.
- **VPS عادي**: `npm ci --omit=dev` ثم `npm start` خلف Nginx + HTTPS (المكالمات تحتاج HTTPS).
- **Docker**: أي منصة تدعم Dockerfile يمكنها تشغيل `messenger-server`.

## 5) ملاحظات

- المكالمات الصوتية/المرئية تحتاج TURN للعمل بين شبكات مختلفة (انظر `messenger-server/README.md`).
- لا تُرفع ملفات `.env` أو `data/` أو `backups/` إلى المستودع (مستثناة في `.gitignore`).
