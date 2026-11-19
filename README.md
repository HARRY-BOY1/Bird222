# Bird 2.1 Gateway

واجهة Bird العربية بتصميم مراسلة حديث، مع بوابة Node.js تخفي عنوان الخادم الخلفي عن المتصفح وتمرير REST وSocket.IO عبر نفس النطاق.

## Railway

اربط هذا المستودع بخدمة Node على Railway واضبط متغير البيئة التالي:

```env
UPSTREAM_URL=https://soakalshorja-production.up.railway.app
```

تبدأ الخدمة عبر `npm start` وتستخدم `/health` للفحص. لا تضع عنوان الخادم أو أي توكن في ملفات الواجهة.

## محليًا

```bash
cp .env.example .env
# عدّل UPSTREAM_URL داخل .env
npm start
```

تستخدم الواجهة نقاط Bird الحالية للمصادقة، جهات الاتصال، الرسائل، المرفقات، الحساب، وSocket.IO. بقي خادم Bird وقاعدة بياناته في مستودعه المنفصل.
