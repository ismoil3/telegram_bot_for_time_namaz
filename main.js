import axios from "axios";
import { scheduleJob } from "node-schedule";
import TelegramBot from "node-telegram-bot-api";

// Telegram bot token (from BotFather)
const token = '7873403077:AAE3iZjINbhRIVl2-8MzJImLMxnrcNH5-qg';
const bot = new TelegramBot(token, { polling: true });

// Admin configuration
const ADMIN_CHAT_ID = 7179365383; // Replace with your Telegram chat ID

// User session storage
const userSessions = {};
// User preferences storage
const userPreferences = {};

// Store all user chat IDs
const allUsers = new Set();

// Define global prayer list
const prayers = [
    { name: 'Фаҷр', value: 'fajr' },
    { name: 'Зуҳр', value: 'dhuhr' },
    { name: 'Аср', value: 'asr' },
    { name: 'Мағриб', value: 'maghrib' },
    { name: 'Ишо', value: 'isha' }
];

// Function to generate the main menu keyboard
const getMainMenuKeyboard = () => {
    return {
        reply_markup: {
            keyboard: [
                ['🕌 Вақти намоз'],
                ['🔔 Огоҳинома'],
                ['📅 Тақвими моҳи ҷорӣ'],
                ['🧭 Самти қибла'],
                ['⚙️ Танзимот'],
                ['❓ Маълумот']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
};

// Function to generate the admin panel keyboard
const getAdminPanelKeyboard = () => {
    return {
        reply_markup: {
            keyboard: [
                ['/reklama'], // Button to send advertisements
                ['/editcommand'], // Button to edit commands
                ['/deletecommand'], // Button to delete commands
                ['↩️ Бозгашт ба меню'] // Button to return to the main menu
            ],
            resize_keyboard: true, // Resize the keyboard to fit the screen
            one_time_keyboard: true // Hide the keyboard after one use
        }
    };
};

// Command to open the admin panel
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;

    // Check if the user is an admin
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Шумо иҷозати ин амалро надоред.");
        return;
    }

    // Send the admin panel keyboard
    bot.sendMessage(chatId, "Админ панел:", getAdminPanelKeyboard());
});

// Handle the "Return to Main Menu" button
bot.onText(/↩️ Бозгашт ба меню/, (msg) => {
    const chatId = msg.chat.id;

    // Send the main menu keyboard
    bot.sendMessage(chatId, "Ба менюи асосӣ баргаштем.", getMainMenuKeyboard());
});

// Function to generate the location keyboard
const getLocationKeyboard = () => {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '📍 Фиристодани мавқеъ (GPS)', request_location: true }],
                ['↩️ Бозгашт ба меню']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
};

// Function to generate the settings keyboard
const getSettingsKeyboard = () => {
    return {
        reply_markup: {
            keyboard: [
                ['🌙 Тағйири методи ҳисобкунӣ'],
                ['🔤 Тағйири забон'],
                ['↩️ Бозгашт ба меню']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
};

// Function to generate the calculation method keyboard
const getCalculationMethodKeyboard = () => {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Методи Исломӣ (UM)', callback_data: 'method_1' }],
                [{ text: 'Методи Муслимони Амрико (ISNA)', callback_data: 'method_2' }],
                [{ text: 'Методи Маркази исломии Фаронса (MWL)', callback_data: 'method_3' }],
                [{ text: 'Методи Уммул-Куро (Макка)', callback_data: 'method_4' }],
                [{ text: 'Методи Маркази исломии Миср (Egypt)', callback_data: 'method_5' }]
            ]
        }
    };
};

// Function to generate the language selection keyboard
const getLanguageKeyboard = () => {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Тоҷикӣ', callback_data: 'lang_tj' }],
                [{ text: 'Русский', callback_data: 'lang_ru' }],
                [{ text: 'O\'zbekcha', callback_data: 'lang_uz' }],
                [{ text: 'English', callback_data: 'lang_en' }]
            ]
        }
    };
};

