# خادم المراسلة الفورية

خادم مستقل للمراسلة الفورية مبني بـ Node.js وExpress وSocket.IO وSQLite (`better-sqlite3`). مجلد `messenger-server/` مستقل عن واجهة Next.js الموجودة في جذر المستودع، ومناسب للربط لاحقاً مع PWA.

## المتطلبات والتشغيل

يتطلب Node.js 18 أو أحدث. من هذا المجلد:

```bash
npm install
```

انسخ `.env.example` إلى `.env` (أو `.env.local` لا يُقرأ تلقائياً هنا؛ اسم الملف المطلوب `.env`) وعيّن سر JWT قوي بطول 32 محرفاً على الأقل، ثم:

```bash
npm start
```

يعمل الخادم افتراضياً على `http://localhost:3001`، ويستمع إلى `0.0.0.0` ليعمل خلف النشر السحابي. `GET /health` عام ولا يحتاج JWT، و`trust proxy` مفعّل ليعمل rate limiting وعناوين IP خلف Render/Netlify.

```env
PORT=3001
JWT_SECRET=ضع_هنا_سراً_عشوائياً_طويلاً_وخاصاً
CORS_ORIGIN=http://localhost:3000
DB_PATH=./data/app.db
```

`CORS_ORIGIN` يقبل أصلاً واحداً، أو عدة أصول مفصولة بفواصل، ويسري على Express وSocket.IO. `*` مسموح للتطوير فقط. استخدم HTTPS وسراً خاصاً في الإنتاج. قاعدة البيانات تُنشأ تلقائياً، ولا تضعها في مجلد عام.

## النشر على Render

`render.yaml` جاهز بجذر `messenger-server`، وأمر البناء `npm install`، والتشغيل `npm start`. أضف المتغيرات البيئية التالية من لوحة Render دون نسخ قيم سرية في الملف:

| المتغير | القيمة |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render يحدده تلقائياً) |
| `JWT_SECRET` | سر عشوائي 32 محرفاً على الأقل |
| `CORS_ORIGIN` | أصل الواجهة المنتشرة، مثل `https://messenger-client.netlify.app` |
| `DB_PATH` | `./data/app.db` |

> على Render، أضف قرصاً دائماً (Disk) على `./data` لأن نظام الملفات يعاد تهيئته عند كل نشر. بدون القرص، قاعدة البيانات تُعاد فارغة.

## النشر على Netlify (الواجهة)

`messenger-client/netlify.toml` ينشر مجلد `messenger-client` من دون بناء، ويوجّه `/api/*` و`/socket.io/*` إلى الخادم. غيّر `SERVER_URL` في `config.js` إلى عنوان الخادم، وأضف نفس الأصل إلى `CORS_ORIGIN` في الخادم. إن استخدمت نطاقاً مخصصاً للنشر، حدّث `CORS_ORIGIN` بهذا النطاق.

للنشر على Render للواجهة، استخدم `rootDir: messenger-client`، وأمر البناء `echo skip`، وأمر التشغيل `node server.js`.

## أمثلة سريعة

سجّل حساباً (كلمة المرور 8–72 محرفاً، واسم المستخدم 3–32 حرفاً/رقماً/شرطة سفلية):

```bash
curl -X POST http://localhost:3001/api/register -H "Content-Type: application/json" -d "{\"username\":\"sara\",\"password\":\"my-password-123\"}"
```

أو سجّل الدخول بـ `POST /api/login` مع نفس الحقول. الاستجابة تحتوي `user` و`token`. أرسل الرمز لكل API محمي:

```http
Authorization: Bearer <JWT>
```

## REST API

كل المسارات أدناه تحتاج JWT. كذلك `GET /health` محمي، وكذلك جميع مسارات API عدا `POST /api/register` و`POST /api/login`.

