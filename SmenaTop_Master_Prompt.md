# SmenaTop — noldan ishlaydigan mahsulotgacha master prompt

Ushbu hujjatdagi topshiriqni to‘liq bajar. Sen product architect, senior React engineer, senior NestJS engineer, PostgreSQL architect, product designer va QA engineer vazifalarini birgalikda bajarasan. Maqsading — reja yoki chiroyli maket bilan cheklanmay, tekshirilgan va kengaytirishga qulay ishlaydigan SmenaTop v1 loyihasini yaratish.

## 1. Ishlash tartibi va yakuniy natija

- Avval ishchi muhit, mavjud repository, o‘rnatilgan vositalar va loyiha ko‘rsatmalarini tekshir. Bo‘sh repository bo‘lsa, loyihani noldan yarat. Mavjud foydalanuvchi fayllarini ruxsatsiz yo‘qotma.
- Oqilona texnik qarorlarni mustaqil qabul qil va `docs/DECISIONS.md` ga yoz. Faqat haqiqiy bloklovchi noaniqlik yoki tashqi ruxsat kerak bo‘lganda savol ber.
- Dastlab qisqa implementatsiya rejasini tuz, so‘ng darhol kod yozishni boshlagin. Reja, kataloglar va landing page tayyor bo‘lishini vazifa tugashi deb hisoblama.
- Har bosqichda frontend → API → database orqali ishlaydigan jarayon yarat. Biznes ma’lumotlarini faqat localStorage yoki frontend massivlarida saqlama.
- Barcha asosiy tugmalar haqiqiy amal bajarsin. Muvaffaqiyat toastini ko‘rsatib, database’ga hech narsa yozmaydigan funksiyalar qoldirma.
- Tashqi xizmat kalitlari bo‘lmasa, o‘sha integratsiyaning aniq belgilangan lokal test adapterini tayyorla; qolgan ishni davom ettir. Mock ishlayotgan integratsiyani real deb e’lon qilma.
- Xatolik chiqsa, sababini topib tuzat va tegishli testni qayta bajar. Bajarilmagan testni muvaffaqiyatli deb yozma.
- Ish uzoq davom etsa, `docs/PROGRESS.md` da bajarilgan ishlar, oxirgi tekshiruv, keyingi aniq qadam va bloklovchi masalalarni saqla. Keyingi sessiyada shu yerdan davom et.
- Yakunda kod, migratsiyalar, seed, testlar, Docker muhiti, hujjatlar va ishga tushirish buyruqlari bo‘lsin. Public deploy yoki real pul operatsiyasini faqat tegishli ruxsat va credential mavjud bo‘lganda bajar; aks holda deploy uchun tayyor konfiguratsiya va aniq qolgan qadamlarni topshir.

## 2. Mahsulot mohiyati va biznes modeli

SmenaTop — O‘zbekistonda korxonalar uchun qisqa muddatli va smenali ishchilarni topish, ko‘nikmalarini tekshirish, smenaga kelishini tasdiqlash va bajarilgan ishni hisobga olish platformasi.

Asosiy auditoriyalar:

1. Ish beruvchilar: restoran, mehmonxona, catering, ombor, savdo va xizmat ko‘rsatish korxonalari.
2. Ishchilar: oshxona yordamchisi, ofitsiant, xona tozalovchi, ombor yordamchisi va boshqa konfiguratsiya qilinadigan kasblar.
3. Platforma operatorlari: verifikatsiya, murojaat, smena muammolari va billingni boshqaruvchi jamoa.

Asosiy ikki va’da: ish beruvchi uchun — “Smenangizga mos ishchi toping”; ishchi uchun — “Vaqtingizga mos smena toping”. Ishchi topilishi yoki daromad miqdorini kafolatlaydigan asossiz marketing yozma.

Daromad modeli — ish beruvchi tashkilotning oylik obunasi. Ishchi hisob ochishi va smenalarga ariza topshirishi bepul. V1 da ishchi mehnat haqini ish beruvchi bevosita to‘laydi; platforma bu kelishuv va tasdiqlarni qayd qiladi. Platformaning obuna to‘lovi va ishchining mehnat haqi alohida domenlar bo‘lsin.

Boshlang‘ich faol hududni admin sozlasin; seed’da Toshkent va Urganch misollari bo‘lsin. Kod shahar nomlariga bog‘lanmasin. Standart til — o‘zbek lotin; ruscha interfeys ham to‘liq ishlasin. Inglizcha lokalizatsiyani qo‘shishga tayyor tuzilma yarat. Vaqt zonasi — `Asia/Tashkent`, valyuta — `UZS`.

## 3. Majburiy texnologik stack

### Frontend

- React + TypeScript strict + Vite.
- React Router: public, worker, employer, administration va developer route guruhlari.
- TanStack Query: server state, mutations, invalidation va error handling.
- React Hook Form + Zod: form validation; backend validation mustaqil ishlasin.
- Tailwind CSS va CSS custom properties asosidagi o‘z dizayn tizimi.
- Radix UI kabi accessible primitive’lardan foydalanish mumkin; tayyor dashboard shabloni ko‘rinishini ko‘chirma.
- Motion for React yoki uning amaldagi barqaror ekvivalenti; animatsiya uchun bitta kutubxona tanla.
- i18next yoki mos i18n kutubxonasi, Lucide ikonkalari, zarur joyda yengil grafik kutubxonasi.
- Zustand faqat haqiqiy shared UI state uchun; API ma’lumotlarini ikkinchi store’da takrorlama.

### Backend va ma’lumotlar

- Node.js’ning tanlangan dependency’lar bilan mos amaldagi LTS versiyasi.
- NestJS + TypeScript, REST API, OpenAPI/Swagger.
- PostgreSQL — asosiy source of truth.
- Prisma ORM va versionlangan migratsiyalar. ORM ifodalay olmaydigan constraintlar uchun tekshirilgan SQL migratsiya yoz.
- Redis + BullMQ: SMS, reminder, billing reconciliation va fon vazifalari. Redis booking yoki to‘lovning yagona source of truth’i bo‘lmasin.
- S3-compatible private storage; lokalda MinIO yoki teng imkoniyatli adapter.
- Docker Compose, pnpm workspace, ESLint, Prettier.
- Frontend: Vitest + Testing Library; backend: Jest/Supertest yoki Nest bilan mos test stack; end-to-end: Playwright.

Amaldagi rasmiy dokumentatsiya asosida o‘zaro mos stable versiyalarni tanla, lockfile’da pin qil va README’da yoz. Eskirgan tutorial konfiguratsiyasini ko‘r-ko‘rona ko‘chirma. Next.js, Firebase yoki Supabase bilan majburiy stackni almashtirma.

## 4. Kengayishga mos arxitektura

Modulli monolit qur: tushunarli modul chegaralari, bitta backend codebase va alohida ishga tushiriladigan background worker. Keraksiz mikroservislar yaratma.

Tavsiya etilgan tuzilma:

```text
apps/
  web/
  api/
  jobs/
packages/
  ui/
  api-client/
  config/
  shared/
prisma/
  schema.prisma
  migrations/
  seed/
infra/
docs/
```

Nest modullari: Auth, Users, Organizations, Memberships, Branches, Workers, Verification, Shifts, Applications, Assignments, Attendance, Matching, Messaging, Notifications, Billing, Payments, Reviews, Disputes, Files, Support, Administration, DeveloperTools, Audit va Health.