// Function to get prayer times
const getPrayerTimes = async (city, country, method = 2) => {
    try {
        const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            return {
                timings: data.data.timings,
                date: data.data.date.readable,
                meta: data.data.meta
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching prayer times:", error);
        return null;
    }
};

// Function to get Qibla direction
const getQiblaDirection = async (city, country) => {
    try {
        const url = `https://api.aladhan.com/v1/qibla/${encodeURIComponent(city)}/${encodeURIComponent(country)}`;
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
        console.error("Error fetching qibla direction:", error);
        return null;
    }
};

// Function to determine next prayer
const getNextPrayer = (timings) => {
    const now = new Date();
    const prayers = [
        { name: 'Фаҷр', time: timings.Fajr.split(' ')[0] },
        { name: 'Тулӯъ', time: timings.Sunrise.split(' ')[0] },
        { name: 'Зуҳр', time: timings.Dhuhr.split(' ')[0] },
        { name: 'Аср', time: timings.Asr.split(' ')[0] },
        { name: 'Мағриб', time: timings.Maghrib.split(' ')[0] },
        { name: 'Ишо', time: timings.Isha.split(' ')[0] }
    ];

    // Convert today's prayer times to Date objects
    prayers.forEach(prayer => {
        const [hours, minutes] = prayer.time.split(':').map(Number);
        const prayerTime = new Date(now);
        prayerTime.setHours(hours, minutes, 0, 0); // Setting hours, minutes, seconds and milliseconds
        prayer.dateTime = prayerTime;
    });

    // Find next prayer for today
    const nextPrayerToday = prayers.find(prayer => prayer.dateTime > now);

    if (nextPrayerToday) {
        // Calculate remaining time for next prayer today
        const diff = nextPrayerToday.dateTime - now;
        const hoursRemaining = Math.floor(diff / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        nextPrayerToday.remaining = `${hoursRemaining}ч ${minutesRemaining}д`;
        return nextPrayerToday;
    } else {
        // All prayers for today have passed, calculate Fajr for tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Set Fajr time for tomorrow
        const [fajrHours, fajrMinutes] = prayers[0].time.split(':').map(Number);
        tomorrow.setHours(fajrHours, fajrMinutes, 0, 0);
        const diff = tomorrow - now;
        const hoursRemaining = Math.floor(diff / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return {
            name: 'Фаҷр (фардо)',
            time: prayers[0].time,
            remaining: `${hoursRemaining}ч ${minutesRemaining}д`
        };
    }
};

// Function to format prayer times message
const formatPrayerTimes = (prayerData, city, country, nextPrayer = null) => {
    const { timings, date, meta } = prayerData;

    // Format times to remove timezone information
    const formatTime = (time) => time.split(' ')[0];

    let message = `*📅 ${date}*\n*📍 ${city}, ${country}*\n\n` +
        `*🌅 Фаҷр:* \`${formatTime(timings.Fajr)}\`\n` +
        `*☀️ Тулӯъ:* \`${formatTime(timings.Sunrise)}\`\n` +
        `*🌞 Зуҳр:* \`${formatTime(timings.Dhuhr)}\`\n` +
        `*🌇 Аср:* \`${formatTime(timings.Asr)}\`\n` +
        `*🌆 Мағриб:* \`${formatTime(timings.Maghrib)}\`\n` +
        `*🌃 Ишо:* \`${formatTime(timings.Isha)}\`\n`;

    // Add next prayer info if available
    if (nextPrayer && nextPrayer.name && nextPrayer.time && nextPrayer.remaining) {
        message += `\n*⏳ Намози оянда:* \`${nextPrayer.name}\` дар \`${nextPrayer.time}\` (${nextPrayer.remaining})\n`;
    }

    message += `\n_Методи ҳисобкунӣ: ${meta.method.name}_`;

    return message;
};

// Setup prayer notifications
const setupNotifications = async (chatId, city, country, prayerList) => {
    // Cancel existing jobs for this user
    if (userPreferences[chatId]?.jobs) {
        userPreferences[chatId].jobs.forEach(job => job.cancel());
    }

    // Initialize jobs array
    if (!userPreferences[chatId]) {
        userPreferences[chatId] = {};
    }
    userPreferences[chatId].jobs = [];

    try {
        // Get calculation method if set, default to 2
        const method = userPreferences[chatId]?.calculationMethod || 2;

        // Get prayer times
        const prayerData = await getPrayerTimes(city, country, method);
        if (!prayerData) {
            throw new Error("Failed to fetch prayer times");
        }

        const { timings } = prayerData;
        // Creating an array of all notification jobs to be scheduled
        const notificationJobs = [];

        // Validate prayerList isn't empty or null
        if (!prayerList || prayerList.length === 0) {
            bot.sendMessage(
                chatId,
                `⚠️ Ягон намоз интихоб нашудааст. Лутфан, ақаллан як намозро интихоб кунед.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        prayerList.forEach(prayer => {
            let prayerName;
            switch (prayer) {
                case 'fajr': prayerName = 'Fajr'; break;
                case 'dhuhr': prayerName = 'Dhuhr'; break;
                case 'asr': prayerName = 'Asr'; break;
                case 'maghrib': prayerName = 'Maghrib'; break;
                case 'isha': prayerName = 'Isha'; break;
                default: return; // Skip if prayer name doesn't match
            }

            const time = timings[prayerName];
            if (!time) return;

            const [hourStr, minuteStr] = time.split(':');
            const hour = parseInt(hourStr, 10);
            const minute = parseInt(minuteStr, 10);

            if (isNaN(hour) || isNaN(minute)) {
                console.error(`Invalid time format for ${prayerName}: ${time}`);
                return;
            }

            // Schedule job 10 minutes before prayer
            let reminderMin = minute - 10;
            let reminderHour = hour;

            // Handle time rollover when minutes become negative
            if (reminderMin < 0) {
                reminderMin += 60;
                reminderHour = (reminderHour - 1 + 24) % 24;
            }

            // Create a descriptive name for the prayer in Tajik
            let prayerDisplayName;
            switch (prayer) {
                case 'fajr': prayerDisplayName = 'Фаҷр'; break;
                case 'dhuhr': prayerDisplayName = 'Зуҳр'; break;
                case 'asr': prayerDisplayName = 'Аср'; break;
                case 'maghrib': prayerDisplayName = 'Мағриб'; break;
                case 'isha': prayerDisplayName = 'Ишо'; break;
                default: prayerDisplayName = prayer;
            }

            // Format minutes with leading zero if needed
            const formattedMinute = minute < 10 ? `0${minute}` : minute;

            // Schedule the job
            try {
                const job = scheduleJob(`${reminderMin} ${reminderHour} * * *`, function () {
                    bot.sendMessage(
                        chatId,
                        `🔔 *Огоҳинома:* намози \`${prayerDisplayName}\` баъд аз 10 дақиқа шурӯъ мешавад (${hour}:${formattedMinute}).`,
                        { parse_mode: 'Markdown' }
                    );
                });

                notificationJobs.push({ job, prayerName: prayerDisplayName });
                userPreferences[chatId].jobs.push(job);
            } catch (err) {
                console.error(`Failed to schedule job for ${prayer}:`, err);
            }
        });

        // Only send success message if at least one job was scheduled
        if (notificationJobs.length > 0) {
            const prayerNames = notificationJobs.map(j => j.prayerName).join(', ');
            bot.sendMessage(
                chatId,
                `✅ Огоҳиномаҳо барои намозҳои зерин танзим шуданд: ${prayerNames}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            bot.sendMessage(
                chatId,
                `⚠️ Ягон огоҳинома танзим карда нашуд. Лутфан намозҳоро интихоб кунед.`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error("Error setting up notifications:", error);
        bot.sendMessage(
            chatId,
            `❌ Хатогӣ ҳангоми танзими огоҳиномаҳо. Лутфан, дубора кӯшиш кунед.`,
            { parse_mode: 'Markdown' }
        );
    }
};

// Function to format date according to Hijri calendar
const getHijriDate = async (date = new Date()) => {
    try {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        const url = `https://api.aladhan.com/v1/gToH?date=${day}-${month}-${year}`;
        const response = await axios.get(url);
        const data = response.data;

        if (data.code === 200) {
            return {
                day: data.data.hijri.day,
                month: data.data.hijri.month.en,
                monthAr: data.data.hijri.month.ar,
                year: data.data.hijri.year,
                format: `${data.data.hijri.day} ${data.data.hijri.month.en} ${data.data.hijri.year}`
            };
        } else {
            console.error("API Error:", data);
            return null;
        }
    } catch (error) {
        console.error("Error fetching Hijri date:", error);
        return null;
    }
};

// Welcome message
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'дӯст';

    // Reset user session
    userSessions[chatId] = {
        step: 'main',
        lastCity: '',
        lastCountry: ''
    };

    // Add user to the list
    allUsers.add(chatId);

    // Get Hijri date for welcome message
    const hijriDate = await getHijriDate();
    const hijriInfo = hijriDate ? `\n📅 Имрӯз: ${hijriDate.format} ҳиҷрӣ` : '';

    const welcomeMessage = `Ассалому алайкум, ${firstName}! 🕌${hijriInfo}\n\n` +
        `Ман бот барои дарёфти вақтҳои намоз ҳастам. Шумо метавонед вақтҳои намозро барои шаҳри дилхоҳ пайдо кунед.\n\n` +
        `Лутфан, аз меню истифода баред:`;

    bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard());
});

