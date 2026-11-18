# Bird Messenger Web Client

واجهة ويب عربية RTL ومتجاوبة لتطبيق Bird Messenger، مبنية على واجهة WhatsApp Web Clone المفتوحة المصدر، مع استبدال البيانات التجريبية بطبقة اتصال حقيقية مع خادم Bird الحالي.

## البنية

- **Frontend:** Next.js App Router، React، TypeScript، Tailwind CSS، وواجهة WhatsApp Web-inspired.
- **Authentication:** JWT من خادم Bird، محفوظ محلياً في المتصفح بعد تسجيل الدخول.
- **REST:** طلبات المستخدمين وجهات الاتصال وسجل الرسائل عبر `NEXT_PUBLIC_SERVER_URL`.
- **Realtime:** Socket.IO 4.x مع `auth.token` لأحداث الرسائل والحضور والكتابة وحالات التسليم.
- **Deployment:** تصدير static إلى `out/` والنشر على GitHub Pages.

الخادم لا يزال هو المصدر الأساسي للبيانات:
`https://soakalshorja-production.up.railway.app`

## التشغيل

```bash
npm install
NEXT_PUBLIC_SERVER_URL=https://soakalshorja-production.up.railway.app npm run dev
```

لإنتاج نسخة GitHub Pages:

```bash
NEXT_PUBLIC_BASE_PATH=/Bird222 \
NEXT_PUBLIC_SERVER_URL=https://soakalshorja-production.up.railway.app \
npm run build
```

يجب أن تكون قيمة `CORS_ORIGIN` في Railway متضمنة أصل الواجهة المنشورة. لا تضع `JWT_SECRET` أو أي سر آخر في هذا المستودع.

## الوظائف المرتبطة بالخادم

تسجيل الدخول والتسجيل، جهات الاتصال، البحث، تحميل سجل المحادثة، الإرسال والاستقبال الفوري، حالات الرسائل، الحضور، مؤشر الكتابة، والثيم المتجاوب تعمل عبر API وSocket.IO الحاليين. أزرار رفع الملفات والمكالمات والحالات تحتاج ربطاً إضافياً في الواجهة إذا أريد عرضها بالكامل؛ الخادم نفسه يوفر أجزاء الرفع وإشارات WebRTC لكنه لا يوفر سجل حالات أو تاريخ مكالمات.

## الاختبارات

```bash
npm run lint
npm run build
```

الواجهة مبنية على المستودع المرجعي:
`https://github.com/gunavardhanm6-hue/whatsapp-web-clone`

يجب الحفاظ على إشعار وترخيص المشروع المرجعي عند التوزيع وفق ترخيصه المعلن.