Controller transportni, service use-case’ni, repository yoki query layer ma’lumotga kirishni boshqarsin. Frontend bundle’ga Prisma client, server entity, maxfiy konfiguratsiya yoki Node-only kod chiqmasin. Typed API client’ni OpenAPI’dan generatsiya qil va CI’da driftni tekshir.

Muhim domain eventlarni transaction ichida Outbox’ga yoz; commitdan keyin worker qayta urinish va deduplication bilan qayta ishlasin. Queue transporti takror yetkazishi mumkinligini hisobga ol. Keyinchalik mobil ilova, boshqa hududlar, agentliklar, korporativ API va real payroll qo‘shilishi uchun provider/domain chegaralarini aniq saqla. Kelajak funksiyalarini bugun ishlaydigan funksiya sifatida ko‘rsatma.

## 5. Dizayn yo‘nalishi: vaqt, smena va odamlar

SmenaTop uchun maxsus visual language yarat. Markaziy vizual g‘oya — kun bo‘ylab joylashgan smena bloklari, bir-biriga mos tushadigan vaqt oralig‘i va ishchi mavjudligini ko‘rsatuvchi “vaqt tasmasi”. Uni public sahifada hikoya, ishchi kabinetida kun rejasi, ish beruvchi kabinetida amaliy smena taqvimi sifatida ishlat.

Talab — mustaqil kompozitsiya va izchil brend. Dizaynning dunyoning hech qayerida yo‘qligini isbotlangan fakt sifatida aytma. Tayyor template, mashhur mahsulotning aynan nusxasi yoki boshqa brend assetlarini ishlatma.

Boshlang‘ich rang tokenlari:

- Asosiy ink: `#172B2A`.
- Iliq fon: `#F4F1E9`.
- Card surface: `#FFFFFF`.
- Asosiy action: `#255CE5`.
- Iliq aksent: `#E9AB5B`.
- Border: `#DCDDD4`.
- Success, warning va error uchun alohida accessible semantic ranglar tanla.

Ranglarni kontrast tekshiruvidan so‘ng moslashtirish mumkin. Rangning o‘zi statusni ifodalovchi yagona signal bo‘lmasin.

- Licensed, kerakli o‘zbek belgilarini qo‘llaydigan self-hosted shrift; masalan, Manrope va interfeys uchun Inter. Eng ko‘pi ikki font family.
- 8px spacing ritmi, puxta type scale, katta sarlavha va ixcham amaliy matn; har card’ni bir xil ulkan radius va soya bilan bezama.
- Maxsus SVG logomark yarat: `S` va smena almashish g‘oyasining sodda geometrik birikmasi. SVG source topshir.
- Landing’da keng, assimetrik kompozitsiya; kabinetlarda ma’lumot zichligi nazorat qilingan aniq layout.
- Public hero: chapda kuchli sarlavha va ikki CTA, o‘ngda haqiqiy ish jarayonini tushuntiruvchi interaktiv vaqt tasmasi.
- Hero demo bo‘lsa “Interaktiv namuna” deb belgilansin. Soxta faol mijozlar, yulduzli sharhlar, brend logolari va uydirma real-time statistikalar bo‘lmasin.
- Ishchi mobil interfeysi bosh barmoq bilan ishlatishga qulay: pastki navigation, vaziyatga mos sticky CTA, katta vaqt va ish haqi.
- Ish beruvchi desktop interfeysi: sidebar, kun/hafta jadvali, navbatdagi amallar va tanlangan smena tafsilotlari paneli.
- Admin interfeysi: tez filter, queue, xavf belgisi, audit va chuqur tafsilot; landing bezaklarini ko‘chirma.
- Ishchi kartasida faqat ishga tegishli tekshirilgan ko‘nikma, mavjudlik, smena tajribasi va izohli reyting ko‘rinsin.
- Dark mode’ni ham tokenlar orqali sifatli amalga oshir; accessibility va semantika ikkala temada saqlansin.

Saytning jozibadorligi tezlik, ishonch va foydali interaction orqali yaratiladi. Scroll hijacking, cheksiz bezovta animatsiya, yashirilgan chiqish/bekor qilish va majburiy popup ishlatma.

## 6. Animatsiya, accessibility va performance

- Tugma va element feedback: 120–180 ms; drawer, filter va sahifa transition: odatda 180–300 ms.
- Smena card’dan detail panel’ga shared-layout transition, filter almashganda tartibli layout animation, skeleton’dan content’ga yumshoq o‘tish.
- Tasdiqlangan ariza uchun qisqa va sokin status animatsiyasi. Muhim amalda server muvaffaqiyatini kut; oldindan yolg‘on success ko‘rsatma.
- Hero animatsiyasi bir marta tushuntirish vazifasini bajarsin; takrorlanadigan harakat bo‘lsa pause control bo‘lsin.
- `prefers-reduced-motion` to‘liq ishlasin; klaviatura navigation, focus trap va qayta tiklash, skip link, screen-reader nomlari bo‘lsin.
- WCAG 2.2 AA darajasini maqsad qil: kontrast, xato matni, label, status announcement, 44px atrofidagi touch targetlar.
- Scroll va asosiy navigation og‘ir JS animatsiyaga bog‘lanmasin. Canvas yoki video bo‘lmasa ham sayt sifatli ko‘rinsin.
- 360, 390, 768, 1024 va 1440px ekranlarda tekshir. Gorizontal overflow bo‘lmasin; jadval uchun kerakli maxsus scroll ruxsat.
- Route-level code splitting, lazy admin/chart modules, optimallashtirilgan assetlar, pagination va zarur ro‘yxatda virtualization.
- LCP ≤2.5s, CLS ≤0.1 va INP ≤200ms — o‘lchanadigan performance maqsadlari. Lab va real foydalanuvchi ko‘rsatkichlarini farqla; RUM ma’lumoti bo‘lmasa INP natijasini uydirma. Test qurilmasi/tarmog‘ini hisobotda yoz.

## 7. Sahifalar va navigation

| Zona | Majburiy sahifalar |
|---|---|
| Public | Bosh sahifa, qanday ishlaydi, ishchilar uchun, biznes uchun, smenalarni ko‘rish, smena tafsiloti, tariflar, FAQ, aloqa/yordam, maxfiylik va foydalanish shartlari |
| Auth | Telefon bilan kirish, OTP tasdiqlash, onboarding, rol kontekstini tanlash, taklifni qabul qilish, session expired |
| Worker | Bugungi reja, smena qidirish, saqlangan smenalar, arizalar, tasdiqlangan smenalar, davomat, ish haqi holati, xabarlar, bildirishnomalar, profil, ko‘nikma/verifikatsiya, mavjud vaqtlar, sozlamalar |
| Employer | Dashboard, smena yaratish va tahrirlash, kun/hafta taqvimi, arizalar, tasdiqlangan ishchilar, davomat va timesheet, qayta taklif qilish, filiallar, jamoa/rollar, obuna, invoice/to‘lov tarixi, xabarlar, analitika, sozlamalar |
| Platform | Ishchilar/korxonalar verifikatsiyasi, smenalar, murojaatlar, nizolar, foydalanuvchi cheklovlari, billing/refund, tarif konfiguratsiyasi, kataloglar, audit, tizim holati |
| Developer | Faqat ruxsatli muhitda health, redacted loglar, job holati, API docs, provider testlari, feature flaglar va sintetik demo scenario runner |