// Clear command to reset user data
bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;

    // Reset user session and preferences
    delete userSessions[chatId];

    // Cancel any scheduled notifications
    if (userPreferences[chatId]?.jobs) {
        userPreferences[chatId].jobs.forEach(job => job.cancel());
    }
    delete userPreferences[chatId];

    bot.sendMessage(
        chatId,
        "✅ Ҳамаи маълумот ва танзимоти шумо нест карда шуданд.",
        getMainMenuKeyboard()
    );
});

// Help command
bot.onText(/\/help|❓ Маълумот/, (msg) => {
    const chatId = msg.chat.id;

    const helpMessage = `*Роҳнамои истифода:*\n\n` +
        `🕌 *Вақти намоз* - Барои дарёфти вақтҳои намоз\n` +
        `🔔 *Огоҳинома* - Барои танзими огоҳиномаи намозҳо\n` +
        `📅 *Тақвими моҳи ҷорӣ* - Барои дарёфти тақвими моҳи ҷорӣ\n` +
        `🧭 *Самти қибла* - Барои ёфтани самти қибла\n` +
        `⚙️ *Танзимот* - Танзимоти бот\n\n` +
        `*Фармонҳои иловагӣ:*\n` +
        `/start - Оғози кори бот\n` +
        `/help - Дарёфти маълумот\n` +
        `/clear - Нест кардани танзимот\n\n` +
        `Бо саволу пешниҳодҳо ба @S_I_2009 муроҷиат кунед.`;

    bot.sendMessage(chatId, helpMessage, {
        parse_mode: 'Markdown'
    });
});

