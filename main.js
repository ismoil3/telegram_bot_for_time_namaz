import axios from "axios";
import { scheduleJob } from "node-schedule";
import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";

// Configuration
const token = '7873403077:AAE3iZjINbhRIVl2-8MzJImLMxnrcNH5-qg'; // Replace with your bot token
const bot = new TelegramBot(token, { polling: true });

// Data storage
const DATA_DIR = path.join(process.cwd(), 'data');
const USER_DATA_FILE = path.join(DATA_DIR, 'user_data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load existing data or initialize empty objects
let userData = {};
try {
    if (fs.existsSync(USER_DATA_FILE)) {
        userData = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
    }
} catch (error) {
    console.error('Error loading user data:', error);
}

// Helper function to save user data
const saveUserData = () => {
    try {
        // Clone userData and remove Job objects
        const dataToSave = JSON.parse(JSON.stringify(userData, (key, value) => {
            if (key === 'activeJobs') {
                const jobs = {};
                for (const [prayerKey, timeString] of Object.entries(value)) {
                    jobs[prayerKey] = timeString; // Only save the time string
                }
                return jobs;
            }
            return value;
        }));

        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Error saving user data:', error);
    }
};

// Initialize user data structure if not exists
const initUserData = (chatId) => {
    if (!userData[chatId]) {
        userData[chatId] = {
            settings: {
                city: '',
                country: '',
                latitude: null,
                longitude: null,
                method: 2, // Default calculation method
                language: 'ru', // Default language
                timeFormat: '24h', // Default time format
                notifications: [],
                notificationTime: 15, // Minutes before prayer
                activeJobs: {} // Store active scheduled jobs as time strings
            },
            lastActivity: Date.now(),
            favorites: [] // Favorite locations
        };
        saveUserData();
    }
    return userData[chatId];
};

// Prayer names in different languages
const prayerNames = {
    ru: [
        { name: 'Фаджр', value: 'Fajr', emoji: '🌅' },
        { name: 'Восход', value: 'Sunrise', emoji: '🌄' },
        { name: 'Зухр', value: 'Dhuhr', emoji: '☀️' },
        { name: 'Аср', value: 'Asr', emoji: '🌇' },
        { name: 'Магриб', value: 'Maghrib', emoji: '🌆' },
        { name: 'Иша', value: 'Isha', emoji: '🌃' }
    ],
    en: [
        { name: 'Fajr', value: 'Fajr', emoji: '🌅' },
        { name: 'Sunrise', value: 'Sunrise', emoji: '🌄' },
        { name: 'Dhuhr', value: 'Dhuhr', emoji: '☀️' },
        { name: 'Asr', value: 'Asr', emoji: '🌇' },
        { name: 'Maghrib', value: 'Maghrib', emoji: '🌆' },
        { name: 'Isha', value: 'Isha', emoji: '🌃' }
    ],
    uz: [
        { name: 'Bomdod', value: 'Fajr', emoji: '🌅' },
        { name: 'Quyosh', value: 'Sunrise', emoji: '🌄' },
        { name: 'Peshin', value: 'Dhuhr', emoji: '☀️' },
        { name: 'Asr', value: 'Asr', emoji: '🌇' },
        { name: 'Shom', value: 'Maghrib', emoji: '🌆' },
        { name: 'Xufton', value: 'Isha', emoji: '🌃' }
    ]
};

// Calculation methods
const calculationMethods = [
    { id: 0, name: 'Shia Ithna-Ashari' },
    { id: 1, name: 'University of Islamic Sciences, Karachi' },
    { id: 2, name: 'Islamic Society of North America' },
    { id: 3, name: 'Muslim World League' },
    { id: 4, name: 'Umm Al-Qura University, Makkah' },
    { id: 5, name: 'Egyptian General Authority of Survey' },
    { id: 7, name: 'Institute of Geophysics, University of Tehran' },
    { id: 8, name: 'Gulf Region' },
    { id: 9, name: 'Kuwait' },
    { id: 10, name: 'Qatar' },
    { id: 11, name: 'Majlis Ugama Islam Singapura, Singapore' },
    { id: 12, name: 'Union Organization Islamic de France' },
    { id: 13, name: 'Diyanet İşleri Başkanlığı, Turkey' },
    { id: 14, name: 'Spiritual Administration of Muslims of Russia' }
];

// Translations
const translations = {
    ru: {
        welcome: 'Ассаламу алайкум, {name}! 🕌\n\nЯ бот для получения времени намаза. Выберите действие из меню.',
        location_prompt: 'Пожалуйста, поделитесь своим местоположением или выберите город вручную.',
        location_confirmed: '📍 Ваш город: {city}\n🌍 Ваша страна: {country}',
        prayer_times_header: '*📅 {date}*\n*📍 {city}, {country}*\n\n',
        notification_setup: 'Выберите намазы для уведомлений:',
        notification_saved: '✅ Уведомления успешно настроены.',
        settings_header: '⚙️ Настройки:',
        back_to_menu: 'Возвращаемся в главное меню.',
        help: '*Помощь по использованию бота*\n\n' +
            '• 🕌 *Время намаза* - показывает время намаза для вашего местоположения\n' +
            '• 🔔 *Настройка уведомлений* - настройка уведомлений о намазах\n' +
            '• 🧭 *Направление Киблы* - показывает направление на Киблу\n' +
            '• 📆 *Рамадан* - информация о Рамадане\n' +
            '• ⚙️ *Настройки* - изменение метода расчета, языка и других параметров\n' +
            '• ❓ *Помощь* - показывает это сообщение\n\n' +
            'Для начала работы поделитесь своим местоположением или введите название города.',
        error_prayer_times: 'Не удалось получить время намаза. Попробуйте другой город.',
        error_location: '❌ Ошибка при определении местоположения. Попробуйте снова.',
        reminder: '🔔 Напоминание: {prayer} через {time} минут ({prayerTime}).',
        qibla_direction: '*🧭 Направление Киблы*\n\n' +
            'Для вашего местоположения:\n' +
            '📍 {latitude}, {longitude}\n\n' +
            'Направление Киблы: *{direction}°*\n\n' +
            '_Используйте компас на вашем телефоне и поверните его по указанному углу для определения направления на Мекку._',
        no_location: 'Пожалуйста, сначала поделитесь своим местоположением.',
        favorites_add: 'Местоположение добавлено в избранное.',
        favorites_empty: 'У вас пока нет избранных местоположений.',
        favorites_header: '*📍 Избранные местоположения:*',
        language_changed: 'Язык успешно изменен.',
        method_changed: 'Метод расчета успешно изменен.',
        time_format_changed: 'Формат времени успешно изменен.',
        ramadan_info: '*📆 Информация о Рамадане*\n\n',
        ramadan_countdown: 'До начала Рамадана осталось: *{days} дней*',
        ramadan_active: '*Рамадан активен*\nДень Рамадана: *{day}*\nСегодняшний ифтар в: *{iftar}*\nСегодняшний сухур до: *{suhoor}*',
        donate: '💰 *Поддержать разработку бота*\n\nЕсли вам нравится бот и вы хотите поддержать его развитие, вы можете сделать пожертвование.'
    },
    en: {
        welcome: 'Assalamu alaikum, {name}! 🕌\n\nI am a bot for getting prayer times. Choose an action from the menu.',
        location_prompt: 'Please share your location or choose a city manually.',
        location_confirmed: '📍 Your city: {city}\n🌍 Your country: {country}',
        prayer_times_header: '*📅 {date}*\n*📍 {city}, {country}*\n\n',
        notification_setup: 'Select prayers for notifications:',
        notification_saved: '✅ Notifications have been successfully set up.',
        settings_header: '⚙️ Settings:',
        back_to_menu: 'Returning to the main menu.',
        help: '*Bot usage help*\n\n' +
            '• 🕌 *Prayer Times* - shows prayer times for your location\n' +
            '• 🔔 *Notification Setup* - set up prayer notifications\n' +
            '• 🧭 *Qibla Direction* - shows the direction to the Qibla\n' +
            '• 📆 *Ramadan* - information about Ramadan\n' +
            '• ⚙️ *Settings* - change calculation method, language, and other parameters\n' +
            '• ❓ *Help* - shows this message\n\n' +
            'To get started, share your location or enter a city name.',
        error_prayer_times: 'Failed to get prayer times. Try another city.',
        error_location: '❌ Error determining location. Please try again.',
        reminder: '🔔 Reminder: {prayer} in {time} minutes ({prayerTime}).',
        qibla_direction: '*🧭 Qibla Direction*\n\n' +
            'For your location:\n' +
            '📍 {latitude}, {longitude}\n\n' +
            'Qibla direction: *{direction}°*\n\n' +
            '_Use the compass on your phone and rotate it to the specified angle to determine the direction to Mecca._',
        no_location: 'Please share your location first.',
        favorites_add: 'Location added to favorites.',
        favorites_empty: 'You have no favorite locations yet.',
        favorites_header: '*📍 Favorite Locations:*',
        language_changed: 'Language successfully changed.',
        method_changed: 'Calculation method successfully changed.',
        time_format_changed: 'Time format successfully changed.',
        ramadan_info: '*📆 Ramadan Information*\n\n',
        ramadan_countdown: 'Days until Ramadan: *{days} days*',
        ramadan_active: '*Ramadan is active*\nRamadan day: *{day}*\nToday\'s iftar at: *{iftar}*\nToday\'s suhoor until: *{suhoor}*',
        donate: '💰 *Support Bot Development*\n\nIf you like the bot and want to support its development, you can make a donation.'
    },
    uz: {
        welcome: 'Assalomu alaykum, {name}! 🕌\n\nMen namoz vaqtlarini olish uchun botman. Menyudan harakatni tanlang.',
        location_prompt: 'Iltimos, joylashuvingizni ulashing yoki shaharni qo\'lda tanlang.',
        location_confirmed: '📍 Sizning shahringiz: {city}\n🌍 Sizning davlatingiz: {country}',
        prayer_times_header: '*📅 {date}*\n*📍 {city}, {country}*\n\n',
        notification_setup: 'Bildirishnomalar uchun namozlarni tanlang:',
        notification_saved: '✅ Bildirishnomalar muvaffaqiyatli o\'rnatildi.',
        settings_header: '⚙️ Sozlamalar:',
        back_to_menu: 'Asosiy menyuga qaytish.',
        help: '*Bot foydalanish bo\'yicha yordam*\n\n' +
            '• 🕌 *Namoz vaqtlari* - joylashuvingiz uchun namoz vaqtlarini ko\'rsatadi\n' +
            '• 🔔 *Bildirishnomalarni sozlash* - namoz bildirishnomalarini sozlash\n' +
            '• 🧭 *Qibla yo\'nalishi* - Qiblaga yo\'nalishni ko\'rsatadi\n' +
            '• 📆 *Ramazon* - Ramazon haqida ma\'lumot\n' +
            '• ⚙️ *Sozlamalar* - hisoblash usuli, til va boshqa parametrlarni o\'zgartirish\n' +
            '• ❓ *Yordam* - ushbu xabarni ko\'rsatadi\n\n' +
            'Boshlash uchun joylashuvingizni ulashing yoki shahar nomini kiriting.',
        error_prayer_times: 'Namoz vaqtlarini olish muvaffaqiyatsiz tugadi. Boshqa shaharni sinab ko\'ring.',
        error_location: '❌ Joylashuvni aniqlashda xatolik. Iltimos, qayta urinib ko\'ring.',
        reminder: '🔔 Eslatma: {prayer} {time} daqiqadan keyin ({prayerTime}).',
        qibla_direction: '*🧭 Qibla yo\'nalishi*\n\n' +
            'Sizning joylashuvingiz uchun:\n' +
            '📍 {latitude}, {longitude}\n\n' +
            'Qibla yo\'nalishi: *{direction}°*\n\n' +
            '_Telefoningizda kompas ishlatib, ko\'rsatilgan burchakka burilgan holda Makkaga yo\'nalishni aniqlang._',
        no_location: 'Iltimos, avval joylashuvingizni ulashing.',
        favorites_add: 'Joylashuv sevimlilar ro\'yxatiga qo\'shildi.',
        favorites_empty: 'Sizda hali sevimli joylar yo\'q.',
        favorites_header: '*📍 Sevimli joylar:*',
        language_changed: 'Til muvaffaqiyatli o\'zgartirildi.',
        method_changed: 'Hisoblash usuli muvaffaqiyatli o\'zgartirildi.',
        time_format_changed: 'Vaqt formati muvaffaqiyatli o\'zgartirildi.',
        ramadan_info: '*📆 Ramazon haqida ma\'lumot*\n\n',
        ramadan_countdown: 'Ramazon boshlanishiga: *{days} kun*',
        ramadan_active: '*Ramazon davom etmoqda*\nRamazon kuni: *{day}*\nBugungi iftor vaqti: *{iftar}*\nBugungi saharlik vaqti: *{suhoor}*',
        donate: '💰 *Bot rivojlanishini qo\'llab-quvvatlash*\n\nAgar bot sizga yoqsa va uning rivojlanishini qo\'llab-quvvatlashni istasangiz, xayriya qilishingiz mumkin.'
    }
};

// Function to get text based on user language
const getText = (chatId, key, replacements = {}) => {
    const userLang = userData[chatId]?.settings?.language || 'ru';
    let text = translations[userLang][key] || translations.ru[key];

    // Replace placeholders with actual values
    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
};

// Function to get prayer names based on user language
const getPrayerNames = (chatId) => {
    const userLang = userData[chatId]?.settings?.language || 'ru';
    return prayerNames[userLang] || prayerNames.ru;
};

// Function to get daily prayer times using API.aladhan.com (more reliable API)
const getPrayerTimes = async (city, country, method = 2, timestamp = Math.floor(Date.now() / 1000)) => {
    try {
        // First try city-based lookup
        const url = `https://api.aladhan.com/v1/timingsByCity/${timestamp}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            return {
                timings: data.data.timings,
                date: data.data.date.readable,
                meta: {
                    method: calculationMethods.find(m => m.id === parseInt(method))?.name || 'Standard',
                    latitude: data.data.meta.latitude,
                    longitude: data.data.meta.longitude
                }
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching prayer times:", error);

        // Fallback to MuslimSalat API if city-based lookup fails
        try {
            const fallbackUrl = `https://muslimsalat.com/${encodeURIComponent(city)}/daily.json?country=${encodeURIComponent(country)}&method=${method}`;
            const fallbackResponse = await axios.get(fallbackUrl);
            const fallbackData = fallbackResponse.data;

            if (fallbackData.status_description === "Success.") {
                return {
                    timings: {
                        Fajr: fallbackData.items[0].fajr,
                        Sunrise: fallbackData.items[0].shurooq,
                        Dhuhr: fallbackData.items[0].dhuhr,
                        Asr: fallbackData.items[0].asr,
                        Maghrib: fallbackData.items[0].maghrib,
                        Isha: fallbackData.items[0].isha
                    },
                    date: fallbackData.items[0].date_for,
                    meta: { method: fallbackData.method }
                };
            } else {
                console.error("Fallback API Error:", fallbackData);
                return null;
            }
        } catch (fallbackError) {
            console.error("Error fetching from fallback API:", fallbackError);
            return null;
        }
    }
};

