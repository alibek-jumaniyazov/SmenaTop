import { useTranslation } from 'react-i18next';

const copy = {
  title: ['Mening ishchi profilim', 'Мой профиль работника'],
  intro: [
    'Kasbingiz, ko‘nikmalaringiz va tajribangiz bir joyda.',
    'Профессии, навыки и опыт — в одном месте.',
  ],
  resume: ['Profil ko‘rinishi', 'Просмотр профиля'],
  edit: ['Profilni tahrirlash', 'Редактировать профиль'],
  create: ['Profil yaratish', 'Создать профиль'],
  savedView: ['Saqlangan ma’lumotlar', 'Сохранённые данные'],
  newProfile: ['O‘zingiz haqingizda aytib bering', 'Расскажите о себе'],
  newIntro: [
    'Ismingiz, shahringiz va kasbingizdan boshlang. Qolgan bo‘limlar ish tajribangizni tushuntirishga yordam beradi.',
    'Начните с имени, города и профессии. Остальные разделы помогут рассказать о вашем опыте.',
  ],
  unnamed: ['Ism hali kiritilmagan', 'Имя пока не указано'],
  missing: ['Hali kiritilmagan', 'Пока не указано'],
  identity: ['Asosiy ma’lumotlar', 'Основная информация'],
  identityHint: [
    'Ish beruvchi sizga qanday murojaat qilishi va qaysi shaharda ishlashingiz.',
    'Как к вам обращаться и в каком городе вы работаете.',
  ],
  name: ['Ism va familiya', 'Имя и фамилия'],
  city: ['Ishlaydigan shahar', 'Город работы'],
  phone: ['Telefon raqam', 'Номер телефона'],
  phoneVerified: ['Telefon OTP orqali tasdiqlangan', 'Телефон подтверждён по OTP'],
  roles: ['Kasblar', 'Профессии'],
  rolesHint: [
    'Qaysi ishlarni bajara olasiz? 10 tagacha kasb tanlang.',
    'Какую работу вы выполняете? Выберите до 10 профессий.',
  ],
  skills: ['Ko‘nikmalar', 'Навыки'],
  skillsHint: [
    '20 tagacha ko‘nikma tanlang. Har birining tekshiruv holati alohida yuritiladi.',
    'Выберите до 20 навыков. Проверка каждого навыка проводится отдельно.',
  ],
  qualifications: ['Kasb va ko‘nikmalar', 'Профессии и навыки'],
  experienceSection: ['Tajriba va tillar', 'Опыт и языки'],
  experience: ['Ish tajribasi', 'Опыт работы'],
  experienceHint: [
    'Bajargan vazifalaringiz, ishlatgan jihozlaringiz yoki o‘rgangan ishlaringiz haqida yozing. Boshlovchi bo‘lsangiz, shuni aytishingiz mumkin.',
    'Расскажите о задачах, оборудовании и освоенной работе. Если вы только начинаете, можете указать это.',
  ],
  experiencePlaceholder: [
    'Masalan: kafeda mehmonlarga xizmat ko‘rsatganman, kassa bilan ishlay olaman…',
    'Например: обслуживал гостей в кафе, умею работать с кассой…',
  ],
  languages: ['Biladigan tillar', 'Языки'],
  languagesHint: [
    'Ish jarayonida muloqot qila oladigan tillarni tanlang.',
    'Выберите языки, на которых можете общаться на работе.',
  ],
  optional: ['Ixtiyoriy', 'Необязательно'],
  consent: ['Rozilik va tekshiruv', 'Согласие и проверка'],
  consentHint: [
    'Saqlash uchun 18 yoshga to‘lganingizni va amaldagi shartlarga roziligingizni tasdiqlang.',
    'Для сохранения подтвердите совершеннолетие и согласие с действующими условиями.',
  ],
  adult: ['18 yoshga to‘lganman', 'Мне исполнилось 18 лет'],
  terms: [
    'Foydalanish shartlari va maxfiylik siyosatiga roziman',
    'Я принимаю условия использования и политику конфиденциальности',
  ],
  termsLink: ['Foydalanish shartlari', 'Условия использования'],
  privacyLink: ['Maxfiylik siyosati', 'Политика конфиденциальности'],
  save: ['Qoralamani saqlash', 'Сохранить черновик'],
  saveChanges: ['O‘zgarishlarni saqlash', 'Сохранить изменения'],
  submit: ['Saqlash va tekshiruvga yuborish', 'Сохранить и отправить на проверку'],
  submitShort: ['Tekshiruvga tayyorlash', 'Подготовить к проверке'],
  saveHint: [
    'Oddiy saqlash tekshiruvga so‘rov yubormaydi. Ism, shahar, kamida bitta kasb va roziliklar saqlash uchun zarur.',
    'Обычное сохранение не отправляет заявку на проверку. Для сохранения нужны имя, город, хотя бы одна профессия и согласия.',
  ],
  cancel: ['O‘zgarishlarni bekor qilish', 'Отменить изменения'],
  back: ['Profilga qaytish', 'К профилю'],
  dirty: ['Saqlanmagan o‘zgarishlar bor', 'Есть несохранённые изменения'],
  draftHint: [
    'Tahriringiz shu sahifada saqlanib turibdi. Uni serverga saqlash uchun saqlash tugmasini bosing.',
    'Изменения остаются на этой странице. Нажмите кнопку сохранения, чтобы отправить их на сервер.',
  ],
  continueEdit: ['Tahrirlashni davom ettirish', 'Продолжить редактирование'],
  saved: ['Profil ma’lumotlari saqlandi.', 'Данные профиля сохранены.'],
  submitted: [
    'Profil saqlandi va tekshiruvga yuborildi.',
    'Профиль сохранён и отправлен на проверку.',
  ],
  saving: ['Saqlanmoqda…', 'Сохранение…'],
  readiness: ['Profil to‘liqligi', 'Заполненность профиля'],
  completed: ['bo‘lim to‘ldirilgan', 'разделов заполнено'],
  readinessHint: [
    'Hisob saqlangan ma’lumotlarga asoslanadi. Tajriba, tillar va ko‘nikmalar ixtiyoriy; to‘liqlik tekshiruv holatini o‘zgartirmaydi.',
    'Расчёт основан на сохранённых данных. Опыт, языки и навыки необязательны; заполненность не меняет статус проверки.',
  ],
  verification: ['Profil tekshiruvi', 'Проверка профиля'],
  unverified: [
    'Smenalarga ariza berishdan oldin profilingiz tekshiruvdan o‘tishi kerak.',
    'Для откликов на смены профиль должен пройти проверку.',
  ],
  pending: [
    'Profilingiz tekshiruv navbatida. Ma’lumotlarni saqlashingiz mumkin; qayta so‘rov yuborish shart emas.',
    'Профиль ожидает проверки. Данные можно сохранить; повторная заявка не нужна.',
  ],
  verified: [
    'Profil tekshiruvi tasdiqlangan. Ko‘nikmalarning holati alohida ko‘rsatiladi.',
    'Проверка профиля пройдена. Статус навыков указан отдельно.',
  ],
  rejected: [
    'Ma’lumotlaringizni tekshiring va kerakli tuzatishlardan keyin qayta yuboring.',
    'Проверьте данные и отправьте профиль повторно после необходимых исправлений.',
  ],
  suspended: [
    'Profilga cheklov qo‘yilgan. Tafsilotlar uchun yordam xizmatiga murojaat qiling.',
    'Профиль ограничен. Обратитесь в поддержку за подробностями.',
  ],
  availability: ['Qachon ishlay olasiz?', 'Когда вы можете работать?'],
  availabilityHint: [
    'Bo‘sh vaqtlaringizni alohida taqvimda belgilang.',
    'Укажите свободное время в отдельном календаре.',
  ],
  availabilityLink: ['Mavjud vaqtlarni belgilash', 'Указать свободное время'],
  searchLink: ['Smenalarni ko‘rish', 'Смотреть смены'],
  help: ['Yordam xizmatiga murojaat', 'Обратиться в поддержку'],
  sectionNav: ['Profil bo‘limlari', 'Разделы профиля'],
  requiredName: [
    'Ism va familiya 2–100 ta belgidan iborat bo‘lsin.',
    'Укажите имя и фамилию длиной от 2 до 100 символов.',
  ],
  requiredCity: ['Shaharni tanlang.', 'Выберите город.'],
  requiredRole: ['1 tadan 10 tagacha kasb tanlang.', 'Выберите от 1 до 10 профессий.'],
  skillLimit: ['20 tagacha ko‘nikma tanlang.', 'Выберите не более 20 навыков.'],
  languageLimit: ['10 tagacha til tanlang.', 'Выберите не более 10 языков.'],
  experienceLimit: [
    'Tajriba tavsifi 2000 belgidan oshmasin.',
    'Описание опыта не должно превышать 2000 символов.',
  ],
  requiredAdult: [
    'Platformadan foydalanish uchun 18 yoshga to‘lgan bo‘lishingiz kerak.',
    'Для использования платформы вам должно исполниться 18 лет.',
  ],
  requiredTerms: [
    'Saqlash uchun shartlarga rozilikni tasdiqlang.',
    'Для сохранения подтвердите согласие с условиями.',
  ],
  choose: ['Tanlang', 'Выберите'],
  archivedCity: [
    'Oldingi shahar — faol shaharni tanlang',
    'Прежний город — выберите доступный город',
  ],
  archivedRole: ['Arxivlangan kasb', 'Архивная профессия'],
  invalidServer: ['Bu maydonni tekshiring.', 'Проверьте это поле.'],
} as const;