// Handle prayer times request
bot.onText(/🕌 Вақти намоз/, (msg) => {
    const chatId = msg.chat.id;

    // Check if user has saved location
    if (userSessions[chatId]?.lastCity && userSessions[chatId]?.lastCountry) {
        const city = userSessions[chatId].lastCity;
        const country = userSessions[chatId].lastCountry;

        bot.sendMessage(
            chatId,
            `Истифодаи шаҳри пештара: ${city}, ${country}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Истифода бурдан', callback_data: `use_${city}_${country}` }],
                        [{ text: '🔄 Интихоби шаҳри нав', callback_data: 'new_location' }]
                    ]
                }
            }
        );
    } else {
        userSessions[chatId] = {
            step: 'awaiting_location'
        };

        bot.sendMessage(
            chatId,
            'Лутфан, шаҳр ва кишварро интихоб кунед ё ворид намоед (масалан: "Душанбе, Тоҷикистон"):',
            getLocationKeyboard()
        );
    }
});

// Handle settings menu
bot.onText(/⚙️ Танзимот/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
        chatId,
        '⚙️ *Танзимот*\n\nДар ин қисмат шумо метавонед танзимоти ботро тағйир диҳед:',
        {
            parse_mode: 'Markdown',
            ...getSettingsKeyboard()
        }
    );
});

// Handle back to menu command
bot.onText(/↩️ Бозгашт ба меню/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
        chatId,
        'Ба менюи асосӣ баргаштем.',
        getMainMenuKeyboard()
    );
});

// Handle change city command
bot.onText(/🔄 Тағйири шаҳр/, (msg) => {
    const chatId = msg.chat.id;

    userSessions[chatId] = {
        step: 'awaiting_location'
    };

    bot.sendMessage(
        chatId,
        'Лутфан, шаҳр ва кишварро интихоб кунед ё ворид намоед:',
        getLocationKeyboard()
    );
});

// Handle change calculation method
bot.onText(/🌙 Тағйири методи ҳисобкунӣ/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
        chatId,
        '*Интихоби методи ҳисобкунии вақти намоз:*\n\nЛутфан, яке аз методҳои зеринро интихоб кунед:',
        {
            parse_mode: 'Markdown',
            ...getCalculationMethodKeyboard()
        }
    );
});

// Handle change language
bot.onText(/🔤 Тағйири забон/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(
        chatId,
        '*Интихоби забон:*\n\nЛутфан, забони дилхоҳро интихоб кунед:',
        {
            parse_mode: 'Markdown',
            ...getLanguageKeyboard()
        }
    );
});

// Handle notification settings
bot.onText(/⏰ Танзими огоҳиномаҳо|🔔 Огоҳинома/, (msg) => {
    const chatId = msg.chat.id;

    // Check if user has a location set
    if (!userSessions[chatId]?.lastCity) {
        userSessions[chatId] = {
            step: 'awaiting_location'
        };

        bot.sendMessage(
            chatId,
            'Барои танзими огоҳиномаҳо, аввал бояд шаҳри худро интихоб кунед.',
            getLocationKeyboard()
        );
        return;
    }

    const currentSettings = userPreferences[chatId]?.notifications || [];

    const keyboard = prayers.map(prayer => {
        const isSelected = currentSettings.includes(prayer.value);
        return [{
            text: `${isSelected ? '✅' : '❌'} ${prayer.name}`,
            callback_data: `notify_${prayer.value}_${isSelected ? 'off' : 'on'}`
        }];
    });

    keyboard.push([{ text: '💾 Сабт кардан', callback_data: 'save_notifications' }]);

    bot.sendMessage(
        chatId,
        '*Танзими огоҳиномаҳо:*\n\nЛутфан, намозҳоеро, ки мехоҳед огоҳинома гиред, интихоб кунед:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        }
    );
});

// Handle qibla direction
bot.onText(/🧭 Самти қибла/, async (msg) => {
    const chatId = msg.chat.id;

    // Check if user has a location set
    if (!userSessions[chatId]?.lastCity || !userSessions[chatId]?.lastCountry) {
        userSessions[chatId] = {
            step: 'awaiting_location'
        };

        bot.sendMessage(
            chatId,
            'Барои дарёфти самти қибла, аввал бояд шаҳри худро интихоб кунед.',
            getLocationKeyboard()
        );
        return;
    }

    const city = userSessions[chatId].lastCity;
    const country = userSessions[chatId].lastCountry;

    const loadingMsg = await bot.sendMessage(chatId, '⏳ Дарёфти самти қибла...');

    const qiblaData = await getQiblaDirection(city, country);

    // Delete loading message
    bot.deleteMessage(chatId, loadingMsg.message_id).catch(err => console.error("Could not delete message:", err));

    if (qiblaData) {
        const message = `*🧭 Самти қибла барои ${city}, ${country}*\n\n` +
            `*Самт:* \`${qiblaData.direction}°\`\n` +
            `*Координатаҳо:* \`${qiblaData.latitude}, ${qiblaData.longitude}\`\n\n` +
            `_Барои ёфтани самти дақиқ, шумо метавонед аз қомпас истифода баред ва ба самти ${Math.round(qiblaData.direction)}° нигоҳ кунед._`;

        // Create a compass image URL showing direction
        const compassUrl = `https://qiblafinder.withgoogle.com/intl/ru/finder/ar`;

        bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔗 Кушодани харита', url: compassUrl }]
                ]
            }
        });
    } else {
        bot.sendMessage(
            chatId,
            'Мутаассифона, иттилоот оид ба самти қибла дарёфт нашуд. Лутфан, шаҳри дигарро санҷед.'
        );
    }
});