Authenticated sahifalar to‘g‘ridan-to‘g‘ri URL va browser refresh orqali ishlasin. Rolga mos bo‘lmagan route aniq 403 yoki ruxsatli sahifaga yo‘naltirish bersin. 404, 403, 500, loading, empty, retry va offline holatlar chizilgan hamda ishlaydigan bo‘lsin.

Public smena detail’da ish turi, sana/vaqt, ish haqi asosi, tanaffus, taxminiy hudud, talablar va ish beruvchining verifikatsiya holati bo‘lsin. Xususiy telefonlar va hujjatlar public API’dan chiqmasin.

## 8. Auth, onboarding va sessiyalar

- Telefon E.164 formatda saqlansin; default country code `+998`. OTP bir marta ishlatiladigan, muddati cheklangan, hash ko‘rinishida saqlanadigan bo‘lsin.
- SMS yuborish va OTP tekshirishda telefon/IP/session bo‘yicha rate limit, resend cooldown va attempt limit qo‘y. Oddiy response orqali mavjud foydalanuvchini aniqlashga yo‘l qo‘yma.
- Lokal SMS adapter OTP’ni faqat himoyalangan local dev inbox’da ko‘rsatsin. Production API response yoki log OTP’ni qaytarmasin; universal “111111” bypass bo‘lmasin.
- Browser uchun revocable opaque session ID va Redis/PostgreSQL session store bilan HttpOnly, Secure, SameSite cookie arxitekturasini tanla. Session fixation’dan himoya uchun login va privilege o‘zgarishida sessionni aylantir. State-changing requestlar CSRF himoyali bo‘lsin.
- LocalStorage’da session credential saqlama. WebSocket ulanishlari ham server session va permission tekshiruvidan o‘tsin.
- Admin va privileged platform hisoblarida MFA bo‘lsin; production’da talab qilinsin. Recovery jarayonini hujjatlashtir.
- Ishchi onboarding: ism, shahar, telefon, kasblar, tajriba, tillar, mavjud vaqtlar, zarur ko‘nikmalar va shartlarga rozilik. V1 mahsulot siyosati sifatida 18+ talabini aniq ko‘rsat.
- Ish beruvchi onboarding: tashkilot nomi, aloqa shaxsi, STIR maydoni, shahar, filial va tekshiruvga yuborish. Davlat reyestri integratsiyasi bo‘lmasa “davlat tasdiqlagan” deb ko‘rsatma.
- Verifikatsiya statuslari: UNVERIFIED, PENDING, VERIFIED, REJECTED, SUSPENDED. Telefon tasdiqlanishi shaxs/ko‘nikma to‘liq tekshirilganini anglatmasin.
- Ishchi profil draft’ini saqlay olsin; korxona smena draft’ini tuza olsin. Public publish, assignment confirmation va shaxsiy kontaktlarga kirish serverdagi verification siyosati bilan boshqarilsin.

## 9. Rollar va tenant isolation

Bir foydalanuvchi ishchi bo‘lishi va bir nechta tashkilotga turli rollarda a’zo bo‘lishi mumkin. Global identity bilan organization membership’ni ajrat. UI’dagi rol/context switch hech qanday yangi huquq bermasin.

| Rol | Asosiy ruxsat | Muhim chegara |
|---|---|---|
| Guest | Public katalog va smenalar | Shaxsiy worker ma’lumotlarini ko‘rmaydi |
| Worker | O‘z profil, ariza, assignment va davomatini boshqaradi | Boshqa ishchi va korxona ichki ma’lumotlariga kirmaydi |
| Organization Owner | O‘z tashkiloti, jamoa, filial, smena va billing | Platforma admini emas; oxirgi owner o‘zini o‘chirib ketolmaydi |
| Organization Admin | Berilgan tashkilotdagi operatsion boshqaruv | Ownership transfer va maxsus moliyaviy vakolat default yopiq |
| Dispatcher/Manager | Biriktirilgan filiallar smenasi va nomzodlar | Boshqa filial yoki obuna boshqaruvi avtomatik berilmaydi |
| Organization Finance | Invoice, obuna, ruxsatli ish haqi hisoboti | Worker hujjati va rol berish huquqi yo‘q |
| Platform Support | Ticket, zarur cheklangan profil va operatsion yordam | Default moliyaviy mutatsiya va maxfiy hujjatga kirish yo‘q |
| Platform Moderator | Verifikatsiya, moderatsiya va nizolar | Billing/refund vakolati avtomatik yo‘q |
| Platform Finance | To‘lov reconciliation va ruxsatli refund | Arbitrary rol yoki verification bera olmaydi |
| Platform Admin | Alohida berilgan platforma permissionlari | Har privileged amal audit qilinadi |
| Super Admin | Favqulodda konfiguratsiya va platforma permission boshqaruvi | MFA, qayta autentifikatsiya va audit majburiy |
| Developer | Texnik diagnostika va ruxsatli sandbox vositalari | Production’da billing, rol yoki biznes ma’lumotini o‘zgartirish bypass’i yo‘q |

Backend’da permission + organization/branch scope + resource ownership siyosatini qo‘lla. Frontend’da tugmani yashirish himoya hisoblanmaydi. Client yuborgan `organizationId` yoki `role`ga ishonma; authenticated membership orqali tekshir. Default deny.

Permissionlar kodli katalogga ega bo‘lsin: masalan, `shift.publish`, `application.review`, `attendance.approve`, `billing.manage`, `member.invite`, `verification.review`. Custom organization role faqat o‘sha tashkilot doirasidagi ruxsatlarni olsin; o‘zidan yuqori permission bera olmasin. Platforma rollari oddiy signup yoki org invite orqali berilmasin.

List, detail, export, file download, WebSocket room va background joblarda ham scope tekshirilsin. Kamida ikki tashkilot bilan cross-tenant test yoz.

## 10. Smena, ariza va assignment — biznes qoidalari

Smena maydonlari: organization, branch, job category, tavsif, vazifalar, start/end, timezone, unpaid/paid break, kerakli ishchilar soni, hourly/fixed pay turi, summa, talab etilgan ko‘nikma, manzil, kiyim/jihoz talabi, ovqat/transport mavjudligi, apply deadline va cancellation policy versiyasi.

Smena statuslari:

```text
DRAFT → PUBLISHED → IN_PROGRESS → COMPLETED → CLOSED
DRAFT → CANCELLED
PUBLISHED → CANCELLED
```

`FILLED`, `PARTIALLY_FILLED`, `OPEN` holatini tasdiqlangan assignmentlar sonidan hisoblangan staffing status sifatida saqla yoki ishonchli derive qil; lifecycle bilan aralashtirma. Boshlangan smenani oddiy cancel qilish o‘rniga alohida audited early-close jarayoni bo‘lsin.

Ariza statuslari: SUBMITTED, SHORTLISTED, OFFERED, ACCEPTED, REJECTED, WITHDRAWN, EXPIRED. Offer alohida PENDING, ACCEPTED, REVOKED, EXPIRED holatlariga ega bo‘lsin. Ish beruvchi offer beradi, ishchi belgilangan muddatda rozilik bildiradi; shunda assignment yaratiladi. V1 da offer joyni band qilmaydi va bu UI’da ochiq yoziladi. Qabul qilish vaqtida joy qolmasa to‘g‘ri conflict qaytadi. Ish beruvchi hali qabul qilinmagan offerni revoke qila olsin; application holati izchil qayta hisoblanadi.

