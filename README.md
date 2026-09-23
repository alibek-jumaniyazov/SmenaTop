# SmenaTop

O‘zbekistondagi soatbay va smenali ish uchun React + NestJS + PostgreSQL ilovasi. Ish beruvchi smena yaratadi, ishchi ariza beradi, ish beruvchi taklif qiladi va ishchi qabul qilgandan keyin bandlik ikkala kabinetda saqlanadi. Davomat, timesheet, ish haqi tasdig‘i va tashkilot obunasi alohida yuritiladi.

Bu lokal tekshiruvdan o‘tgan boshlang‘ich implementatsiya. Production uchun qolgan kod ishlari va tashqi ulanishlar [release checklist](docs/RELEASE_CHECKLIST.md)da alohida qayd etilgan. Haqiqiy SMS, bank o‘tkazmasi yoki sandbox/live to‘lov tekshirilgan deb ko‘rsatilmaydi.

## Talablar

- Node.js 22.12+ (ushbu mashinada 22.18.0), pnpm 10.34.5.
- PostgreSQL 17 va `btree_gist` extension yaratish huquqi, Redis 7.4+.
- Docker Compose v2 tavsiya etiladi; Docker bo‘lmasa PostgreSQL va Redisni lokal o‘rnating.
- Brauzer testlari uchun Chromium: Linuxda `npx pnpm exec playwright install --with-deps chromium`. Windowsda konfiguratsiya odatiy Chrome o‘rnatilishini ishlatadi; kerak bo‘lsa `playwright.config.ts`dagi executablePathni moslang.

Global pnpm 11 o‘rnatilgan bo‘lsa ham quyidagi `npx pnpm` buyruqlari loyihadagi pin qilingan pnpm 10 versiyasini ishlatadi.

## Lokal setup

Repository ildizidan:

```sh
npx --yes pnpm@10.34.5 install --frozen-lockfile
node scripts/setup-env.mjs
npx pnpm infra:up
docker compose -f infra/compose.yml exec postgres createdb -U smenatop smenatop_test
npx pnpm db:generate
npx pnpm db:migrate
npx pnpm db:seed
npx pnpm dev
```

Test database allaqachon mavjud bo‘lsa `createdb` qadamini qaytarmang. `.env` mavjud bo‘lsa setup uni saqlab qoladi; yangi faylga tasodifiy sirlar yaratadi. Sirlarni Gitga qo‘shmang. PostgreSQL manzilini almashtirsangiz `DATABASE_URL` va boshqa alohida bazaga yo‘naltirilgan `TEST_DATABASE_URL`ni birga sozlang.

Docker mavjud bo‘lmagan ushbu ish stansiyasida haqiqiy PostgreSQL alohida `.local/postgres` klasterida `127.0.0.1:55432`, Redis esa `127.0.0.1:56379`da ishga tushirildi. `.env` shu instansiyalarga moslangan; bu mashinada `infra:up` va `createdb`ni qayta bajarish shart emas. Boshqa mashinada Docker yo‘li taqdim etilgan, ammo aynan ushbu sessiyada Docker image build bajarilmagan.

