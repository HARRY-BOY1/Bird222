# PROGRESS.md

## الهدف
إنشاء خادم مراسلة فورية مستقل باستخدام Express وSocket.IO وSQLite.

## خلص
- [x] تثبيت هيكل مستقل `messenger-server/` كي لا يتعارض مع Next.js.
- [x] تجهيز الخادم للنشر: PORT من البيئة، trust proxy، health عام، CORS متعدد الأصول، DB_PATH قابل للإعداد، JWT_SECRET يفشل عند قصير، engines node >=20، .gitignore، render.yaml.
- [x] واجهات التسجيل والدخول، JWT، bcrypt، rate limiting والتحقق من المدخلات.
- [x] SQLite بمخطط المستخدمين وجهات الاتصال والرسائل.
- [x] API البحث وجهات الاتصال وسجل محادثة بصفحات.
- [x] Socket.IO للمصادقة والرسائل والحالات والكتابة والحضور وإعادة تسليم الرسائل المعلقة.
- [x] README عربي، ملف بيئة نموذجي، عميل demo، واختبار تكامل.
- [x] تثبيت حزم npm وتوليد `package-lock.json`.
- [x] أمر `npm run tunnel` يشغّل الخادم وQuick Tunnel، ينتظر الصحة، ويطبع عنوان العميل وإرشادات CORS دون تعديل `.env` أو كشف الأسرار.
- [x] فحص بناء الجملة وملفات JSON بنجاح.
- [x] خُفّض better-sqlite3 إلى 12.4.1 لإتاحة binary متوافق مع Node 24 على Windows في هذه البيئة.
- [x] نجح اختبار التكامل، بما فيه حماية الصحة، جهات الاتصال، ومراسلة Socket.IO فورية.

## قرارات مهمة
- الخادم مشروع Node.js منفصل لأن المستودع الحالي تطبيق Next.js.
- `bcryptjs` بدل إضافة bcrypt الأصلية لتسهيل تشغيله على Windows.
- JWT يمر عبر `auth.token` أو Authorization Bearer.
- ملف SQLite محلي في `data/`، غير مرفوع للمستودع.

## أوامر التشغيل والاختبار
- `cd messenger-server && npm install`
- أنشئ `.env` من `.env.example` وغيّر JWT_SECRET إلى سر 32+ محرفاً.
- `npm start`
- `npm test`
- `npm run demo` (بعد بدء الخادم)

## مشاكل معروفة
- تحقق syntax وJSON نجح. تعذر اختبار التكامل في هذه البيئة لأن Node v24.15.0 على Windows لم يتوفر له binary prebuilt من better-sqlite3؛ والبناء من المصدر يتطلب Visual Studio C++ غير المثبت. كود التطبيق لا يحتاج Visual Studio عند توفر binary متوافق.