// Function to get prayer times by coordinates (more accurate)
const getPrayerTimesByCoordinates = async (latitude, longitude, method = 2, timestamp = Math.floor(Date.now() / 1000)) => {
    try {
        const url = `https://api.aladhan.com/v1/timings/${timestamp}?latitude=${latitude}&longitude=${longitude}&method=${method}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            return {
                timings: data.data.timings,
                date: data.data.date.readable,
                meta: {
                    method: calculationMethods.find(m => m.id === parseInt(method))?.name || 'Standard',
                    latitude: data.data.meta.latitude,
                    longitude: data.data.meta.longitude
                }
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching prayer times by coordinates:", error);
        return null;
    }
};

// Function to get Qibla direction
const getQiblaDirection = async (latitude, longitude) => {
    try {
        const url = `https://api.aladhan.com/v1/qibla/${latitude}/${longitude}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            return {
                direction: data.data.direction,
                latitude: data.data.latitude,
                longitude: data.data.longitude
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching Qibla direction:", error);
        return null;
    }
};

// Function to get Ramadan information
const getRamadanInfo = async (latitude, longitude, method = 2, year = new Date().getFullYear()) => {
    try {
        // Get current Hijri date
        const url = `https://api.aladhan.com/v1/gToH?latitude=${latitude}&longitude=${longitude}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            const hijriDate = data.data.hijri;
            const isRamadan = hijriDate.month.number === 9;
            const ramadanDay = isRamadan ? parseInt(hijriDate.day) : null;

            // Calculate days until Ramadan if not in Ramadan
            let daysUntilRamadan = null;
            if (!isRamadan) {
                // This is a simplification; for actual calculation, we need more advanced Hijri calendar handling
                const currentMonth = hijriDate.month.number;
                const currentDay = parseInt(hijriDate.day);

                if (currentMonth < 9) {
                    // Rough estimation of days until Ramadan
                    const monthsUntil = 9 - currentMonth;
                    daysUntilRamadan = (monthsUntil * 30) - currentDay;
                } else {
                    // Next year's Ramadan
                    const monthsUntil = 12 - currentMonth + 9;
                    daysUntilRamadan = (monthsUntil * 30) - currentDay;
                }
            }

            // If in Ramadan, get today's Iftar and Suhoor times
            let iftar = null;
            let suhoor = null;

            if (isRamadan) {
                const prayerData = await getPrayerTimesByCoordinates(latitude, longitude, method);
                if (prayerData) {
                    iftar = prayerData.timings.Maghrib;
                    suhoor = prayerData.timings.Fajr;
                }
            }

            return {
                isRamadan,
                ramadanDay,
                daysUntilRamadan,
                iftar,
                suhoor,
                hijriDate
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching Ramadan information:", error);
        return null;
    }
};

// Function to reverse geocode coordinates to address
const reverseGeocode = async (latitude, longitude) => {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`; // Use English as default
        const response = await axios.get(url);
        const address = response.data.address;

        const city = address.city || address.town || address.village || address.hamlet || 'Unknown';
        const country = address.country || 'Unknown';

        return { city, country, address };
    } catch (error) {
        console.error("Error reverse geocoding:", error);
        return { city: 'Unknown', country: 'Unknown' };
    }
};