// Handle calendar request
bot.onText(/📅 Тақвими моҳи ҷорӣ/, async (msg) => {
    const chatId = msg.chat.id;

    // If user has a last location saved, use it, otherwise default to Dushanbe
    const city = userSessions[chatId]?.lastCity || 'Душанбе';
    const country = userSessions[chatId]?.lastCountry || 'Тоҷикистон';

    // Get calculation method if set, default to 2
    const method = userPreferences[chatId]?.calculationMethod || 2;

    const loadingMsg = await bot.sendMessage(chatId, `⏳ Дархости тақвими моҳи ҷорӣ барои ${city}, ${country}...`);

    try {
        const date = new Date();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        const url = `https://api.aladhan.com/v1/calendarByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}&month=${month}&year=${year}`;
        const response = await axios.get(url);
        const data = response.data;

        // Delete loading message
        bot.deleteMessage(chatId, loadingMsg.message_id).catch(err => console.error("Could not delete message:", err));

        if (data.code === 200 && data.data && data.data.length > 0) {
            // Get Hijri month info
            const hijriMonth = data.data[0].date.hijri.month;
            let calendarMessage = `*📅 Тақвими намоз барои ${city}, ${country}*\n*${month}/${year} - ${hijriMonth.ar} ${data.data[0].date.hijri.year}*\n\n`;

            // Take all days from calendar
            const days = data.data;

            // Create separate messages for better viewing (1-10, 11-20, 21-30/31)
            const messagesParts = [];


            // Process calendar data - first 10 days
            const part1 = days.slice(0, 10);
            let part1Message = calendarMessage + "*Рӯзҳои 1-10:*\n\n";
            part1.forEach(day => {
                const gregorianDate = day.date.gregorian.day;
                const hijriDate = day.date.hijri.day;

                part1Message += `*${gregorianDate} (${hijriDate}):* ` +
                    `Фаҷр: \`${day.timings.Fajr.split(' ')[0]}\`, ` +
                    `Зуҳр: \`${day.timings.Dhuhr.split(' ')[0]}\`, ` +
                    `Аср: \`${day.timings.Asr.split(' ')[0]}\`, ` +
                    `Мағриб: \`${day.timings.Maghrib.split(' ')[0]}\`, ` +
                    `Ишо: \`${day.timings.Isha.split(' ')[0]}\`\n`;
            });
            messagesParts.push(part1Message);

            // Days 11-20
            if (days.length > 10) {
                const part2 = days.slice(10, 20);
                let part2Message = `*📅 ${month}/${year} - ${hijriMonth.ar} ${data.data[0].date.hijri.year}*\n*Рӯзҳои 11-20:*\n\n`;

                part2.forEach(day => {
                    const gregorianDate = day.date.gregorian.day;
                    const hijriDate = day.date.hijri.day;

                    part2Message += `*${gregorianDate} (${hijriDate}):* ` +
                        `Фаҷр: \`${day.timings.Fajr.split(' ')[0]}\`, ` +
                        `Зуҳр: \`${day.timings.Dhuhr.split(' ')[0]}\`, ` +
                        `Аср: \`${day.timings.Asr.split(' ')[0]}\`, ` +
                        `Мағриб: \`${day.timings.Maghrib.split(' ')[0]}\`, ` +
                        `Ишо: \`${day.timings.Isha.split(' ')[0]}\`\n`;
                });
                messagesParts.push(part2Message);
            }

            // Days 21-end
            if (days.length > 20) {
                const part3 = days.slice(20);
                let part3Message = `*📅 ${month}/${year} - ${hijriMonth.ar} ${data.data[0].date.hijri.year}*\n*Рӯзҳои 21-${days.length}:*\n\n`;

                part3.forEach(day => {
                    const gregorianDate = day.date.gregorian.day;
                    const hijriDate = day.date.hijri.day;

                    part3Message += `*${gregorianDate} (${hijriDate}):* ` +
                        `Фаҷр: \`${day.timings.Fajr.split(' ')[0]}\`, ` +
                        `Зуҳр: \`${day.timings.Dhuhr.split(' ')[0]}\`, ` +
                        `Аср: \`${day.timings.Asr.split(' ')[0]}\`, ` +
                        `Мағриб: \`${day.timings.Maghrib.split(' ')[0]}\`, ` +
                        `Ишо: \`${day.timings.Isha.split(' ')[0]}\`\n`;
                });
                messagesParts.push(part3Message);
            }

            // Send all message parts
            for (const message of messagesParts) {
                await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            }

        } else {
            bot.sendMessage(
                chatId,
                'Мутаассифона, тақвим барои ин моҳ дарёфт нашуд. Лутфан, дубора кӯшиш кунед.'
            );
        }
    } catch (error) {
        console.error("Error fetching calendar:", error);

        // Delete loading message
        bot.deleteMessage(chatId, loadingMsg.message_id).catch(err => console.error("Could not delete message:", err));

        bot.sendMessage(
            chatId,
            'Мутаассифона, ҳангоми дархости тақвим хатогӣ рух дод. Лутфан, дубора кӯшиш кунед.'
        );
    }
});