export function useWorkerProfileCopy() {
  const { i18n } = useTranslation();
  const index = i18n.language === 'ru' ? 1 : 0;
  return Object.fromEntries(
    Object.entries(copy).map(([key, value]) => [key, value[index]]),
  ) as Record<keyof typeof copy, string>;
}

export const workerLanguageChoices = [
  { id: 'uz', nameUz: 'O‘zbek tili', nameRu: 'Узбекский' },
  { id: 'ru', nameUz: 'Rus tili', nameRu: 'Русский' },
  { id: 'en', nameUz: 'Ingliz tili', nameRu: 'Английский' },
  { id: 'kk', nameUz: 'Qozoq tili', nameRu: 'Казахский' },
  { id: 'tg', nameUz: 'Tojik tili', nameRu: 'Таджикский' },
  { id: 'ky', nameUz: 'Qirg‘iz tili', nameRu: 'Киргизский' },
  { id: 'tr', nameUz: 'Turk tili', nameRu: 'Турецкий' },
  { id: 'ko', nameUz: 'Koreys tili', nameRu: 'Корейский' },
  { id: 'ar', nameUz: 'Arab tili', nameRu: 'Арабский' },
  { id: 'zh', nameUz: 'Xitoy tili', nameRu: 'Китайский' },
];