| Xizmat                        | Manzil                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Web                           | [localhost:5173](http://localhost:5173)                                         |
| API                           | [localhost:3000/api/v1/health/ready](http://localhost:3000/api/v1/health/ready) |
| Swagger, faqat non-production | [localhost:3000/api/docs](http://localhost:3000/api/docs)                       |
| API JSON                      | [localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)       |

`dev` API, web va queue workerini birga ishga tushiradi. API TypeScriptni kompilyatsiya qilib ishga tushadi; backend kodi o‘zgarsa jarayonni qayta boshlang. Vite frontend va jobs watcher o‘zgarishlarni kuzatadi.

Windowsda `db:generate` yoki `build`dan oldin ishlab turgan API va jobs jarayonlarini to‘xtating: Prisma engine DLL fayli ochiq jarayon tomonidan qulflanadi. `EPERM ... query_engine-windows.dll.node` chiqsa shu jarayonlarni to‘xtatib buyruqni qaytaring; bazani reset qilish kerak emas.

## Lokal demo

Seed sintetik 3 tashkilot, 18 ishchi va 30 smena hamda turli to‘lov/davomat holatlarini yaratadi. Seed idempotent, mavjud ishlarni reset qilmaydi. Telefonlar local SMS adapterga bog‘langan; universal OTP yo‘q.

| Rol                      | Telefon                           | Kontekst                                              |
| ------------------------ | --------------------------------- | ----------------------------------------------------- |
| Ish beruvchi             | `+998900000001`                   | Tasdiqlangan tashkilot, ACTIVE obuna                  |
| Ish beruvchi             | `+998900000002`                   | TRIAL                                                 |
| Ish beruvchi             | `+998900000003`                   | EXPIRED                                               |
| Ishchilar                | `+998901000001` … `+998901000018` | Global ishchi profillari; oxirgisi tekshiruv kutmoqda |
| Platform admin/moderator | `+998900000099`                   | Lokal verifikatsiya va boshqaruv                      |
| Developer                | `+998900000098`                   | Texnik holat va himoyalangan local inbox              |
| Manager                  | `+998900000010`                   | Tashkilot operatsiyalari                              |
| Finance                  | `+998900000011`                   | Billing, maxfiy worker hujjatiga umumiy kirishsiz     |

1. `/auth`da telefonni kiriting va kod so‘rang.
2. Repository terminalida mos telefon uchun inboxni o‘qing:

   ```sh
   node --env-file=.env scripts/local-inbox.mjs +998900000001
   ```

3. Qaytgan bir martalik kodni kiritib kontekstni tanlang. Developer UI ham `.env`dagi server kaliti bilan inboxni ko‘rsatadi; kalit frontend bundle ichida yo‘q.
4. Employer kabinetida yangi kelajak smenasini yarating va taqvimdagi qoralamani e’lon qiling. Alohida brauzer profilida worker sifatida kirib smenaga ariza bering. Employer arizalar sahifasida taklif yuboradi, worker qabul qiladi. Ikkala kabinetda tasdiqlangan smena paydo bo‘ladi; sahifani yangilaganda saqlanadi.
5. Admin kabinetida pending verification/support/navbatlarni ko‘ring. Production privileged sessiya TOTP MFA talab qiladi; `/auth/mfa` setup, bir martalik recovery codes va challenge oqimini qo‘llaydi.
6. Billingda LOCAL_MOCK aniq belgilangan. Mockni faqat sintetik tashkilotda sinang. Worker ish haqi bu to‘lovdan mustaqil; “ish beruvchi to‘langan deb belgilagan” va “ishchi qabulini tasdiqlagan” boshqa-boshqa holatlar.

Lokal hujjatlar karantinga tushadi; real scanner bo‘lmasa avtomatik xavfsiz deb belgilanmaydi. Faqat non-production hujjat tekshiruvi route’i sabab va audit bilan mavjud. Productionda S3 va ClamAV kerak.

## Buyruqlar

| Buyruq                      | Vazifa                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `npx pnpm lint`             | ESLint                                                              |
| `npx pnpm typecheck`        | Barcha workspace typelari                                           |
| `npx pnpm test`             | API unit va frontend component testlari                             |
| `npx pnpm build`            | Prisma client, API, jobs, web production build                      |
| `npx pnpm test:integration` | Alohida PostgreSQL va haqiqiy Redis; API 3001ni vaqtincha boshlaydi |
| `npx pnpm test:e2e`         | Ishlab turgan lokal API/web va seed bilan Playwright                |
| `npx pnpm api:generate`     | Ishlab turgan API’dan OpenAPI + TypeScript client contract          |
| `npx pnpm api:check`        | Contract drift tekshiruvi                                           |
| `npx pnpm start`            | Root `.env` bilan kompilyatsiya qilingan API                        |
| `npx pnpm start:jobs`       | Root `.env` bilan kompilyatsiya qilingan worker                     |
| `npx pnpm infra:down`       | Containerlarni to‘xtatadi, volume o‘chirmaydi                       |

Integratsion testlar asosiy ilova bazasini ishlatishni rad etadi. Playwright lokal seedga sintetik yozuvlar qo‘shadi; uni productionga yo‘naltirmang. Uchinchi test haqiqiy UI orqali smena yaratadi va tugagach sintetik bookingni bekor qiladi. Mutatsiyali testlar alohida test bazasida bajariladi; Playwright uchun ham alohida sintetik muhit ishlating.

## Repository va hujjatlar

`apps/web` — React Router, TanStack Query, React Hook Form/Zod, Uz/Ru i18n, responsive UI. `apps/api` — NestJS domain API. `apps/jobs` — transactional outbox va BullMQ. `prisma` — schema, SQL integrity constraints, migrations va seed. `packages/api-client` — generated HTTP contract. `tests` — PostgreSQL/Redis integration va browser acceptance.

- [Arxitektura](docs/ARCHITECTURE.md), [dizayn tizimi](docs/DESIGN_SYSTEM.md), [ruxsatlar](docs/PERMISSIONS.md), [holatlar](docs/STATE_MACHINES.md)
- [To‘lovlar va provayder dalillari](docs/PAYMENTS.md), [xavfsizlik](docs/SECURITY.md)
- [Deploy va recovery](docs/DEPLOYMENT.md), [test natijalari](docs/TEST_REPORT.md), [release gates](docs/RELEASE_CHECKLIST.md)
- [Qarorlar](docs/DECISIONS.md), [bajarilgan ishlar](docs/PROGRESS.md)
- [2026-09-23 dizayn yangilanishi va mobil tekshiruvlar](docs/DESIGN_REFRESH_REPORT.md)
- [Profil, nomzodlar va kabinet qulayliklari; joriy lokal manzil va tekshiruvlar](docs/PROFILE_UX_REPORT.md)