// Function to generate the main menu keyboard
const getMainMenuKeyboard = (chatId) => {
    const userLang = userData[chatId]?.settings?.language || 'ru';

    const menuItems = {
        ru: [
            ['🕌 Время намаза'],
            ['🔔 Настройка уведомлений', '🧭 Направление Киблы'],
            ['📆 Рамадан', '⭐ Избранное'],
            ['⚙️ Настройки', '❓ Помощь']
        ],
        en: [
            ['🕌 Prayer Times'],
            ['🔔 Notification Setup', '🧭 Qibla Direction'],
            ['📆 Ramadan', '⭐ Favorites'],
            ['⚙️ Settings', '❓ Help']
        ],
        uz: [
            ['🕌 Namoz vaqtlari'],
            ['🔔 Bildirishnoma sozlash', '🧭 Qibla yo\'nalishi'],
            ['📆 Ramazon', '⭐ Sevimlilar'],
            ['⚙️ Sozlamalar', '❓ Yordam']
        ]
    };

    return {
        reply_markup: {
            keyboard: menuItems[userLang] || menuItems.ru,
            resize_keyboard: true
        }
    };
};

// Function to generate the location keyboard
const getLocationKeyboard = (chatId) => {
    const userLang = userData[chatId]?.settings?.language || 'ru';

    const buttonText = {
        ru: '📍 Отправить местоположение (GPS)',
        en: '📍 Send Location (GPS)',
        uz: '📍 Joylashuvni yuborish (GPS)'
    };

    const backText = {
        ru: '↩️ Назад в меню',
        en: '↩️ Back to Menu',
        uz: '↩️ Menyuga qaytish'
    };

    return {
        reply_markup: {
            keyboard: [
                [{ text: buttonText[userLang] || buttonText.ru, request_location: true }],
                [backText[userLang] || backText.ru]
            ],
            resize_keyboard: true
        }
    };
};