// Handle location messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    // Skip non-text messages and commands
    if (!text || text.startsWith('/') || text.match(/^[🕌🔔📅🧭⚙️❓↩️🔄🌙⏰🔤]/)) {
        return;
    }

    // Check if user is awaiting location input
    if (userSessions[chatId]?.step === 'awaiting_location') {
        // Look for city, country format
        const parts = text.split(',').map(part => part.trim());

        if (parts.length >= 2) {
            const city = parts[0];
            const country = parts[1];

            const loadingMsg = await bot.sendMessage(chatId, `⏳ Дархости вақтҳои намоз барои ${city}, ${country}...`);

            // Get calculation method if set, default to 2
            const method = userPreferences[chatId]?.calculationMethod || 2;

            const prayerData = await getPrayerTimes(city, country, method);

            // Delete loading message
            bot.deleteMessage(chatId, loadingMsg.message_id).catch(err => console.error("Could not delete message:", err));

            if (prayerData) {
                // Save the last used location
                userSessions[chatId] = {
                    step: 'main',
                    lastCity: city,
                    lastCountry: country
                };

                // Get next prayer info
                const nextPrayer = getNextPrayer(prayerData.timings);

                // Format and send the prayer times
                const formattedTimes = formatPrayerTimes(prayerData, city, country, nextPrayer);

                bot.sendMessage(chatId, formattedTimes, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔔 Танзими огоҳиномаҳо', callback_data: 'setup_notifications' }]
                        ]
                    }
                });
            } else {
                bot.sendMessage(
                    chatId,
                    'Мутаассифона, вақтҳои намоз барои ин шаҳр дарёфт нашуданд. Лутфан, шаҳри дигарро санҷед.',
                    getLocationKeyboard()
                );
            }
        } else {
            bot.sendMessage(
                chatId,
                'Лутфан, шаҳр ва кишварро дар формати "Шаҳр, Кишвар" ворид кунед. Масалан: "Душанбе, Тоҷикистон"',
                getLocationKeyboard()
            );
        }
    }
});

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // Acknowledge the callback
    bot.answerCallbackQuery(callbackQuery.id).catch(err => console.error("Error answering callback:", err));

    // Handle "use saved location"
    if (data.startsWith('use_')) {
        const [, city, country] = data.split('_');

        const loadingMsg = await bot.sendMessage(chatId, `⏳ Дархости вақтҳои намоз барои ${city}, ${country}...`);

        // Get calculation method if set, default to 2
        const method = userPreferences[chatId]?.calculationMethod || 2;

        const prayerData = await getPrayerTimes(city, country, method);

        // Delete loading message
        bot.deleteMessage(chatId, loadingMsg.message_id).catch(err => console.error("Could not delete message:", err));

        if (prayerData) {
            // Get next prayer info
            const nextPrayer = getNextPrayer(prayerData.timings);

            // Format and send the prayer times
            const formattedTimes = formatPrayerTimes(prayerData, city, country, nextPrayer);

            bot.sendMessage(chatId, formattedTimes, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔔 Танзими огоҳиномаҳо', callback_data: 'setup_notifications' }]
                    ]
                }
            });
        } else {
            bot.sendMessage(
                chatId,
                'Мутаассифона, вақтҳои намоз барои ин шаҳр дарёфт нашуданд. Лутфан, шаҳри дигарро санҷед.',
                getLocationKeyboard()
            );
        }
    }

    // Handle "new location"
    else if (data === 'new_location') {
        userSessions[chatId] = {
            step: 'awaiting_location'
        };

        bot.sendMessage(
            chatId,
            'Лутфан, шаҳр ва кишварро интихоб кунед ё ворид намоед:',
            getLocationKeyboard()
        );
    }

    // Handle calculation method selection
    else if (data.startsWith('method_')) {
        const methodId = parseInt(data.split('_')[1]);

        // Initialize user preferences if not exists
        if (!userPreferences[chatId]) {
            userPreferences[chatId] = {};
        }

        // Save selected calculation method
        userPreferences[chatId].calculationMethod = methodId;

        bot.sendMessage(
            chatId,
            `✅ Методи ҳисобкунӣ бо муваффақият тағйир дода шуд.`,
            getSettingsKeyboard()
        );
    }

    // Handle language selection
    else if (data.startsWith('lang_')) {
        const lang = data.split('_')[1];

        // Initialize user preferences if not exists
        if (!userPreferences[chatId]) {
            userPreferences[chatId] = {};
        }

        // Save selected language
        userPreferences[chatId].language = lang;

        let message;
        switch (lang) {
            case 'tj':
                message = '✅ Забони бот ба тоҷикӣ тағйир дода шуд.';
                break;
            case 'ru':
                message = '✅ Язык бота изменен на русский.';
                break;
            case 'uz':
                message = '✅ Bot tili o\'zbekchaga o\'zgartirildi.';
                break;
            case 'en':
                message = '✅ Bot language changed to English.';
                break;
            default:
                message = '✅ Забони бот ба тоҷикӣ тағйир дода шуд.';
        }

        bot.sendMessage(
            chatId,
            message,
            getSettingsKeyboard()
        );
    }

    // Handle notification toggles
    else if (data.startsWith('notify_')) {
        // Parse data to get prayer and action
        const [, prayer, action] = data.split('_');

        // Initialize user preferences if not exists
        if (!userPreferences[chatId]) {
            userPreferences[chatId] = {};
        }

        // Initialize notifications array if not exists
        if (!userPreferences[chatId].notifications) {
            userPreferences[chatId].notifications = [];
        }

        if (action === 'on') {
            // Add prayer to notifications if not already there
            if (!userPreferences[chatId].notifications.includes(prayer)) {
                userPreferences[chatId].notifications.push(prayer);
            }
        } else if (action === 'off') {
            // Remove prayer from notifications
            userPreferences[chatId].notifications = userPreferences[chatId].notifications.filter(p => p !== prayer);
        }

        // Recreate keyboard with updated selections
        const currentSettings = userPreferences[chatId].notifications;

        const keyboard = prayers.map(prayer => {
            const isSelected = currentSettings.includes(prayer.value);
            return [{
                text: `${isSelected ? '✅' : '❌'} ${prayer.name}`,
                callback_data: `notify_${prayer.value}_${isSelected ? 'off' : 'on'}`
            }];
        });

        keyboard.push([{ text: '💾 Сабт кардан', callback_data: 'save_notifications' }]);

        // Update message with new keyboard
        bot.editMessageReplyMarkup(
            { inline_keyboard: keyboard },
            {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id
            }
        ).catch(err => console.error("Error updating keyboard:", err));
    }

    // Handle save notifications
    else if (data === 'save_notifications') {
        // Initialize user preferences if not exists
        if (!userPreferences[chatId]) {
            userPreferences[chatId] = { notifications: [] };
        }

        // Get selected notifications
        const selectedNotifications = userPreferences[chatId].notifications || [];

        // Check if user has location set
        if (!userSessions[chatId]?.lastCity || !userSessions[chatId]?.lastCountry) {
            bot.sendMessage(
                chatId,
                'Барои танзими огоҳиномаҳо, аввал бояд шаҳри худро интихоб кунед.',
                getLocationKeyboard()
            );
            return;
        }

        // Setup notifications using the selected prayers
        await setupNotifications(
            chatId,
            userSessions[chatId].lastCity,
            userSessions[chatId].lastCountry,
            selectedNotifications
        );
    }

    // Handle setup notifications
    else if (data === 'setup_notifications') {
        bot.sendMessage(
            chatId,
            '*Танзими огоҳиномаҳо:*\n\nЛутфан, намозҳоеро, ки мехоҳед огоҳинома гиред, интихоб кунед:',
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: prayers.map(prayer => {
                        const isSelected = userPreferences[chatId]?.notifications?.includes(prayer.value) || false;
                        return [{
                            text: `${isSelected ? '✅' : '❌'} ${prayer.name}`,
                            callback_data: `notify_${prayer.value}_${isSelected ? 'off' : 'on'}`
                        }];
                    }).concat([[{ text: '💾 Сабт кардан', callback_data: 'save_notifications' }]])
                }
            }
        );
    }
});