Assignment statuslari: CONFIRMED, CHECKED_IN, CHECKED_OUT, COMPLETED, CANCELLED_BY_WORKER, CANCELLED_BY_EMPLOYER, NO_SHOW. Davomat, timesheet approval va nizo statuslarini alohida saqla; bitta enum’ga hammasini aralashtirma.

Majburiy invariantlar:

- `end_at > start_at`, headcount > 0, break davomiyligi smenadan kichik, ish haqi manfiy emas.
- Yarim tundan o‘tadigan smenalar ishlasin. DB’da `timestamptz`, interval `[start, end)` va ko‘rinishda `Asia/Tashkent` ishlat.
- Bitta worker bir smenaga bitta faol ariza yubora oladi. Bir worker uchun bitta smenada ko‘pi bilan bitta faol assignment bo‘ladi; smenadagi faol assignmentlar soni headcountdan oshmaydi.
- Bir worker turli tashkilotlarda ham vaqt jihatidan ustma-ust ikki assignment’ni tasdiqlay olmasin.
- Oxirgi joyga parallel kelgan ikki acceptance’dan faqat bittasi muvaffaqiyatli bo‘lsin.
- Assignment accept, cancel, quota va headcount o‘zgarishlari atomik transaction orqali bajarilsin.
- Acceptance transaction ichida offer faol va muddati tugamaganligi, application withdrawn emasligi, smena hali qabul uchun ochiqligi, worker/organization suspended emasligi, verification va kerakli ko‘nikmalar qayta tekshirilsin. Offer expiry smena boshlanishidan kech bo‘lmasin; V1 da acceptance smena boshlanishigacha ruxsat etiladi. Shoshilinch boshlangan smenaga ishchi olish keyingi alohida workflow sifatida qolsin.
- Smena row lock + ishchi bo‘yicha barqaror lock tartibi yoki teng kuchli yechim ishlat. Worker vaqt to‘qnashuvini PostgreSQL `tstzrange` va GiST exclusion constraint bilan himoyalashni afzal ko‘r; zarur `btree_gist` extensionni migratsiyada yarat. Muqobil bo‘lsa, DB darajasidagi concurrency dalilini ADR va test bilan ko‘rsat.
- ORM’da unsupported constraint ishlatilsa SQL migratsiya source of truth bo‘lsin; keyingi migratsiya uni tasodifan olib tashlamasin.
- Application, assignment, active booking interval va capacity holati bitta transactionda uyg‘un yangilansin. Deadlock/serialization conflict uchun bounded retry bo‘lsin.
- Confirmed workerlar bo‘lsa vaqt, manzil yoki haqni yashirin o‘zgartirma. V1 da muhim maydonlarni lock qil va cancel/recreate oqimini ishlat; yangi shart uchun eski consentni qayta ishlatma.
- Headcountni tasdiqlangan workerlar sonidan pastga tushirish taqiqlansin. Takroriy click bir nechta assignment yaratmasin.
- Obuna tugashi mavjud assignment, davomat, nizo va ish haqi ma’lumotiga kirishni yo‘qotmasin; yangi publish va pullik entitlementlargagina ta’sir qilsin.
- Smena erta yopilsa yoki ishchi check-in’dan keyin bekor qilinsa, allaqachon bajarilgan ish vaqti yo‘qolmasin. Yakuniy timesheet, tegishli ish haqi hisobi va nizo huquqi saqlansin; keyingi smena booking intervali ham to‘g‘ri yangilansin.

## 11. Moslashtirish va qidirish

V1’da tushunarli, deterministik matching qur; oddiy filter’ni yolg‘on “AI tekshiruvi” deb atama.

Hard filterlar: shahar/hudud, ish vaqti to‘qnashmasligi, talab qilingan ko‘nikma verifikatsiyasi, account holati va smena qoidalariga moslik.

Ranking signallari: mavjudlik, ishga tegishli ko‘nikma mosligi, rozilik berilgan taxminiy masofa, yakunlangan smenalar va dalilli davomat tarixi. Formula versiyalansin, natijaga qisqa izoh qo‘shilsin. Yangi ishchilar tarix yo‘qligi uchun avtomatik nolga tushib qolmasin.

Jins, etnik kelib chiqish, din yoki boshqa himoyalangan xususiyat bilan ranking qilma. Tug‘ilgan sana faqat tegishli eligibility maqsadida ishlatilsin. Aniq ko‘nikmani odam tekshirgan bo‘lsa kim/qachon tekshirganini saqla.

Qidiruv filterlari URL’da saqlansin; sorting, pagination, clear filters va empty-result tavsiyasi ishlasin. Boshlanishida PostgreSQL full-text/trigram yetarli; zarurat isbotlanmasdan Elasticsearch qo‘shma.

## 12. Davomat, timesheet, bekor qilish va nizo

- Check-in/check-out: assignmentga bog‘langan, qisqa muddatli bir martalik QR/token yoki menejer tasdig‘i. Statik QR replay ishlamasin; server vaqti source of truth.
- GPS majburiy kuzatuv bo‘lmasin. Faqat foydalanuvchi roziligi bilan yordamchi signal sifatida ishlat; location yo‘q bo‘lsa ruxsatli manual tasdiq yo‘li bo‘lsin.
- Timesheet’da start/end, tanaffus, hisoblash bazasi, taklif qilingan tuzatish, worker va manager tasdiqlari saqlansin.
- Hourly/fixed pay hisoblash, rounding, tanaffus va mumkin bo‘lgan qo‘shimcha vaqt qoidalari hujjatlashtirilsin. Qo‘shimcha haq oldindan kelishuv yoki audited approval talab qilsin.
- No-show belgilash configurable grace period va dalilga ega bo‘lsin. Ishchi e’tiroz bildira olsin; algoritm orqali darhol permanent ban qilma.
- Cancel sababini, vaqtini, kim bajarganini va o‘sha paytdagi policy snapshot’ini saqla. V1 da yashirin avtomatik jarima yechma.
- Bo‘shagan joy uchun waitlist yoki qayta moslashtirishni ishga tushir. Replacement yangi assignment va yangi worker consent orqali bo‘lsin.
- Nizo ticket’i: kategoriya, izoh, kerakli dalillar, status, mas’ul moderator, resolution va audit. Faqat ishtirokchilar va vakolatli operatorlar ko‘rsin.
- Review faqat haqiqiy yakunlangan assignmentdan keyin; har tomon bittadan. Moderatsiya, report va qayta ko‘rib chiqish bo‘lsin. Demo sharhlar demo sifatida belgilansin.

## 13. Obuna, tarif va entitlementlar

Quyidagilar boshlang‘ich mahsulot takliflari; bozor tasdiqlagan narx sifatida e’lon qilma. Admin ularni versionlangan konfiguratsiya orqali o‘zgartira olsin.

| Tarif | Oylik narx | Filial | Employer jamoa a’zosi | Billing davrida publish |
|---|---:|---:|---:|---:|
| Start | 499 000 UZS | 1 | 3 | 20 smena |
| Pro | 999 000 UZS | 3 | 10 | 100 smena |
| Business | 1 999 000 UZS | 10 | 30 | 500 smena |