// Function to generate the notification setup keyboard
const getNotificationKeyboard = (chatId) => {
    const user = userData[chatId];
    const prayerList = getPrayerNames(chatId);

    const userLang = user?.settings?.language || 'ru';

    const saveText = {
        ru: '💾 Сохранить',
        en: '💾 Save',
        uz: '💾 Saqlash'
    };

    const timingText = {
        ru: '⏱️ Время уведомления: {time} мин. до намаза',
        en: '⏱️ Notification timing: {time} min. before prayer',
        uz: '⏱️ Bildirishnoma vaqti: namozdan {time} daqiqa oldin'
    };

    return {
        reply_markup: {
            inline_keyboard: [
                ...prayerList.map(prayer => [
                    {
                        text: `${user?.settings?.notifications?.includes(prayer.value) ? '✅' : '❌'} ${prayer.emoji} ${prayer.name}`,
                        callback_data: `notify_${prayer.value}`
                    }
                ]),
                [
                    {
                        text: timingText[userLang].replace('{time}', user?.settings?.notificationTime || 15),
                        callback_data: 'notification_timing'
                    }
                ],
                [
                    {
                        text: saveText[userLang] || saveText.ru,
                        callback_data: 'save_notifications'
                    }
                ]
            ]
        }
    };
};

// Function to generate settings keyboard
const getSettingsKeyboard = (chatId) => {
    const userLang = userData[chatId]?.settings?.language || 'ru';

    const methodText = {
        ru: '🔄 Метод расчета',
        en: '🔄 Calculation Method',
        uz: '🔄 Hisoblash usuli'
    };

    const langText = {
        ru: '🌐 Язык / Language',
        en: '🌐 Language / Язык',
        uz: '🌐 Til / Language'
    };

    const timeFormatText = {
        ru: '🕒 Формат времени',
        en: '🕒 Time Format',
        uz: '🕒 Vaqt formati'
    };

    const donateText = {
        ru: '💰 Поддержать',
        en: '💰 Donate',
        uz: '💰 Qo\'llab-quvvatlash'
    };

    const backText = {
        ru: '↩️ Назад',
        en: '↩️ Back',
        uz: '↩️ Ortga'
    };

    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: methodText[userLang] || methodText.ru, callback_data: 'settings_method' }],
                [{ text: langText[userLang] || langText.ru, callback_data: 'settings_language' }],
                [{ text: timeFormatText[userLang] || timeFormatText.ru, callback_data: 'settings_time_format' }],
                [{ text: donateText[userLang] || donateText.ru, callback_data: 'settings_donate' }],
                [{ text: backText[userLang] || backText.ru, callback_data: 'settings_back' }]
            ]
        }
    };
};

