// bot.js - Полное соответствие ТЗ PR-агентства
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const port = process.env.PORT || 3001;

if (!token) {
  console.error('❌ Токен бота не найден');
  process.exit(1);
}

console.log('🚀 PR Media Bot запускается...');

// Создаем Express app и бота
const app = express();
const bot = new TelegramBot(token);

app.use(express.json());

// Импорт функций базы данных
const { 
  getCategories, 
  getCountries,
  searchSMIByName,
  getSMIByFilters,
  getDatabaseStats,
  formatNumber
} = require('./database');

// ========== НАСТРОЙКА WEBHOOK ==========

const webhookPath = `/webhook/${token}`;
const serviceName = process.env.RENDER_SERVICE_NAME || 'pr-media-bot';
const renderUrl = `https://${serviceName}.onrender.com`;
const webhookUrl = `${renderUrl}${webhookPath}`;

bot.setWebHook(webhookUrl)
  .then(() => console.log(`✅ Webhook установлен: ${webhookUrl}`))
  .catch(err => console.error('❌ Ошибка webhook:', err));

// Обработчик webhook
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check для Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'PR Media Bot',
    database: 'PostgreSQL',
    records: '105,764+ СМИ',
    timestamp: new Date().toISOString() 
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <h1>🤖 PR Media Bot</h1>
    <p>Каталог услуг PR-агентства</p>
    <p>База: 105,764+ СМИ</p>
    <p><a href="/health">Health Check</a></p>
  `);
});

// ========== СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЯ ==========

const userStates = {};

// Функции для работы с состояниями
function setUserState(chatId, section, step = 0, data = {}) {
  userStates[chatId] = { section, step, data };
}

function getUserState(chatId) {
  return userStates[chatId] || { section: null, step: 0, data: {} };
}

function clearUserState(chatId) {
  delete userStates[chatId];
}

// ========== КЛАВИАТУРЫ ПО ТЗ ==========

// Главное меню (ТЗ: уровень 1)
const getMainMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📰 СМИ'],
      ['🏆 Награды'],
      ['👨‍⚖️ Жюри'],
      ['🤝 Ассоциации'],
      ['📞 Связаться с менеджером']
    ],
    resize_keyboard: true
  }
});

// Кнопка "Назад"
const getBackButton = () => ({
  reply_markup: {
    keyboard: [['🔙 Назад']],
    resize_keyboard: true
  }
});

// Меню стран для СМИ (ТЗ: Шаг 1 - выбор страны)
function getCountriesMenu() {
  const countries = [
    '🇺🇸 США', '🇬🇧 Великобритания', '🇩🇪 Германия', '🇫🇷 Франция',
    '🇮🇹 Италия', '🇪🇸 Испания', '🇦🇪 ОАЭ', '🇰🇿 Казахстан'
  ];
  
  const rows = [];
  for (let i = 0; i < countries.length; i += 2) {
    rows.push(countries.slice(i, i + 2));
  }
  rows.push(['🔙 Назад']);
  
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true
    }
  };
}

// Меню категорий (ТЗ: Шаг 2 - выбор категории)
function getCategoriesMenu() {
  const categories = [
    '💻 IT', '💼 Бизнес', '🚀 Стартапы', '🔬 Технологии',
    '💰 Финансы', '₿ Крипто', '📢 Маркетинг', '🎯 PR',
    '🏥 Медицина', '💅 Красота', '👗 Мода', '🎨 Культура',
    '🖼️ Искусство', '🎵 Музыка', '🎬 Кино', '⚽ Спорт',
    '🎓 Образование', '🔭 Наука', '🏠 Недвижимость', '🌿 Lifestyle'
  ];
  
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(categories.slice(i, i + 2));
  }
  rows.push(['🔙 Назад']);
  
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true
    }
  };
}

// Меню посещаемости (ТЗ: Шаг 3 - выбор посещаемости)
const getVisitsMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📊 До 1 млн/мес'],
      ['📊 Более 1 млн/мес'],
      ['🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// Меню формата публикации (ТЗ: Шаг 4 - формат публикации)
const getFormatMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📅 Актуальной датой'],
      ['📅 Задним числом'],
      ['📅 Не имеет значения'],
      ['🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// ========== ОБРАБОТЧИКИ КОМАНД ==========

// Команда /start (ТЗ: Главное меню)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    
    const welcomeText = `
🤖 *Добро пожаловать в PR Media Bot!*

*Каталог услуг PR-агентства:*

