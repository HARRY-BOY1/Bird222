# Bird · الكروب العام

تطبيق Bird مبسط جداً: غرفة عامة واحدة فقط. أي شخص يفتح الرابط يدخل تلقائياً كزائر باسم عشوائي، يرى آخر الرسائل، ويستطيع الكتابة للجميع بدون تسجيل حساب أو جهات اتصال.

الواجهة مبنية بـ Next.js وتُنشر كنسخة static على GitHub Pages. الرسائل محفوظة في خادم Bird على Railway وتصل فورياً عبر Socket.IO.

```bash
npm install
NEXT_PUBLIC_SERVER_URL=https://soakalshorja-production.up.railway.app npm run dev
NEXT_PUBLIC_BASE_PATH=/Bird222 NEXT_PUBLIC_SERVER_URL=https://soakalshorja-production.up.railway.app npm run build
```

الخادم العام يستخدم `GET /api/public/room` للرسائل الأخيرة، وSocket.IO عبر `publicGuest` للدخول، الرسائل، حالة الموجودين، ومؤشر الكتابة. لا توجد في الواجهة الحالية شاشة حسابات أو ملفات شخصية أو محادثات خاصة.