// Function to generate calculation method selection keyboard
const getMethodKeyboard = (chatId) => {
    const user = userData[chatId];
    const userLang = user?.settings?.language || 'ru';

    const backText = {
        ru: '↩️ Назад',
        en: '↩️ Back',
        uz: '↩️ Ortga'
    };

    return {
        reply_markup: {
            inline_keyboard: [
                ...calculationMethods.map(method => [
                    {
                        text: `${method.id === user?.settings?.method ? '✅ ' : ''}${method.name}`,
                        callback_data: `method_${method.id}`
                    }
                ]),
                [{ text: backText[userLang] || backText.ru, callback_data: 'method_back' }]
            ]
        }
    };
};

// Function to generate language selection keyboard
const getLanguageKeyboard = () => {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
                    { text: '🇬🇧 English', callback_data: 'lang_en' }
                ],
                [{ text: '🇺🇿 O\'zbek', callback_data: 'lang_uz' }],
                [{ text: '↩️ Back / Назад / Ortga', callback_data: 'lang_back' }]
            ]
        }
    };
};

// Function to generate time format selection keyboard
const getTimeFormatKeyboard = (chatId) => {
    const user = userData[chatId];
    const userLang = user?.settings?.language || 'ru';

    const hour24Text = {
        ru: '24-часовой (14:00)',
        en: '24-hour (14:00)',
        uz: '24-soatlik (14:00)'
    };

    const hour12Text = {
        ru: '12-часовой (2:00 PM)',
        en: '12-hour (2:00 PM)',
        uz: '12-soatlik (2:00 PM)'
    };

    const backText = {
        ru: '↩️ Назад',
        en: '↩️ Back',
        uz: '↩️ Ortga'
    };

    return {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: `${user?.settings?.timeFormat === '24h' ? '✅ ' : ''}${hour24Text[userLang] || hour24Text.ru}`,
                        callback_data: 'time_24h'
                    }
                ],
                [
                    {
                        text: `${user?.settings?.timeFormat === '12h' ? '✅ ' : ''}${hour12Text[userLang] || hour12Text.ru}`,
                        callback_data: 'time_12h'
                    }
                ],
                [{ text: backText[userLang] || backText.ru, callback_data: 'time_back' }]
            ]
        }
    };
};

// Function to generate notification timing selection keyboard
const getNotificationTimingKeyboard = (chatId) => {
    const user = userData[chatId];
    const userLang = user?.settings?.language || 'ru';

    const backText = {
        ru: '↩️ Назад',
        en: '↩️ Back',
        uz: '↩️ Ortga'
    };

    const options = [5, 10, 15, 20, 30, 45, 60];

    return {
        reply_markup: {
            inline_keyboard: [
                ...options.map(time => [
                    {
                        text: `${user?.settings?.notificationTime === time ? '✅ ' : ''}${time} ${userLang === 'ru' ? 'мин.' : userLang === 'uz' ? 'daqiqa' : 'min.'}`,
                        callback_data: `timing_${time}`
                    }
                ]),
                [{ text: backText[userLang] || backText.ru, callback_data: 'timing_back' }]
            ]
        }
    };
};

// Format time based on user preference
const formatTime = (timeString, chatId) => {
    const timeFormat = userData[chatId]?.settings?.timeFormat || '24h';
    if (!timeString) return timeString;

    // Parse the time string (format HH:mm)
    let [hours, minutes] = timeString.split(':').map(Number);

    if (timeFormat === '12h') {
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12; // Convert 0 to 12 for 12 AM
        return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } else {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
};

// Schedule prayer notifications
const scheduleNotifications = (chatId) => {
    // Cancel any existing scheduled jobs for this user
    const user = userData[chatId];
    if (!user) return;

    const activeJobs = user.settings.activeJobs || {};

    Object.values(activeJobs).forEach(job => {
        if (job && job.cancel) job.cancel(); // Cancel the Job object
    });

    // Clear activeJobs
    user.settings.activeJobs = {};

    // Get user's preferences
    const notifications = user.settings.notifications || [];
    const notificationTime = user.settings.notificationTime || 15;
    const latitude = user.settings.latitude;
    const longitude = user.settings.longitude;
    const method = user.settings.method || 2;

    if (!notifications.length || !latitude || !longitude) return;

    // Schedule for today
    scheduleTodayNotifications(chatId, notifications, notificationTime, latitude, longitude, method);

    // Schedule daily job to refresh notifications at midnight
    const midnightJob = scheduleJob('0 0 * * *', () => {
        scheduleTodayNotifications(chatId, notifications, notificationTime, latitude, longitude, method);
    });

    // Store the midnight job
    user.settings.activeJobs['midnight'] = midnightJob;
    saveUserData();
};

// Schedule today's notifications
const scheduleTodayNotifications = async (chatId, notifications, notificationTime, latitude, longitude, method) => {
    try {
        // Get today's prayer times
        const prayerData = await getPrayerTimesByCoordinates(latitude, longitude, method);
        if (!prayerData) return;

        const timings = prayerData.timings;
        const prayerNames = getPrayerNames(chatId);
        const now = new Date();

        // Schedule each notification
        notifications.forEach(prayerKey => {
            const timeString = timings[prayerKey];
            if (!timeString) return;

            // Parse prayer time
            const [hours, minutes] = timeString.split(':').map(Number);
            const prayerTime = new Date();
            prayerTime.setHours(hours, minutes, 0, 0);

            // Calculate notification time
            const notifyTime = new Date(prayerTime.getTime() - (notificationTime * 60 * 1000));

            // Only schedule if it's in the future
            if (notifyTime > now) {
                const job = scheduleJob(notifyTime, () => {
                    // Find the prayer name in the user's language
                    const prayerInfo = prayerNames.find(p => p.value === prayerKey);
                    const prayerName = prayerInfo ? prayerInfo.name : prayerKey;
                    const formattedTime = formatTime(timeString, chatId);

                    // Send notification
                    bot.sendMessage(chatId, getText(chatId, 'reminder', {
                        prayer: prayerName,
                        time: notificationTime,
                        prayerTime: formattedTime
                    }));
                });

                // Store the scheduled time instead of the Job object
                userData[chatId].settings.activeJobs[prayerKey] = notifyTime.toISOString();
            }
        });

        // Save user data
        saveUserData();
    } catch (error) {
        console.error("Error scheduling notifications:", error);
    }
};

// Recreate jobs on bot startup
const recreateJobs = (chatId) => {
    const user = userData[chatId];
    if (!user || !user.settings.activeJobs) return;

    const notifications = user.settings.notifications || [];
    const notificationTime = user.settings.notificationTime || 15;

    Object.entries(user.settings.activeJobs).forEach(([prayerKey, timeString]) => {
        const notifyTime = new Date(timeString);
        const now = new Date();

        // Only recreate the job if it's in the future
        if (notifyTime > now) {
            const job = scheduleJob(notifyTime, () => {
                const prayerInfo = getPrayerNames(chatId).find(p => p.value === prayerKey);
                const prayerName = prayerInfo ? prayerInfo.name : prayerKey;
                const formattedTime = formatTime(notifyTime.toISOString(), chatId);

                bot.sendMessage(chatId, getText(chatId, 'reminder', {
                    prayer: prayerName,
                    time: notificationTime,
                    prayerTime: formattedTime
                }));
            });

            // Store the Job object in memory (not in userData)
            user.settings.activeJobs[prayerKey] = job;
        }
    });
};

// On bot startup, recreate jobs for all users
Object.keys(userData).forEach(chatId => {
    recreateJobs(chatId);
});

// Start command handler
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = initUserData(chatId);

    // Update last activity
    user.lastActivity = Date.now();
    saveUserData();

    // Send welcome message
    bot.sendMessage(
        chatId,
        getText(chatId, 'welcome', { name: msg.from.first_name }),
        getMainMenuKeyboard(chatId)
    );
});