- Ixtiyoriy 7 kunlik, kartasiz trial: 1 filial, 2 a’zo, 5 publish. Verification va suiste’moldan himoya bo‘lsin.
- Kvota publish vaqtida atomik sarflansin. O‘chirish/bekor qilish orqali kvotani cheksiz qayta ishlatish mumkin bo‘lmasin. Retry aynan shu publish uchun ikki marta sarflamasin.
- Employer membership limiti ishchilarga tatbiq etilmasin.
- Tarif featurelari backend entitlement orqali ishlasin. UI’dagi disabled tugma yagona cheklov bo‘lmasin.
- Subscription statuslari: TRIALING, ACTIVE, PAST_DUE, EXPIRED, CANCELLED. `cancel_at_period_end` alohida atribut bo‘lsin; cancel qilinganda to‘langan davr oxirigacha access saqlansin.
- Billing oyi 30 kunlik taxmin bilan emas, aniq anchor va kalendar davr bilan hisoblanadi; oy oxirida 28/29/30/31-sanalar qoidalarini test qil.
- V1’da plan upgrade/downgrade keyingi billing davridan ishlasin; murakkab proratsiyani uydirma. Qaysi kundan va qancha to‘lov bo‘lishini UI’da ko‘rsat.
- Trial paytida birinchi muvaffaqiyatli to‘lov paid davrni darhol boshlaydi va qolgan trial kunlari unga qo‘shilmaydi; checkout oldida bu siyosat ochiq yozilsin.
- Downgrade’da yangi limitdan ortiq filial/a’zolarni avtomatik o‘chirib yuborma: oldindan ogohlantir, egaga qaysilari faol qolishini tanlat, mavjud confirmed ishlarni yakunlashga yo‘l ber. Davr tugashi va faol/to‘langan statuslar transitionini hujjatlashtir.
- Egasi downgrade’dan oldin limitga tushirmagan bo‘lsa mavjud yozuvlarni saqla, ortiqcha limit holatini ko‘rsat va limitga tushguncha yangi filial/a’zo yaratishni blokla; foydalanuvchi hisoblari va bajarilayotgan ishlarni avtomatik yo‘qotma.
- Invoice price/plan/tax configuration snapshot saqlasin. Narx keyin o‘zgarganda eski invoice yoki to‘langan davr o‘zgarmasin.
- Soliq va fiskal chek talablari amaldagi shartnoma va mutaxassis tasdig‘i bilan konfiguratsiya qilinadi; ichki invoice’ni rasmiy fiskal chek deb ko‘rsatma.

## 14. To‘lovlar: Payme, Click va bank o‘tkazmasi

`PaymentProvider` adapter interfeysini yarat: checkout yaratish, callback/RPC autentifikatsiyasi, status tekshirish, cancellation/refund imkoniyatlari va reconciliation. Capabilitylar provider bo‘yicha aniq bo‘lsin; qo‘llanmaydigan imkoniyatni UI’da mavjud deb ko‘rsatma.

### Providerlar

1. Payme: amaldagi rasmiy Merchant API/checkout oqimi bo‘yicha obuna invoice’ini to‘lash. Tegishli `CheckPerformTransaction`, `CreateTransaction`, `PerformTransaction`, `CancelTransaction`, `CheckTransaction`, `GetStatement` metodlari va xatolik semantikasini tekshir.
2. Click: amaldagi rasmiy Shop API’dagi prepare/complete oqimi, authentication/signature va error qoidalariga mos implementatsiya.
3. Bank o‘tkazmasi: invoice, payment reference, dalil yuklash va Platform Finance tekshiruvi. Dalil yuklangani avtomatik “to‘langan” holatini bermasin. Finance bank hisobidagi haqiqiy tushumni mustaqil tekshirib, bank reference va dalil bilan audited manual confirmation qiladi; bu ham umumiy idempotent fulfillment transactionidan o‘tadi.
4. Local MockProvider: faqat non-production’da success, failure, pending, cancel, duplicate va late callback scenario’lari.

Endpoint, hash formula, amount birligi, timeout, refund yoki recurring imkoniyatini taxmin qilib yozma. Rasmiy dokumentatsiyani tekshir; manba va tekshirilgan sanani `docs/PAYMENTS.md` da yoz. Dokumentatsiya yoki credential mavjud bo‘lmasa o‘sha adapter verification holatini BLOCKED/UNVERIFIED deb ochiq qayd et.

UZCARD/HUMO’ni alohida to‘liq payment gateway deb implementatsiya qilma; qo‘llab-quvvatlash tanlangan provider va merchant shartnomasi orqali aniqlanadi. Visa/Mastercard, bo‘lib to‘lash va boshqa usullarni real qo‘llab-quvvatlashsiz yoqma.

### Pul va xavfsizlik invariantlari

- Money domenida `amountMinor` integer/BigInt va `currency` saqla; decimal float bilan hisoblama. UZS uchun ichki minor birlik tiyin bo‘lsin. Providerga mos so‘m/tiyin konversiyasini aynan uning hujjatiga ko‘ra test qil.
- JSON’da BigInt miqdorlarni decimal string bilan serializatsiya qil. Lokal ko‘rinishda so‘mni to‘g‘ri formatla.
- Client yuborgan summa, tarif yoki muvaffaqiyat query-parametriga ishonma; server invoice narxini belgilaydi.
- Online provider to‘lovi faqat tekshirilgan server-to-server xabar yoki ishonchli reconciliation bilan yakunlansin; bank o‘tkazmasi yuqoridagi audited bank-verification oqimidan o‘tadi. Checkoutdan redirect bo‘lgani to‘lov tasdig‘i emas.
- Providerning authentication qoidalarini aniq bajar; hammasiga bir xil HMAC mexanizmini majburlama. Xom body kerak bo‘lsa uni framework parsingi buzmasin.
- Provider account, environment, invoice, amount, currency va transaction identifier mosligini tekshir.
- Takroriy va tartibsiz callback/RPC’lar uchun durable idempotency bo‘lsin. Transport request ID’ni biznes idempotency key bilan adashtirma. Bitta transaction turli bosqich xabarlariga ega bo‘lishi mumkin.
- `provider + environment + providerTransactionId` unique bo‘lsin; billing entitlement berilishi alohida unique fulfillment event bilan himoyalansin.
- Bir invoice uchun ikki providerda parallel to‘lov bo‘lsa, obuna faqat bir marta berilsin; ikkinchi real to‘lov reconciliation/refund navbatiga tushsin va yashirilmasin.
- Raw provider transaction statusini saqla va internal state’ga hujjatlashtirilgan mapping qil. SUCCESS holatini kech kelgan oddiy FAILED xabar bilan orqaga qaytarma; refund/cancellation alohida valid transition.
- Subscription renewal: bir to‘lov davrni aynan bir marta uzaytirsin. Oldin to‘langan obuna uchun `max(currentPeriodEnd, paidAt)`, trialning birinchi to‘lovi uchun `paidAt` boshlanishini va kalendar qoidalarini izchil qo‘lla. Trial va expired renewal uchun ham test yoz.
- Renewal uchun `subscription_id + renewal_sequence` unique biznes kaliti bo‘lsin. Shu kalit bitta keyingi davr entitlementini bildiradi; foydalanuvchi yangi checkout bosganda mavjud to‘lanmagan invoicega payment attempt qo‘shilsin. Narx o‘zgargani uchun invoice almashtirilsa ham renewal kaliti saqlansin va eski attemptning kech kelgan to‘lovi reconciliationga tushsin.
- Invoice plan version, renewal kaliti va rejalashtirilgan davrni snapshot qilsin; haqiqiy davr boshi/oxiri birinchi fulfillment vaqtida faqat bir marta belgilanadi. ACTIVE renewal yangi davrni hozirgi to‘langan davr oxiridan, EXPIRED yoki TRIALING renewal esa birinchi muvaffaqiyatli to‘lov vaqtidan boshlaydi. Bir davr uchun ikkita invoice, refund replay yoki reconciliation shu entitlementni ikkinchi marta uzaytirmasin.
- Effective expiry har request/fulfillment vaqtida davr sanasi bilan tekshirilsin; cron statusni hali yangilamagani qo‘shimcha access bermasin. Oldindan to‘langan yangi tarif o‘z davri boshlanmaguncha joriy tarifni almashtirmasin.
- Payment, invoice fulfillment, subscription va Outbox yangilanishi transaction orqali izchil bo‘lsin.
- Pending to‘lovlar uchun status reconciliation job’i, retry/backoff, dead-letter ko‘rinishi va finance dashboard bo‘lsin.
- Refund/cancellation uchun sabab, permission, provider javobi, audit va entitlement siyosati mavjud bo‘lsin. Refundlar yig‘indisi to‘langan summadan oshmasin. V1’da to‘liq refundni amalga oshir; provider qo‘llamaydigan partial refund tugmasini ko‘rsatma.
- Provider “Subscribe API” nomini avtomatik har oy pul yechish kafolati deb talqin qilma. Default — har oy invoice va foydalanuvchi tasdiqlagan to‘lov. Avtomatik yechish faqat providerning tegishli imkoniyati, merchant ruxsati va alohida foydalanuvchi consent’i tekshirilganda yoqilsin.
- Karta PAN/CVV yoki OTP’ni o‘z database’imizga yozma; imkon qadar hosted checkout va provider tokenlari ishlatilsin. Provider credentiallar faqat server environment/secret manager’da bo‘lsin.