| الطريقة والمسار | المدخلات | النتيجة |
| --- | --- | --- |
| `GET /health` | — | حالة الخدمة |
| `POST /api/register` | `{ "username": "sara", "password": "my-password-123" }` | إنشاء مستخدم وإرجاع `user` وJWT |
| `POST /api/login` | `{ "username": "sara", "password": "my-password-123" }` | التحقق وإرجاع `user` وJWT |
| `GET /api/users/search?q=sar` | `q` بطول 1–32 | حتى 25 مستخدماً مطابقاً، باستثناء المستخدم الحالي |
| `POST /api/contacts` | `{ "contactId": 2 }` | إضافة جهة اتصال؛ العملية آمنة عند التكرار |
| `GET /api/contacts` | — | جهات اتصال المستخدم الحالي |
| `GET /api/messages/:userId?before=123` | `before` اختياري: معرّف رسالة موجب | آخر 50 رسالة للمحادثة تصاعدياً و`hasMore` و`nextBefore` |

الصفحة التالية للتاريخ: استخدم قيمة `nextBefore` كـ `before`. معرّف المؤشر هو معرّف الرسالة، والنتيجة تعيد الأقدم أولاً.

## Socket.IO

اتصل بعنوان الخادم مع JWT في `auth.token` (مفضّل) أو ترويسة `Authorization: Bearer <JWT>`:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001', { auth: { token } });
```

### أحداث العميل إلى الخادم

| الحدث | البيانات | ملاحظات |
| --- | --- | --- |
| `message:send` | `{ "to": 2, "text": "أهلاً" }` | يُحفظ أولاً ثم يُرسل للمستلم إذا كان متصلاً. النص 1–4000 محرف. يدعم acknowledgement يعيد `{ message }` أو `{ error }`. |
| `message:delivered` | `{ "messageId": 123 }` | يؤكد المستلم وصول الرسالة؛ يرسل المرسل تحديث `message:status`. يمكن استخدام acknowledgement. |
| `message:read` | `{ "messageId": 123 }` | يؤكد قراءة المستلم؛ يرسل المرسل تحديث الحالة إلى `read`. يمكن استخدام acknowledgement. |
| `typing:start` | `{ "to": 2 }` | إشعار للطرف الآخر فقط. |
| `typing:stop` | `{ "to": 2 }` | إيقاف إشعار الكتابة. |
| `call:start` | `{ "to": 2, "kind": "video", "callId": "c-1-123456" }` | بدء مكالمة. `kind` قيمته `audio` أو `video`، ويُنشئ العميل معرفاً فريداً للمكالمة. |
| `call:signal` | `{ "to": 2, "callId": "...", "signal": { "type": "offer", "data": {...} } }` | ترحيل offer/answer/ICE candidates عبر Socket.IO. |
| `call:answer` | `{ "to": 2, "callId": "...", "accepted": true }` | قبول أو رفض المكالمة الواردة. |
| `call:end` | `{ "to": 2, "callId": "..." }` | إنهاء المكالمة من أي من الطرفين. |

### أحداث الخادم إلى العميل

- `message:new` — رسالة واردة: `{ id, sender_id, receiver_id, text, status, created_at }`.
- `message:status` — تحديث حالة لمرسل الرسالة: `{ messageId, status }` (`delivered` أو `read`).
- `typing:start` و`typing:stop` — `{ userId, username }` للطرف الآخر.
- `presence` — `{ userId, username, status }`، و`lastSeen` يضاف عند الانتقال إلى offline. الاتصال الأول/الأخير للمستخدم هو ما يغيّر الحالة؛ اتصالات المستخدم المتعددة مدعومة.
- `call:incoming` — `{ callId, from, username, kind }` للمكالمة الواردة.
- `call:signal` — `{ callId, from, signal }` لترحيل بيانات WebRTC بين الطرفين فقط.
- `call:answered` — `{ callId, from, accepted }` عند قبول/رفض المكالمة.
- `call:ended` — `{ callId, from }` عند الإنهاء أو انقطاع أحد الطرفين.

المكالمات الصوتية والمرئية تستخدم WebRTC وSTUN العام (`stun.l.google.com`). لا يوجد خادم TURN في هذا المشروع؛ قد تحتاج الشبكات ذات القيود الشديدة إلى TURN مستقل لإنشاء الاتصال.

عند اتصال المستخدم تُسلّم الرسائل التي حالتها `sent` والمحفوظة أثناء عدم الاتصال، ثم تتغير إلى `delivered`. هذا لا يلغي جلب التاريخ عبر REST بعد إعادة الاتصال.

## تجربة عامة عبر نفق

يمكن تشغيل الخادم وواجهة العميل على جهازين في شبكتين مختلفتين مؤقتاً عبر Cloudflare Quick Tunnel من دون إعداد نطاق أو حساب.

> **قبل البدء:** النفق يجعل الخادم متاحاً للعامة. استخدم `JWT_SECRET` عشوائياً طويلاً (32 محرفاً على الأقل)، ولا تنشر قاعدة بيانات حقيقية أو أسراراً للتجربة. عنوان `trycloudflare.com` يتغير في كل تشغيل.

1. ثبّت `cloudflared` باتباع [تعليمات Cloudflare الرسمية](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/). تأكد أن `cloudflared --version` يعمل في الطرفية.
2. من مجلد `messenger-server` شغّل:

   ```bash
   npm run tunnel
   ```

   يبدأ الأمر الخادم، ينتظر نجاح `GET /health`، ثم يشغّل النفق ويطبع رابط HTTPS العام. ينهي `Ctrl+C` الخادم والنفق معاً.
3. في `messenger-client/config.js` غيّر قيمة `SERVER_URL` إلى الرابط العام المطبوع، مثل `https://example.trycloudflare.com` (من دون `/` في النهاية). السكربت يطبع السطر الجاهز، ولا يعدّل الملف تلقائياً.
4. في `messenger-server/.env` اجعل `CORS_ORIGIN` يطابق **أصل صفحة العميل** (المخطط والمضيف والمنفذ، وليس عنوان API)، مثل `CORS_ORIGIN=https://your-client.example`. إن كان العميل يعمل محلياً فاستخدم `CORS_ORIGIN=http://localhost:4173`. لا تضع رابط النفق هنا ما لم تكن صفحة العميل نفسها تُفتح من هذا الرابط. أعد تشغيل الخادم بعد التعديل.
5. لطباعة سطر CORS الجاهز لأصل عميل معيّن، شغّل:

   ```bash
   npm run tunnel -- --client-origin=https://your-client.example
   ```

   السكربت لا يعدّل `.env` ولا يطبع `JWT_SECRET` أو أي قيمة سرية. يمكن تمرير عدة أصول مفصولة بفواصل داخل قيمة `--client-origin` إذا لزم.