// Help command handler
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        getText(chatId, 'help'),
        { parse_mode: 'Markdown', ...getMainMenuKeyboard(chatId) }
    );
});

// Settings command handler
bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        getText(chatId, 'settings_header'),
        getSettingsKeyboard(chatId)
    );
});

// Process location sharing
bot.on('location', async (msg) => {
    const chatId = msg.chat.id;
    const user = initUserData(chatId);

    // Update last activity
    user.lastActivity = Date.now();
    saveUserData();

    try {
        const { latitude, longitude } = msg.location;

        // Reverse geocode to get city and country
        const { city, country } = await reverseGeocode(latitude, longitude);

        // Save user location
        user.settings.city = city;
        user.settings.country = country;
        user.settings.latitude = latitude;
        user.settings.longitude = longitude;
        saveUserData();

        // Send confirmation message
        bot.sendMessage(
            chatId,
            getText(chatId, 'location_confirmed', { city, country }),
            getMainMenuKeyboard(chatId)
        );

        // Schedule notifications if needed
        if (user.settings.notifications && user.settings.notifications.length > 0) {
            scheduleNotifications(chatId);
        }

        // Show prayer times immediately
        await showPrayerTimes(chatId);
    } catch (error) {
        console.error("Error processing location:", error);
        bot.sendMessage(
            chatId,
            getText(chatId, 'error_location'),
            getMainMenuKeyboard(chatId)
        );
    }
});

// Show prayer times function
const showPrayerTimes = async (chatId) => {
    const user = userData[chatId];
    if (!user || !user.settings.city) {
        bot.sendMessage(
            chatId,
            getText(chatId, 'location_prompt'),
            getLocationKeyboard(chatId)
        );
        return;
    }

    try {
        let prayerData;

        // Use coordinates if available (more accurate)
        if (user.settings.latitude && user.settings.longitude) {
            prayerData = await getPrayerTimesByCoordinates(
                user.settings.latitude,
                user.settings.longitude,
                user.settings.method || 2
            );
        } else {
            // Fallback to city/country
            prayerData = await getPrayerTimes(
                user.settings.city,
                user.settings.country,
                user.settings.method || 2
            );
        }

        if (!prayerData) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'error_prayer_times'),
                getMainMenuKeyboard(chatId)
            );
            return;
        }

        // Get prayer names in user's language
        const prayers = getPrayerNames(chatId);

        // Create message header
        let message = getText(chatId, 'prayer_times_header', {
            date: prayerData.date,
            city: user.settings.city,
            country: user.settings.country
        });

        // Add each prayer time to the message
        prayers.forEach(prayer => {
            const time = prayerData.timings[prayer.value];
            if (time) {
                const formattedTime = formatTime(time, chatId);
                message += `${prayer.emoji} *${prayer.name}:* ${formattedTime}\n`;
            }
        });

        // Add method info
        message += `\n_${prayerData.meta.method}_`;

        // Add favorite button
        const favoriteButton = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⭐ Add to Favorites', callback_data: 'add_favorite' }]
                ]
            }
        };

        bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            ...favoriteButton
        });
    } catch (error) {
        console.error("Error showing prayer times:", error);
        bot.sendMessage(
            chatId,
            getText(chatId, 'error_prayer_times'),
            getMainMenuKeyboard(chatId)
        );
    }
};