// Admin command to send advertisements
bot.onText(/\/reklama/, (msg) => {
    const chatId = msg.chat.id;

    // Check if the user is an admin
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Шумо иҷозати ин амалро надоред.");
        return;
    }

    // Ask the admin for the advertisement text
    bot.sendMessage(chatId, "Лутфан, матни рекламаро ворид кунед:");
    userSessions[chatId] = { step: 'awaiting_advertisement' };
});

// Handle advertisement text input
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (userSessions[chatId]?.step === 'awaiting_advertisement') {
        // Send the advertisement to all users
        allUsers.forEach(userChatId => {
            bot.sendMessage(userChatId, `📢 Реклама:\n\n${text}`).catch(err => {
                console.error(`Failed to send message to ${userChatId}:`, err);
            });
        });

        // Notify the admin
        bot.sendMessage(chatId, "✅ Реклама ба ҳамаи корбарон фиристода шуд.");
        delete userSessions[chatId]; // Clear the session
    }
});

// Admin command to edit a command
bot.onText(/\/editcommand/, (msg) => {
    const chatId = msg.chat.id;

    // Check if the user is an admin
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Шумо иҷозати ин амалро надоред.");
        return;
    }

    // Ask the admin for the command to edit
    bot.sendMessage(chatId, "Лутфан, фармониро барои таҳрир ворид кунед (масалан: /start):");
    userSessions[chatId] = { step: 'awaiting_command_to_edit' };
});

