# Bird 2.0 Gateway

واجهة Bird العربية مع بوابة Node.js. البوابة تقدم ملفات الواجهة وتمرر `/api` و`/socket.io` و`/files` إلى خادم Bird الحالي، لذلك لا يظهر عنوان خادم Railway في المتصفح.

## Railway deployment

Deploy this repository as a Node service. Set the following Railway variable:

```env
UPSTREAM_URL=https://soakalshorja-production.up.railway.app
```

The service starts with `npm start` and exposes `/health` through the upstream Bird server. Do not put `UPSTREAM_URL` in committed frontend files or in `.env`.

## Local run

```bash
cp .env.example .env
# set UPSTREAM_URL in .env
npm start
```