// Message handler for commands and menu items
bot.on('message', async (msg) => {
    if (msg.location) return; // Already handled by location handler

    const chatId = msg.chat.id;
    const user = initUserData(chatId);
    const text = msg.text;

    if (!text) return;

    // Update last activity
    user.lastActivity = Date.now();
    saveUserData();

    // Handle menu options based on language
    const userLang = user.settings.language || 'ru';

    // Prayer Times menu options in different languages
    if (text === '🕌 Время намаза' || text === '🕌 Prayer Times' || text === '🕌 Namoz vaqtlari') {
        await showPrayerTimes(chatId);
        return;
    }

    // Notification Setup menu options
    if (text === '🔔 Настройка уведомлений' || text === '🔔 Notification Setup' || text === '🔔 Bildirishnoma sozlash') {
        if (!user.settings.city || (!user.settings.latitude && !user.settings.longitude)) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'no_location'),
                getLocationKeyboard(chatId)
            );
            return;
        }

        bot.sendMessage(
            chatId,
            getText(chatId, 'notification_setup'),
            getNotificationKeyboard(chatId)
        );
        return;
    }

    // Qibla Direction menu options
    if (text === '🧭 Направление Киблы' || text === '🧭 Qibla Direction' || text === '🧭 Qibla yo\'nalishi') {
        if (!user.settings.latitude || !user.settings.longitude) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'no_location'),
                getLocationKeyboard(chatId)
            );
            return;
        }

        const qiblaData = await getQiblaDirection(user.settings.latitude, user.settings.longitude);
        if (!qiblaData) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'error_location'),
                getMainMenuKeyboard(chatId)
            );
            return;
        }

        bot.sendMessage(
            chatId,
            getText(chatId, 'qibla_direction', {
                direction: qiblaData.direction.toFixed(2),
                latitude: user.settings.latitude.toFixed(6),
                longitude: user.settings.longitude.toFixed(6)
            }),
            { parse_mode: 'Markdown', ...getMainMenuKeyboard(chatId) }
        );
        return;
    }

    // Ramadan menu options
    if (text === '📆 Рамадан' || text === '📆 Ramadan' || text === '📆 Ramazon') {
        if (!user.settings.latitude || !user.settings.longitude) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'no_location'),
                getLocationKeyboard(chatId)
            );
            return;
        }

        const ramadanInfo = await getRamadanInfo(
            user.settings.latitude,
            user.settings.longitude,
            user.settings.method || 2
        );

        if (!ramadanInfo) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'error_prayer_times'),
                getMainMenuKeyboard(chatId)
            );
            return;
        }

        let message = getText(chatId, 'ramadan_info');

        if (ramadanInfo.isRamadan) {
            const iftarTime = formatTime(ramadanInfo.iftar, chatId);
            const suhoorTime = formatTime(ramadanInfo.suhoor, chatId);

            message += getText(chatId, 'ramadan_active', {
                day: ramadanInfo.ramadanDay,
                iftar: iftarTime,
                suhoor: suhoorTime
            });
        } else {
            message += getText(chatId, 'ramadan_countdown', {
                days: ramadanInfo.daysUntilRamadan
            });
        }

        bot.sendMessage(
            chatId,
            message,
            { parse_mode: 'Markdown', ...getMainMenuKeyboard(chatId) }
        );
        return;
    }

    // Favorites menu options
    if (text === '⭐ Избранное' || text === '⭐ Favorites' || text === '⭐ Sevimlilar') {
        if (!user.favorites || user.favorites.length === 0) {
            bot.sendMessage(
                chatId,
                getText(chatId, 'favorites_empty'),
                getMainMenuKeyboard(chatId)
            );
            return;
        }

        let message = getText(chatId, 'favorites_header') + '\n\n';

        const buttons = user.favorites.map((favorite, index) => [
            {
                text: `${index + 1}. ${favorite.city}, ${favorite.country}`,
                callback_data: `favorite_${index}`
            }
        ]);

        const favoriteKeyboard = {
            reply_markup: {
                inline_keyboard: buttons
            }
        };

        bot.sendMessage(
            chatId,
            message,
            { parse_mode: 'Markdown', ...favoriteKeyboard }
        );
        return;
    }

    // Settings menu options
    if (text === '⚙️ Настройки' || text === '⚙️ Settings' || text === '⚙️ Sozlamalar') {
        bot.sendMessage(
            chatId,
            getText(chatId, 'settings_header'),
            getSettingsKeyboard(chatId)
        );
        return;
    }

    // Help menu options
    if (text === '❓ Помощь' || text === '❓ Help' || text === '❓ Yordam') {
        bot.sendMessage(
            chatId,
            getText(chatId, 'help'),
            { parse_mode: 'Markdown', ...getMainMenuKeyboard(chatId) }
        );
        return;
    }

    // Back to Menu options
    if (text === '↩️ Назад в меню' || text === '↩️ Back to Menu' || text === '↩️ Menyuga qaytish') {
        bot.sendMessage(
            chatId,
            getText(chatId, 'back_to_menu'),
            getMainMenuKeyboard(chatId)
        );
        return;
    }

    // If nothing matched and there's text, assume it's a city name
    if (text && !text.startsWith('/')) {
        try {
            // Try to get prayer times for the entered city
            user.settings.city = text;
            user.settings.country = ''; // Clear country as we don't know it
            saveUserData();

            await showPrayerTimes(chatId);
        } catch (error) {
            console.error("Error processing city:", error);
            bot.sendMessage(
                chatId,
                getText(chatId, 'error_prayer_times'),
                getMainMenuKeyboard(chatId)
            );
        }
    }
});