// Handle command editing
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (userSessions[chatId]?.step === 'awaiting_command_to_edit') {
        // Ask for the new command text
        bot.sendMessage(chatId, "Лутфан, матни нави фармонро ворид кунед:");
        userSessions[chatId] = { step: 'awaiting_new_command_text', commandToEdit: text };
    } else if (userSessions[chatId]?.step === 'awaiting_new_command_text') {
        const commandToEdit = userSessions[chatId].commandToEdit;
        const newCommandText = text;

        // Update the command logic (you can store this in a database or a variable)
        // For example:
        bot.onText(new RegExp(commandToEdit), (msg) => {
            bot.sendMessage(msg.chat.id, newCommandText);
        });

        // Notify the admin
        bot.sendMessage(chatId, `✅ Фармони "${commandToEdit}" бо муваффақият таҳрир шуд.`);
        delete userSessions[chatId]; // Clear the session
    }
});

// Admin command to delete a command
bot.onText(/\/deletecommand/, (msg) => {
    const chatId = msg.chat.id;

    // Check if the user is an admin
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Шумо иҷозати ин амалро надоред.");
        return;
    }

    // Ask the admin for the command to delete
    bot.sendMessage(chatId, "Лутфан, фармониро барои ҳазф ворид кунед (масалан: /start):");
    userSessions[chatId] = { step: 'awaiting_command_to_delete' };
});

// Handle command deletion
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (userSessions[chatId]?.step === 'awaiting_command_to_delete') {
        const commandToDelete = text;

        // Remove the command logic (you can store this in a database or a variable)
        // For example:
        bot.removeTextListener(new RegExp(commandToDelete));

        // Notify the admin
        bot.sendMessage(chatId, `✅ Фармони "${commandToDelete}" бо муваффақият ҳазф шуд.`);
        delete userSessions[chatId]; // Clear the session
    }
});

// Start the bot
console.log('Bot is running...');