Production’da merchant credential bo‘lmasa provider `NOT_CONFIGURED` holatini qaytarsin va to‘lash tugmasi sabab bilan yopiq bo‘lsin. MockProvider production’da ishga tushmasin. Real provider sandboxidagi tekshiruv bilan lokal mock testini yakuniy hisobotda alohida ko‘rsat.

## 15. Ishchining mehnat haqi hisobi

Bu modul obuna billingidan ajratilsin. V1 da platforma ichki bank hamyoni, escrow yoki avtomatik karta payout’i bajarmaydi.

Timesheet asosidagi summa uchun holatlar: CALCULATED, APPROVED, EMPLOYER_MARKED_PAID, WORKER_CONFIRMED, DISPUTED. Ish beruvchining “to‘ladim” belgisi va ishchining “oldim” tasdig‘i farqlansin. Bank tekshiruvi bo‘lmagan ma’lumotni “bank tasdiqladi” deb ko‘rsatma.

Worker ekranida “Hisoblangan”, “Ish beruvchi to‘langan deb belgilagan”, “Qabul qilganingiz tasdiqlangan” summalarni alohida chiqar. Obuna tushumiga qo‘shma. Tasdiqlangan moliyaviy yozuvlar mutatsiyasini audit qil va historical snapshot saqla.

Keyingi real payroll uchun provider interface va ADR bo‘lsin; ishga tushirish huquqiy model, shartnoma, provider imkoniyati va alohida loyihalashni talab qilishi aniq yozilsin. V1’da soxta “Pulni yechish” tugmasi bo‘lmasin.

## 16. Developer rejimi va integratsiya vositalari

Developer rejimi maxfiy backdoor emas. Uchta aniq muhit: local, staging, production. Har biri alohida database, storage, credential va provider environment bilan ishlasin.

- Local/staging’da sintetik demo tenant, scenario runner, test inbox, provider simulator, queue ko‘rinishi va feature flag boshqaruvi.
- Destructive demo reset va role-switch faqat maxsus sintetik tenantga, non-production guard va explicit confirmation bilan ishlasin. Arbitrary organization ID yuborib haqiqiy tenantni reset qilib bo‘lmasin.
- DeveloperTools modulining destructive/test controllerlari production build/boot’da umuman ro‘yxatdan o‘tmasin. Faqat frontend linkni yashirish yetarli emas.
- Production’da dev feature yoki mock provider yoqilgan konfiguratsiya aniqlansa startup fail-fast qilsin. Frontend environment o‘zgaruvchilari, jumladan `VITE_*`, public bundle ekanini hisobga ol: ularga secret joylama.
- Developer rolidagi account o‘ziga admin huquqi bera olmasin, real invoice’ni PAID qila olmasin va raw SQL console orqali bazani o‘zgartira olmasin.
- Production texnik diagnostika zarur bo‘lsa read-only, alohida permission va audit bilan. Loglar PII, token, cookie, OTP, provider secret va payment payloadning maxfiy qismlarini niqoblasin.
- Feature flag authorization o‘rnini bosmasin; o‘zgarishlar versiya, scope va auditga ega bo‘lsin.
- Muhitning rangli banneri dev/staging’da doim ko‘rinsin. Test data public ishlab turgan biznes sifatida ko‘rsatilmasin.
- API integratsiyalari uchun organization-scoped API key modeli qo‘sh: bir marta ko‘rsatish, hash bilan saqlash, scope, expiry, revoke/rotate, rate limit va audit. V1 public integration API read-only `shifts:read`/`assignments:read` bilan chegaralansin; keyin yozish permissionlari alohida qo‘shiladi.
- Boshqa organization’ning key’i, revoked key va scope yetishmasligi uchun testlar bo‘lsin.
- Kelajak outgoing webhooklar uchun Outbox/event shartnomasi hujjatlashtirilsin; tayyor bo‘lmagan delivery xizmatini settings’da ishlaydigan qilib ko‘rsatma.

## 17. Database modeli va ma’lumot yaxlitligi

Quyidagi entitylarni vazifasiga mos normalizatsiya bilan yarat; naming izchil bo‘lsin:

- User, Session, OtpChallenge, ConsentRecord, PlatformRoleGrant.
- WorkerProfile, WorkerSkill, Skill, Availability, VerificationRequest, PrivateDocument.
- Organization, OrganizationMembership, OrganizationRole, Permission, Branch, TeamInvitation.
- JobCategory, Shift, ShiftApplication, ShiftOffer, Assignment, ActiveBooking, AttendanceEvent, Timesheet.
- WageRecord, Review, Dispute, SupportTicket.
- Conversation, ConversationParticipant, Message, Notification, NotificationPreference.
- Plan, PlanVersion, Entitlement, Subscription, UsageCounter, Invoice, PaymentAttempt, ProviderTransaction, PaymentEvent, Refund.
- ApiCredential, FeatureFlag, AuditLog, OutboxEvent, FileAsset va kerakli catalog entitylar.

UUID identifikatorlar, foreign key, zarur unique/check constraintlar va query’ga mos indexlar bo‘lsin. Har bir jadvalga keraksiz soft-delete qo‘shma: PII o‘chirish, tarixiy operatsiya va immutable finance yozuvlari uchun alohida retention siyosati tuz.

Tenantga tegishli entitylar `organization_id`ga ega bo‘lsin; kerak joyda composite foreign key bilan turli tenant obyektlarini bog‘lashni DB’da ham taqiqlagin. Global worker profili bilan organization membership ma’lumotini aralashtirma.

Money/time uchun qat’iy typelar, important mutationlarda version/optimistic concurrency, status tarixi va audit bo‘lsin. PII’ni auditga keraksiz nusxalama.