// Callback query handler for inline buttons
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;
    const user = initUserData(chatId);

    // Update last activity
    user.lastActivity = Date.now();
    saveUserData();

    // Handle notification toggles
    if (data.startsWith('notify_')) {
        const prayerName = data.split('_')[1];

        if (!user.settings.notifications) {
            user.settings.notifications = [];
        }

        // Toggle notification for this prayer
        if (user.settings.notifications.includes(prayerName)) {
            user.settings.notifications = user.settings.notifications.filter(p => p !== prayerName);
        } else {
            user.settings.notifications.push(prayerName);
        }

        saveUserData();

        // Update keyboard
        bot.editMessageReplyMarkup(
            getNotificationKeyboard(chatId).reply_markup,
            { chat_id: chatId, message_id: messageId }
        );

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle notification timing
    if (data === 'notification_timing') {
        bot.editMessageText(
            getText(chatId, 'notification_setup'),
            {
                chat_id: chatId,
                message_id: messageId,
                ...getNotificationTimingKeyboard(chatId)
            }
        );

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle notification timing selection
    if (data.startsWith('timing_')) {
        if (data === 'timing_back') {
            bot.editMessageText(
                getText(chatId, 'notification_setup'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getNotificationKeyboard(chatId)
                }
            );
        } else {
            const time = parseInt(data.split('_')[1]);
            user.settings.notificationTime = time;
            saveUserData();

            // Update the notification keyboard with new timing
            bot.editMessageText(
                getText(chatId, 'notification_setup'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getNotificationKeyboard(chatId)
                }
            );
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle save notifications
    if (data === 'save_notifications') {
        // Schedule notifications
        scheduleNotifications(chatId);

        bot.sendMessage(
            chatId,
            getText(chatId, 'notification_saved'),
            getMainMenuKeyboard(chatId)
        );

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle settings menu
    if (data.startsWith('settings_')) {
        const setting = data.split('_')[1];

        if (setting === 'method') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getMethodKeyboard(chatId)
                }
            );
        } else if (setting === 'language') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getLanguageKeyboard()
                }
            );
        } else if (setting === 'time_format') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getTimeFormatKeyboard(chatId)
                }
            );
        } else if (setting === 'donate') {
            bot.sendMessage(
                chatId,
                getText(chatId, 'donate'),
                { parse_mode: 'Markdown' }
            );
        } else if (setting === 'back') {
            bot.deleteMessage(chatId, messageId);
            bot.sendMessage(
                chatId,
                getText(chatId, 'back_to_menu'),
                getMainMenuKeyboard(chatId)
            );
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle method selection
    if (data.startsWith('method_')) {
        if (data === 'method_back') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getSettingsKeyboard(chatId)
                }
            );
        } else {
            const methodId = parseInt(data.split('_')[1]);
            user.settings.method = methodId;
            saveUserData();

            // Update notifications if necessary
            if (user.settings.notifications && user.settings.notifications.length > 0) {
                scheduleNotifications(chatId);
            }

            bot.sendMessage(
                chatId,
                getText(chatId, 'method_changed'),
                getMainMenuKeyboard(chatId)
            );

            bot.deleteMessage(chatId, messageId);
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle language selection
    if (data.startsWith('lang_')) {
        if (data === 'lang_back') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getSettingsKeyboard(chatId)
                }
            );
        } else {
            const lang = data.split('_')[1];
            user.settings.language = lang;
            saveUserData();

            bot.sendMessage(
                chatId,
                getText(chatId, 'language_changed'),
                getMainMenuKeyboard(chatId)
            );

            bot.deleteMessage(chatId, messageId);
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle time format selection
    if (data.startsWith('time_')) {
        if (data === 'time_back') {
            bot.editMessageText(
                getText(chatId, 'settings_header'),
                {
                    chat_id: chatId,
                    message_id: messageId,
                    ...getSettingsKeyboard(chatId)
                }
            );
        } else {
            const format = data.split('_')[1];
            user.settings.timeFormat = format;
            saveUserData();

            bot.sendMessage(
                chatId,
                getText(chatId, 'time_format_changed'),
                getMainMenuKeyboard(chatId)
            );

            bot.deleteMessage(chatId, messageId);
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle add to favorites
    if (data === 'add_favorite') {
        if (!user.settings.city || !user.settings.country) {
            bot.answerCallbackQuery(callbackQuery.id, {
                text: getText(chatId, 'no_location'),
                show_alert: true
            });
            return;
        }

        if (!user.favorites) {
            user.favorites = [];
        }

        // Check if this location already exists
        const exists = user.favorites.some(
            fav => fav.city === user.settings.city && fav.country === user.settings.country
        );

        if (!exists) {
            user.favorites.push({
                city: user.settings.city,
                country: user.settings.country,
                latitude: user.settings.latitude,
                longitude: user.settings.longitude
            });
            saveUserData();
        }

        bot.answerCallbackQuery(callbackQuery.id, {
            text: getText(chatId, 'favorites_add'),
            show_alert: false
        });
        return;
    }

    // Handle favorite selection
    if (data.startsWith('favorite_')) {
        const index = parseInt(data.split('_')[1]);
        const favorite = user.favorites[index];

        if (favorite) {
            // Set this as current location
            user.settings.city = favorite.city;
            user.settings.country = favorite.country;
            user.settings.latitude = favorite.latitude;
            user.settings.longitude = favorite.longitude;
            saveUserData();

            // Update notifications if necessary
            if (user.settings.notifications && user.settings.notifications.length > 0) {
                scheduleNotifications(chatId);
            }

            // Show prayer times for the selected favorite location
            await showPrayerTimes(chatId);
        }

        // Acknowledge the callback query
        bot.answerCallbackQuery(callbackQuery.id);
        return;
    }

    // Handle unknown callback queries
    bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Unknown action. Please try again.',
        show_alert: true
    });
});

// Function to clean up inactive users
const cleanupInactiveUsers = () => {
    const now = Date.now();
    const inactiveThreshold = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

    Object.keys(userData).forEach(chatId => {
        const user = userData[chatId];
        if (now - user.lastActivity > inactiveThreshold) {
            // Cancel all active jobs for this user
            Object.values(user.settings.activeJobs).forEach(job => {
                if (job && job.cancel) job.cancel();
            });

            // Remove the user from the data
            delete userData[chatId];
        }
    });

    // Save the updated user data
    saveUserData();
};

// Schedule cleanup job to run daily
scheduleJob('0 0 * * *', cleanupInactiveUsers);

// Start the bot
console.log('Bot is running...');