إن تغيّر رابط النفق، حدّث `SERVER_URL` في العميل من جديد. لا تستخدم النفق المؤقت بديلاً عن نشر HTTPS دائم.

## التشغيل التجريبي والاختبارات

شغّل الخادم في نافذة طرفية، ثم في نافذة ثانية:

```bash
npm run demo
```

يسجّل السكربت مستخدمين جديدين ويتبادلان رسالة عبر Socket.IO. قد يحتاج `better-sqlite3` على Windows إلى نسخة Node.js مدعومة أو Visual Studio Build Tools مع C++ إذا لم يتوفر binary جاهز. لتشغيل اختبار التكامل (قاعدة مؤقتة داخل الذاكرة):

```bash
npm test
```

## هيكل المشروع

```text
src/
  app.js                 Express middleware والتطبيق
  index.js               بدء الخادم والتحقق من الإعدادات
  controllers/auth.js    التسجيل وتسجيل الدخول
  db/index.js            مخطط SQLite والاتصال
  middleware/auth.js     التحقق من JWT
  routes/auth.js         التسجيل والدخول مع rate limiting
  routes/api.js          المستخدمون وجهات الاتصال وسجل الرسائل
  socket/index.js        المصادقة والأحداث الفورية والحضور
scripts/demo-client.js   عميل تبادل تجريبي
 test/server.test.js     اختبار تكامل
```