📰 *СМИ* - подбор СМИ по стране, категории и посещаемости
🏆 *Награды* - участие в премиях и конкурсах  
👨‍⚖️ *Жюри* - участие в жюри мероприятий
🤝 *Ассоциации* - членство в профессиональных ассоциациях

📊 *База данных:*
• ${stats?.total_smi || '100K+'} СМИ
• ${stats?.countries_count || '175'} стран
• ${stats?.categories_count || '20'} категорий

👇 *Выберите раздел каталога:*
    `;
    
    bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
    
  } catch (error) {
    console.error('Ошибка приветствия:', error);
    bot.sendMessage(chatId, 
      '🤖 Добро пожаловать в PR Media Bot!\n\nВыберите раздел каталога:',
      getMainMenu()
    );
  }
});

// ========== РАЗДЕЛ "СМИ" (полная логика по ТЗ) ==========

// Шаг 1: Выбор раздела СМИ
bot.onText(/📰 СМИ/, (msg) => {
  const chatId = msg.chat.id;
  setUserState(chatId, 'smi', 1);
  
  bot.sendMessage(chatId,
    '🌍 *ШАГ 1: Выберите страну* (обязательный параметр для СМИ):\n\n' +
    'Выберите страну из списка или введите название страны:',
    {
      parse_mode: 'Markdown',
      ...getCountriesMenu()
    }
  );
});

// Шаг 2: Обработка выбора страны
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = getUserState(chatId);
  
  if (!text || text.startsWith('/')) return;
  
  // Обработка кнопки "Назад"
  if (text === '🔙 Назад') {
    handleBackButton(chatId, state);
    return;
  }
  
  // Обработка "Связаться с менеджером"
  if (text === '📞 Связаться с менеджером') {
    bot.sendMessage(chatId,
      '📞 *Связь с менеджером*\n\n' +
      'Для консультации или оформления заявки:\n' +
      '📧 Email: manager@pr-agency.com\n' +
      '📱 Телефон: +7 (XXX) XXX-XX-XX\n' +
      '👤 Telegram: @pr_manager\n\n' +
      '_Менеджер свяжется с вами в течение рабочего дня_',
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
    clearUserState(chatId);
    return;
  }
  
  // Логика раздела СМИ по ТЗ
  if (state.section === 'smi') {
    switch(state.step) {
      case 1: // Выбор страны
        const country = text.replace(/🇺🇸|🇬🇧|🇩🇪|🇫🇷|🇮🇹|🇪🇸|🇦🇪|🇰🇿/g, '').trim();
        setUserState(chatId, 'smi', 2, { ...state.data, country });
        
        bot.sendMessage(chatId,
          `✅ Страна: ${country}\n\n` +
          '📂 *ШАГ 2: Выберите категорию СМИ* (направление деятельности):',
          {
            parse_mode: 'Markdown',
            ...getCategoriesMenu()
          }
        );
        break;
        
      case 2: // Выбор категории
        const category = text.replace(/💻|💼|🚀|🔬|💰|₿|📢|🎯|🏥|💅|👗|🎨|🖼️|🎵|🎬|⚽|🎓|🔭|🏠|🌿/g, '').trim();
        setUserState(chatId, 'smi', 3, { ...state.data, category });
        
        bot.sendMessage(chatId,
          `✅ Категория: ${category}\n\n` +
          '📊 *ШАГ 3: Выберите уровень посещаемости СМИ:*',
          {
            parse_mode: 'Markdown',
            ...getVisitsMenu()
          }
        );
        break;
        
      case 3: // Выбор посещаемости
        let minVisits = null;
        let maxVisits = null;
        
        if (text.includes('До 1 млн')) {
          maxVisits = 1000000;
        } else if (text.includes('Более 1 млн')) {
          minVisits = 1000000;
        }
        
        setUserState(chatId, 'smi', 4, { 
          ...state.data, 
          minVisits, 
          maxVisits 
        });
        
        bot.sendMessage(chatId,
          `✅ Посещаемость: ${text}\n\n` +
          '📅 *ШАГ 4: Выберите формат публикации:*',
          {
            parse_mode: 'Markdown',
            ...getFormatMenu()
          }
        );
        break;
        
      case 4: // Выбор формата публикации
        let canBackdate = null;
        if (text.includes('Актуальной')) canBackdate = false;
        if (text.includes('Задним')) canBackdate = true;
        // "Не имеет значения" оставляет null
        
        const finalFilters = {
          ...state.data,
          canBackdate
        };
        
        // Поиск СМИ по фильтрам
        await searchAndShowSMI(chatId, finalFilters);
        clearUserState(chatId);
        break;
    }
  }
  
  // Разделы Награды, Жюри, Ассоциации (упрощенные по ТЗ)
  else if (['🏆 Награды', '👨‍⚖️ Жюри', '🤝 Ассоциации'].includes(text)) {
    const sectionMap = {
      '🏆 Награды': 'awards',
      '👨‍⚖️ Жюри': 'jury', 
      '🤝 Ассоциации': 'associations'
    };
    
    const sectionName = sectionMap[text];
    setUserState(chatId, sectionName, 1);
    
    const messages = {
      'awards': '🏆 *РАЗДЕЛ "НАГРАДЫ"*\n\nВыберите категорию деятельности:',
      'jury': '👨‍⚖️ *РАЗДЕЛ "ЖЮРИ"*\n\nВыберите категорию деятельности:',
      'associations': '🤝 *РАЗДЕЛ "АССОЦИАЦИИ"*\n\nВыберите категорию деятельности:'
    };
    
    bot.sendMessage(chatId, messages[sectionName], {
      parse_mode: 'Markdown',
      ...getCategoriesMenu()
    });
  }
});

// Функция поиска и отображения СМИ
async function searchAndShowSMI(chatId, filters) {
  try {
    bot.sendMessage(chatId, '🔍 Ищу СМИ по вашим параметрам...', getBackButton());
    
    const results = await getSMIByFilters(filters);
    
    if (results.length === 0) {
      return bot.sendMessage(chatId,
        '❌ *По выбранным параметрам СМИ не найдено.*\n\n' +
        'Попробуйте изменить условия поиска:',
        {
          parse_mode: 'Markdown',
          ...getMainMenu()
        }
      );
    }
    
    // Лимит 10 результатов
    const displayResults = results.slice(0, 10);
    
    let response = `✅ *Найдено СМИ: ${results.length}*\n\n`;
    
    displayResults.forEach((smi, index) => {
      const visits = smi.visits_per_month ? 
        `👁 ${formatNumber(smi.visits_per_month)}/мес` : 
        '👁 нет данных';
      const backdate = smi.can_backdate ? '📅 Да' : '📅 Нет';
      
      response += `*${index + 1}. ${smi.name}*\n`;
      response += `   🌍 ${smi.country}\n`;
      response += `   📂 ${smi.category}\n`;
      response += `   ${visits}\n`;
      response += `   Задним числом: ${backdate}\n`;
      
      if (smi.website) {
        response += `   🔗 [Сайт](${smi.website})\n`;
      }
      
      response += `\n`;
    });
    
    if (results.length > 10) {
      response += `\n_Показано 10 из ${results.length} результатов_\n`;
    }
    
    response += `\n📞 *Для заказа услуги свяжитесь с менеджером*`;
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...getMainMenu()
    });
    
  } catch (error) {
    console.error('Ошибка поиска СМИ:', error);
    bot.sendMessage(chatId,
      '❌ *Ошибка при поиске СМИ*\n\nПопробуйте позже или свяжитесь с менеджером.',
      {
        parse_mode: 'Markdown',
        ...getMainMenu()
      }
    );
  }
}

// Обработка кнопки "Назад"
function handleBackButton(chatId, state) {
  if (state.section === 'smi') {
    switch(state.step) {
      case 4:
        setUserState(chatId, 'smi', 3);
        bot.sendMessage(chatId, '📊 Выберите уровень посещаемости:', getVisitsMenu());
        break;
      case 3:
        setUserState(chatId, 'smi', 2);
        bot.sendMessage(chatId, '📂 Выберите категорию:', getCategoriesMenu());
        break;
      case 2:
        setUserState(chatId, 'smi', 1);
        bot.sendMessage(chatId, '🌍 Выберите страну:', getCountriesMenu());
        break;
      default:
        clearUserState(chatId);
        bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
    }
  } else {
    clearUserState(chatId);
    bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
  }
}

// ========== ЗАПУСК СЕРВЕРА ==========

app.listen(port, () => {
  console.log(`✅ Сервер запущен на порту ${port}`);
  console.log(`🤖 PR Media Bot готов к работе!`);
  console.log(`📊 База: 105,764+ записей СМИ`);
  console.log(`🌐 Webhook: ${webhookUrl}`);
  console.log(`🏥 Health check: ${renderUrl}/health`);
});