Indexlarni shift city/status/start, application shift/status, assignment worker/time, tenant dashboard, unread messages, payment provider identifiers va invoice period bo‘yicha query plan’ga qarab tanla. N+1 query bo‘lmasin. Migratsiyalar fresh database va oldingi schema’dan upgrade’da tekshirilsin.

## 18. API shartnomasi, xabarlar va notificationlar

- `/api/v1` versionlangan endpointlar, DTO validation, pagination, sorting allowlist va response serialization.
- Bir xil error formati: `code`, `message`, `fieldErrors`, `requestId`; 401/403/404/409/422/429 va kutilmagan xatolar izchil xaritalansin.
- Muhim mutationlarda request idempotency: actor + operation + key + payload hash. Bir key boshqa payload bilan kelsa conflict qaytar.
- Booking va billing kabi server kafolati zarur amallarda soxta optimistic success qilma. Favorite kabi qaytariladigan UI actionlarda rollback’li optimistic update mumkin.
- OpenAPI real endpointlar, DTO, auth va errorlarni aks ettirsin. Swagger production’da public ochiq turmasin.
- Assignment/ariza doirasida text messaging ishlasin; faqat ruxsatli participantlar ko‘rsin. Message limit, sanitization, report va unread count bo‘lsin.
- In-app notificationlar haqiqiy DB eventlardan yaralsin. SMS reminder adapteri mavjud bo‘lsin; credential bo‘lmasa local test inbox’dan foydalan.
- Reminderlar o‘zgargan/bekor qilingan smena uchun yuborilmasin. Job bajarilayotganda domain holatini qayta tekshir; xabarlar deduplicate qilinsin.
- WebSocket yoki SSE’da room/channel authorization va reconnect recovery bo‘lsin. Uzilganda ko‘r-ko‘rona event yo‘qotmasdan qayta fetch/poll fallback ishlasin.
- Telegram/email keyingi adapter sifatida ajratilishi mumkin; faqat implementatsiya qilingan kanal UI’da yoqilsin.

## 19. Xavfsizlik, maxfiylik va operatsion ishonch

- Request body limits, security headers, CORS allowlist, CSRF, rate limiting, output sanitization va backend validation.
- File upload MIME, hajm va tur tekshiruvi; private bucket, qisqa muddatli signed URL, ownership tekshiruvi va scan/quarantine holati. Ko‘rib chiqilmagan hujjat public ochilmasin.
- Verifikatsiya hujjatini tekshiruvchi operatorning kirishini audit qil; ma’lumotni default barcha adminlarga ochma. Hujjat ma’lumotlarini notification yoki analytics’ga chiqarma.
- Cookie, access token, OTP, payment secret, pasport nusxasi va raw bank ma’lumotlarini logga yozma.
- Invitelar bir martalik, muddati cheklangan va aniq tashkilot/role bilan bog‘langan bo‘lsin. Suspended/revoked a’zo eski session orqali kirishda huquqini saqlab qolmasin.
- Privileged role change, owner transfer, refund, manual verification va policy change uchun sabab va audit bo‘lsin.
- Rozilik va terms versiyasini saqla. Account deletion/export request oqimi bo‘lsin; retention sababli darhol o‘chirilmaydigan yozuvlar aniq ajratilsin.
- Mehnat munosabatlari, shaxsiy ma’lumotlarni saqlash, fiskal talablar va production legal matnlarini mutaxassis tekshiradigan release gate sifatida qayd et. Uydirma qonun talabi yoki tasdiqlanmagan “to‘liq qonuniy” da’vo yozma.
- Maxfiylik va foydalanish shartlari sahifalariga tushunarli draft yoz; real operator rekvizitlari yo‘q bo‘lsa joyini belgilab, production checklist’da bloklovchi sifatida ko‘rsat.

## 20. Analitika va haqiqiy ko‘rsatkichlar

Employer dashboard: ochiq/tasdiqlangan smenalar, to‘ldirilgan joylar, yaqinlashayotgan smenalar, ko‘rib chiqiladigan arizalar, davomat va tasdiqlash talab qiladigan timesheetlar.

Platform analitika: publish → application → offer → acceptance → attendance → completion funnel; fill rate, time-to-fill, no-show rate, subscription conversion va MRR.

Har bir metrikada formula, davr va denominator aniq bo‘lsin. MRR’ga ishchilar ish haqi, unpaid invoice yoki mock paymentni qo‘shma. Daromad bo‘lmasa real nol ko‘rsat; bo‘sh dashboard’ni uydirma raqam bilan to‘ldirma.

Demo statistikalar faqat demo tenant ichida, “Namuna ma’lumotlari” belgisi bilan bo‘lsin. Analytics eventlarga PII va hujjat kontentini yuborma.

## 21. DevOps, local run va production tayyorgarligi

- `.env.example` izohli, secretsiz va barcha talab qilinadigan env nomlari bilan bo‘lsin. Startup’da env validation ishlasin.
- PostgreSQL, Redis va local file storage uchun Docker Compose healthcheck va persistent volume qo‘sh. API, web va jobs uchun reproducible start yo‘li bo‘lsin.
- README’dagi buyruqlar haqiqatda ishlasin: install, infra up, migrate, seed, dev, lint, typecheck, unit/integration/e2e, build, prod start.
- Production Dockerfile multi-stage va non-root bo‘lsin. Health/readiness/liveness endpointlari farqlansin, graceful shutdown ishlasin.
- Migration deploy alohida release job bo‘lsin; har replica startup’da migration race qilmasin. Database migrationda expand/contract va rollback strategiyasini hujjatlashtir.
- Production’da default parol, sample admin, seed reset va mock payment yo‘q. Initial adminni bir martalik himoyalangan bootstrap orqali yarat.
- HTTPS reverse proxy konfiguratsiyasi, backup/PITR tavsiyasi, restore runbook, queue retry/dead-letter, monitoring va alert qoidalari bo‘lsin.
- Loglarda correlation/request ID; payment webhook failure, queue backlog, OTP abuse, database error va booking conflict ko‘rsatkichlari.
- CI: install → lint → typecheck → unit → haqiqiy PostgreSQL/Redis integration → build → asosiy Playwright oqimlari. Production deploy uchun zarur secrets konfiguratsiyasi hujjatlashtirilsin.
- Deployment target belgilanmagan bo‘lsa Docker orqali portable deploy tayyorla. Xarajatli cloud resurs yoki domenni o‘zboshimchalik bilan yaratma.

## 22. Test va qabul mezonlari

Faol xavflarni tekshiradigan testlar yoz; faqat component mavjudligini tekshirish bilan cheklanma. Minimal majburiy acceptance testlar:

1. Employer ro‘yxatdan o‘tadi, organization/branch yaratadi, verification’dan keyin smena publish qiladi.
2. Worker ro‘yxatdan o‘tadi, profil/ko‘nikma verification’dan o‘tadi, mavjud vaqtini belgilaydi va ariza beradi.
3. Employer offer beradi, worker qabul qiladi, assignment va jadval to‘g‘ri yangilanadi.
4. Ikki parallel acceptance oxirgi joyni overbook qilmaydi.
5. Bitta worker ikki tashkilotning ustma-ust smenasiga parallel request bilan ham tasdiqlanmaydi; tutash `[start,end)` intervallar to‘g‘ri ishlaydi.
6. Duplicate ariza va takroriy mutation bir nechta yozuv yaratmaydi.
7. Boshqa organization ID’si bilan detail, update, export, WebSocket va file download taqiqlanadi.
8. Manager billingga, finance worker private documentiga, developer role admin grantiga ruxsatsiz kira olmaydi.
9. Worker cancel qilganda joy bo‘shaydi, replacement consent bilan yaratiladi va eski reminder yuborilmaydi.
10. QR replay va noto‘g‘ri assignment tokeni rad etiladi; ruxsatli check-in/out timesheetga yoziladi.
11. Yarim tundan o‘tadigan smena, break va hourly/fixed pay hisoblash to‘g‘ri ishlaydi.
12. Trial/quota parallel publish bilan chetlab o‘tilmaydi; expired subscription mavjud ishni yakunlashni bloklamaydi.
13. Paymentda valid success, invalid auth/signature, wrong amount, duplicate, out-of-order, late callback, provider timeout va refund tekshiriladi.
14. Redirect bilan soxta success yaratilmaydi; bir invoice ikki marta to‘lansa bitta entitlement beriladi va reconciliation case yaratiladi.
15. Oy oxiri, kabisa yili, trialdan chiqish va takroriy renewal kalendar davrini noto‘g‘ri uzaytirmaydi.
16. Ish beruvchi marked-paid yozuvi worker confirmed-paymentdan UI/API’da farqlanadi.
17. OTP brute force/resend cheklanadi; revoked session va membership eskirgan huquq bilan ishlamaydi.
18. Production konfiguratsiyada demo reset, OTP bypass, mock payment va destructive dev route’lar mavjud emas.
19. API key tenant/scope/expiry/revoke qoidalari ishlaydi.
20. Keyboard-only asosiy flow, reduced motion, o‘zbek/rus lokalizatsiya va ko‘rsatilgan ekran o‘lchamlari tekshiriladi.

Concurrency, money va migration testlarini SQLite yoki faqat mock repository bilan cheklama; haqiqiy PostgreSQL’da bajar. Har bir bajarilgan test komandasi va natijasini qayd et.

## 23. Seed va vizual QA

Lokal/staging uchun sintetik data yarat: kamida 3 organization, bir nechta filial, 15–20 worker, 25–30 smena, turli ariza/assignment/timesheet statuslari, trial/active/expired obuna, pending/paid/failed payment va nizo misollari.

Demo telefonlar real SMS yubormaydigan adapterga bog‘langan bo‘lsin. Real odam hujjati yoki soxta real mijoz guvohligini ishlatma. Lokal demo hisoblar yaratish yo‘lini README’da ko‘rsat; productionga ko‘chirma.

Browser’da public landing, worker qidiruv/detail, worker assignment, employer calendar/detail, billing, admin queue va developer sahifalarini ochib ko‘r. 390px va 1440px screenshotlar ol, text clipping, noto‘g‘ri spacing, focus, modal, empty/error holatlar va kontrastni tuzat. Brauzer vositasi bo‘lmasa tekshirilmagan qismlarni aniq yoz.

## 24. Bajarish bosqichlari

Bosqichlar umumiy topshiriqning ketma-ket qismlari; bir bosqich tugagach ishni butunlay yakunlama.

1. **Foundation:** repository, dependencies, environment, Docker, schema/migrations, auth/session, tenant/RBAC va design tokens.
2. **Birinchi to‘liq oqim:** employer shift yaratadi → worker ariza beradi → offer → acceptance → DB’da assignment → ikkala kabinetda natija. Shu payt concurrency testlari ishlasin.
3. **Operatsiyalar:** verification, matching, calendar, attendance, timesheet, cancellation/replacement, reviews/disputes, xabar va notification.
4. **Monetizatsiya:** plan/entitlement, invoice, subscription, mock + tekshirish mumkin bo‘lgan real provider adapterlari, callback/idempotency/reconciliation va billing UI.
5. **Boshqaruv:** team/custom roles, platform queues, audit, API key, developer sandbox, support va analitika.
6. **Sifat:** mobile/desktop polish, animatsiya, i18n, accessibility, performance, security va testdagi topilgan muammolarni tuzatish.
7. **Topshirish:** production build, fresh-install smoke test, migratsiya, runbook, deploy konfiguratsiyasi va yakuniy tekshiruv hisobotlari.

Har bosqichning Definition of Done’i: working frontend + real API + persisted data + authorization + error states + tegishli test. UI button/API stub bo‘lishi bajarilgan hisoblanmaydi.

## 25. Majburiy hujjatlar va yakuniy hisobot

Yaratiladigan hujjatlar:

- `README.md` — aniq setup, runtime talablari, barcha buyruqlar va demo workflow.
- `docs/ARCHITECTURE.md` — modul chegaralari, ER diagram, muhim transactionlar va eventlar.
- `docs/DESIGN_SYSTEM.md` — rang/type/spacing tokenlari, komponent va motion qoidalari.
- `docs/PERMISSIONS.md` — har rol/permission/scope matriksasi.
- `docs/STATE_MACHINES.md` — shift, application, assignment, billing va wage transitionlari.
- `docs/PAYMENTS.md` — provider hujjatlari, units, authentication, sandbox setup, reconciliation va live activation.
- `docs/SECURITY.md` — tahdidlar, tenant isolation, sessions, private files va dev safeguards.
- `docs/DEPLOYMENT.md` — Docker deploy, secrets, migrate, backup/restore va rollback.
- `docs/TEST_REPORT.md` — bajarilgan komandalar, natijalar, screenshotlar va bajarilmagan tekshiruvlar.
- `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/RELEASE_CHECKLIST.md`.

Yakuniy javobda:

1. Nima ishlashi va qanday ishga tushirishni aniq yoz.
2. Local demo’da worker/employer/admin oqimlarini tekshirish usulini ber.
3. Bajarilgan test, build va browser tekshiruv natijalarini ayt.
4. Har integratsiya uchun `LOCAL_MOCK`, `SANDBOX_VERIFIED`, `LIVE_VERIFIED`, `NOT_CONFIGURED` yoki `BLOCKED` statusini dalili bilan jadvalda ber.
5. Tashqi credential, merchant onboarding, SMS, domen yoki legal review kabi qolgan release gate’larni sanab ber.
6. Koddagi tugallanmagan funksiyalarni tashqi credential yetishmasligi bilan aralashtirma; ikkala holatni alohida yoz.
7. Haqiqatan tekshirilmagan loyihani “100% production-ready” deb atama.

## 26. Rasmiy texnik manbalar

Implementatsiya vaqtida quyidagi birlamchi manbalarni qayta tekshir; API, package va merchant shartlari o‘zgarishi mumkin:

- [React: Build a React app from Scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Vite: Getting Started](https://vite.dev/guide/)
- [NestJS: Authorization](https://docs.nestjs.com/security/authorization)
- [NestJS: Raw body](https://docs.nestjs.com/faq/raw-body)
- [PostgreSQL: Range Types](https://www.postgresql.org/docs/current/rangetypes.html)
- [Payme Business: Merchant API](https://developer.help.paycom.uz/metody-merchant-api/)
- [Payme Business: Subscribe API protokoli](https://developer.help.paycom.uz/protokol-subscribe-api/)
- [Click rasmiy developer hujjatlari](https://docs.click.uz/)

Click hujjatlarini o‘qish imkoni bo‘lmasa imzo formulasi yoki real integration muvaffaqiyatini taxmin qilma; tekshirish blokini hujjatlashtirib, qolgan modullarni davom ettir.

**Endi muhitni tekshir, qisqa bajarish rejasini tuz va SmenaTop loyihasini implementatsiya qilishni boshlagin.**
