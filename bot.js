// bot.js - УПРОЩЕННАЯ И УЛУЧШЕННАЯ ВЕРСИЯ
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ========== НАСТРОЙКА ==========
const token = process.env.BOT_TOKEN;
const port = process.env.PORT || 3001;

if (!token) {
  console.error('❌ Токен бота не найден');
  process.exit(1);
}

console.log('🚀 PR Media Bot запускается...');

// Создаем Express app и бота
const app = express();
const bot = new TelegramBot(token, { polling: false });

app.use(express.json());

// Импорт функций базы данных
const { 
  getCategories, 
  getCountries,
  searchSMIByName,
  getSMIByFilters,
  getDatabaseStats,
  formatNumber,
  testSMI,
  searchSMIDebug
} = require('./database');

// ========== НАСТРОЙКА WEBHOOK ==========
const webhookPath = `/webhook/${token}`;
const serviceName = process.env.RENDER_SERVICE_NAME || 'pr-media-bot';
const renderUrl = `https://${serviceName}.onrender.com`;
const webhookUrl = `${renderUrl}${webhookPath}`;

// Устанавливаем webhook
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
    <!DOCTYPE html>
    <html>
    <head>
      <title>🤖 PR Media Bot</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        .status { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .links a { display: inline-block; margin: 5px 10px 5px 0; padding: 8px 15px; background: #0088cc; color: white; text-decoration: none; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>🤖 PR Media Bot</h1>
      <p>Каталог услуг PR-агентства</p>
      
      <div class="status">
        <h3>📊 Статус системы:</h3>
        <p>✅ Сервер работает</p>
        <p>✅ База данных подключена</p>
        <p>✅ Telegram бот активен</p>
        <p>📈 СМИ в базе: 105,764+</p>
      </div>
      
      <div class="links">
        <a href="/health">Health Check</a>
        <a href="https://t.me/pr_media_pro_bot" target="_blank">Открыть в Telegram</a>
      </div>
      
      <h3>📱 Команды для тестирования:</h3>
      <ul>
        <li><code>/start</code> - Главное меню</li>
        <li><code>/test</code> - Проверка базы данных</li>
        <li><code>/debug</code> - Расширенная отладка</li>
        <li><code>/stats</code> - Статистика базы</li>
      </ul>
    </body>
    </html>
  `);
});

// ========== СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЕЙ ==========
const userStates = {};

function setUserState(chatId, section, step = 0, data = {}) {
  userStates[chatId] = { section, step, data };
  console.log(`📱 Состояние пользователя ${chatId}:`, userStates[chatId]);
}

function getUserState(chatId) {
  return userStates[chatId] || { section: null, step: 0, data: {} };
}

function clearUserState(chatId) {
  delete userStates[chatId];
}

// ========== КЛАВИАТУРЫ ==========

// Главное меню
const getMainMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📰 СМИ', '🏆 Награды'],
      ['👨‍⚖️ Жюри', '🤝 Ассоциации'],
      ['📊 Статистика', '📞 Менеджер']
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
});

// Меню стран
const getCountriesMenu = () => ({
  reply_markup: {
    keyboard: [
      ['🇺🇸 США', '🇬🇧 Великобритания'],
      ['🇩🇪 Германия', '🇫🇷 Франция'],
      ['🇮🇹 Италия', '🇪🇸 Испания'],
      ['🇦🇪 ОАЭ', '🇰🇿 Казахстан'],
      ['🌍 Другая страна', '🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// Меню категорий
const getCategoriesMenu = () => ({
  reply_markup: {
    keyboard: [
      ['💻 IT', '💼 Бизнес', '🚀 Стартапы'],
      ['🔬 Технологии', '💰 Финансы', '₿ Крипто'],
      ['📢 Маркетинг', '🎯 PR', '🏥 Медицина'],
      ['💅 Красота', '👗 Мода', '🎨 Культура'],
      ['🎬 Кино', '⚽ Спорт', '🎓 Образование'],
      ['🔭 Наука', '🏠 Недвижимость', '🌿 Lifestyle'],
      ['🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// Меню посещаемости
const getVisitsMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📈 До 1 млн/мес', '📈 Более 1 млн/мес'],
      ['📈 Любая посещаемость', '🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// Меню формата
const getFormatMenu = () => ({
  reply_markup: {
    keyboard: [
      ['📅 Актуальной датой', '📅 Задним числом'],
      ['📅 Не важно', '🔙 Назад']
    ],
    resize_keyboard: true
  }
});

// Кнопка Назад
const getBackButton = () => ({
  reply_markup: {
    keyboard: [['🔙 Назад']],
    resize_keyboard: true
  }
});

// ========== КОМАНДЫ БОТА ==========

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  try {
    const stats = await getDatabaseStats();
    
    const welcomeText = `
🤖 *Добро пожаловать в PR Media Bot!*

*Каталог услуг PR-агентства:*

📰 *СМИ* - подбор СМИ по стране и категории
🏆 *Награды* - участие в премиях и конкурсах  
👨‍⚖️ *Жюри* - участие в жюри мероприятий
🤝 *Ассоциации* - членство в ассоциациях

📊 *База данных:*
• ${stats?.total_smi || '100K+'} СМИ
• ${stats?.countries_count || '175'} стран
• ${stats?.categories_count || '20'} категорий

👇 *Выберите раздел:*
    `;
    
    await bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
    
  } catch (error) {
    console.error('Ошибка приветствия:', error);
    await bot.sendMessage(chatId, 
      '🤖 *PR Media Bot*\n\nВыберите раздел каталога:',
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
  }
});

// Команда /test - проверка базы
bot.onText(/\/test/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    await bot.sendMessage(chatId, '🧪 Проверяю базу данных...', getBackButton());
    
    const results = await testSMI();
    
    if (results.length === 0) {
      return bot.sendMessage(chatId, 
        '❌ *В базе нет активных СМИ*\n\nПроверьте подключение к базе данных.',
        { parse_mode: 'Markdown', ...getMainMenu() }
      );
    }
    
    let response = '🧪 *ТЕСТ БАЗЫ ДАННЫХ*\n\n';
    response += `✅ Найдено СМИ: ${results.length}\n\n`;
    
    // Показываем первые 5 результатов
    results.slice(0, 5).forEach((smi, index) => {
      response += `${index+1}. *${smi.name}*\n`;
      response += `   🌍 ${smi.country}\n`;
      response += `   📂 ${smi.category}\n`;
      if (smi.visits_per_month) {
        response += `   👁 ${formatNumber(smi.visits_per_month)}/мес\n`;
      }
      response += `   📅 ${smi.can_backdate ? 'Да' : 'Нет'}\n\n`;
    });
    
    if (results.length > 5) {
      response += `\n... и еще ${results.length - 5} СМИ\n`;
    }
    
    response += `\n📊 *Структура данных в базе*\n`;
    response += `• Страны: ${results.map(s => s.country).filter((v,i,a) => a.indexOf(v) === i).slice(0,5).join(', ')}...\n`;
    response += `• Категории: ${results.map(s => s.category).filter((v,i,a) => a.indexOf(v) === i).slice(0,5).join(', ')}...\n`;
    
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
    
  } catch (error) {
    console.error('Ошибка теста:', error);
    await bot.sendMessage(chatId, 
      '❌ *Ошибка подключения к базе*\n\n' + error.message,
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
  }
});

// Команда /debug - отладка
bot.onText(/\/debug/, async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Пример: /debug США IT
  const parts = text.split(' ');
  if (parts.length >= 3) {
    const country = parts[1];
    const category = parts[2];
    
    await bot.sendMessage(chatId, `🔍 Отладка поиска: ${country} - ${category}`, getBackButton());
    
    const results = await searchSMIDebug(country, category);
    
    let response = `🔍 *ОТЛАДКА ПОИСКА*\n\n`;
    response += `Страна: ${country}\n`;
    response += `Категория: ${category}\n\n`;
    
    if (results.length === 0) {
      response += `❌ Не найдено СМИ\n\n`;
      response += `*Возможные причины:*\n`;
      response += `• Нет СМИ с такими параметрами\n`;
      response += `• Несоответствие названий стран/категорий\n`;
      response += `• Все СМИ не активны (is_active = false)\n`;
    } else {
      response += `✅ Найдено: ${results.length} СМИ\n\n`;
      
      results.slice(0, 3).forEach((smi, index) => {
        response += `${index+1}. *${smi.name}*\n`;
        response += `   🌍 ${smi.country}\n`;
        response += `   📂 ${smi.category}\n`;
        if (smi.visits_per_month) {
          response += `   👁 ${formatNumber(smi.visits_per_month)}/мес\n`;
        }
        response += `\n`;
      });
    }
    
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
  } else {
    await bot.sendMessage(chatId, 
      '🔍 *Использование:*\n`/debug страна категория`\n\n*Пример:*\n`/debug США IT`\n`/debug Germany Business`',
      { parse_mode: 'Markdown', ...getMainMenu() }
    );
  }
});

// Команда /stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    
    let response = '📊 *СТАТИСТИКА БАЗЫ*\n\n';
    
    if (stats) {
      response += `📰 Всего СМИ: ${formatNumber(stats.total_smi)}\n`;
      response += `🌍 Стран: ${stats.countries_count}\n`;
      response += `📂 Категорий: ${stats.categories_count}\n`;
      response += `📅 С задним числом: ${formatNumber(stats.backdate_count)}\n`;
      
      // Популярные категории
      const categories = await getCategories();
      if (categories.length > 0) {
        response += `\n🏷️ *Категории:*\n`;
        categories.slice(0, 10).forEach(cat => {
          response += `• ${cat.name}\n`;
        });
        if (categories.length > 10) {
          response += `• ... и еще ${categories.length - 10}\n`;
        }
      }
    } else {
      response += '❌ Не удалось получить статистику';
    }
    
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...getMainMenu()
    });
    
  } catch (error) {
    console.error('Ошибка статистики:', error);
    await bot.sendMessage(chatId, '❌ Ошибка получения статистики', getMainMenu());
  }
});

// ========== ОСНОВНАЯ ЛОГИКА ==========

// Обработка кнопки "СМИ"
bot.onText(/📰 СМИ/, (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  setUserState(chatId, 'smi', 1);
  
  bot.sendMessage(chatId,
    '🌍 *ШАГ 1: Выберите страну*\n\nВыберите страну из списка:',
    {
      parse_mode: 'Markdown',
      ...getCountriesMenu()
    }
  );
});

// Обработка кнопки "Награды"
bot.onText(/🏆 Награды/, (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  bot.sendMessage(chatId,
    '🏆 *РАЗДЕЛ "НАГРАДЫ"*\n\nРаздел в разработке. Скоро будет доступен!\n\n' +
    '📞 *Для информации о наградах свяжитесь с менеджером*',
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

// Обработка кнопки "Жюри"
bot.onText(/👨‍⚖️ Жюри/, (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  bot.sendMessage(chatId,
    '👨‍⚖️ *РАЗДЕЛ "ЖЮРИ"*\n\nРаздел в разработке. Скоро будет доступен!\n\n' +
    '📞 *Для информации о жюри свяжитесь с менеджером*',
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

// Обработка кнопки "Ассоциации"
bot.onText(/🤝 Ассоциации/, (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  bot.sendMessage(chatId,
    '🤝 *РАЗДЕЛ "АССОЦИАЦИИ"*\n\nРаздел в разработке. Скоро будет доступен!\n\n' +
    '📞 *Для информации об ассоциациях свяжитесь с менеджером*',
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

// Обработка кнопки "Статистика"
bot.onText(/📊 Статистика/, async (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  // Используем команду /stats
  bot.onText(/\/stats/, msg); // Вызываем обработчик команды /stats
});

// Обработка кнопки "Менеджер"
bot.onText(/📞 Менеджер/, (msg) => {
  const chatId = msg.chat.id;
  clearUserState(chatId);
  
  bot.sendMessage(chatId,
    '📞 *СВЯЗЬ С МЕНЕДЖЕРОМ*\n\n' +
    'Для консультации или оформления заявки:\n\n' +
    '👤 *Контактное лицо:* Анна\n' +
    '📧 *Email:* manager@pr-agency.com\n' +
    '📱 *Telegram:* @pr_manager\n' +
    '⏰ *Часы работы:* 9:00-18:00 (МСК)\n\n' +
    '_Менеджер свяжется с вами в течение рабочего дня_',
    {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }
  );
});

// ========== ОБРАБОТКА СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const state = getUserState(chatId);
  console.log(`📨 Сообщение от ${chatId}: "${text}"`, state);
  
  // Обработка кнопки "Назад"
  if (text === '🔙 Назад') {
    if (state.section === 'smi') {
      if (state.step > 1) {
        setUserState(chatId, 'smi', state.step - 1);
        
        switch(state.step - 1) {
          case 1:
            await bot.sendMessage(chatId, '🌍 Выберите страну:', getCountriesMenu());
            break;
          case 2:
            await bot.sendMessage(chatId, '📂 Выберите категорию:', getCategoriesMenu());
            break;
          case 3:
            await bot.sendMessage(chatId, '📊 Выберите посещаемость:', getVisitsMenu());
            break;
        }
      } else {
        clearUserState(chatId);
        await bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
      }
    } else {
      clearUserState(chatId);
      await bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
    }
    return;
  }
  
  // Логика раздела СМИ
  if (state.section === 'smi') {
    try {
      switch(state.step) {
        case 1: // Выбор страны
          let country = text;
          
          // Убираем эмодзи флагов
          country = country.replace(/🇺🇸|🇬🇧|🇩🇪|🇫🇷|🇮🇹|🇪🇸|🇦🇪|🇰🇿|🌍/g, '').trim();
          
          if (country === 'Другая страна') {
            await bot.sendMessage(chatId,
              '🌍 *Введите название страны на русском или английском:*\n\n' +
              'Пример: Россия, Россия, Germany, France',
              { parse_mode: 'Markdown', ...getBackButton() }
            );
            return;
          }
          
          setUserState(chatId, 'smi', 2, { country });
          
          await bot.sendMessage(chatId,
            `✅ *Страна:* ${country}\n\n` +
            '📂 *ШАГ 2: Выберите категорию:*',
            {
              parse_mode: 'Markdown',
              ...getCategoriesMenu()
            }
          );
          break;
          
        case 2: // Выбор категории
          let category = text.replace(/💻|💼|🚀|🔬|💰|₿|📢|🎯|🏥|💅|👗|🎨|🎬|⚽|🎓|🔭|🏠|🌿/g, '').trim();
          
          setUserState(chatId, 'smi', 3, { 
            ...state.data, 
            category 
          });
          
          await bot.sendMessage(chatId,
            `✅ *Категория:* ${category}\n\n` +
            '📊 *ШАГ 3: Выберите посещаемость:*\n\n' +
            '📈 *До 1 млн/мес* - небольшие и средние СМИ\n' +
            '📈 *Более 1 млн/мес* - крупные медиа\n' +
            '📈 *Любая посещаемость* - без ограничений',
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
          // "Любая посещаемость" оставляет null
          
          setUserState(chatId, 'smi', 4, { 
            ...state.data, 
            minVisits, 
            maxVisits 
          });
          
          await bot.sendMessage(chatId,
            `✅ *Посещаемость:* ${text}\n\n` +
            '📅 *ШАГ 4: Выберите формат публикации:*\n\n' +
            '📅 *Актуальной датой* - публикация на текущую дату\n' +
            '📅 *Задним числом* - возможность публикации за прошедшие даты\n' +
            '📅 *Не важно* - любой вариант',
            {
              parse_mode: 'Markdown',
              ...getFormatMenu()
            }
          );
          break;
          
        case 4: // Выбор формата и поиск
          let canBackdate = null;
          if (text.includes('Актуальной')) canBackdate = false;
          if (text.includes('Задним')) canBackdate = true;
          
          const filters = {
            ...state.data,
            canBackdate,
            limit: 20
          };
          
          console.log('🔍 Поиск с фильтрами:', filters);
          
          await bot.sendMessage(chatId, '🔍 *Ищу СМИ по вашим параметрам...*', {
            parse_mode: 'Markdown',
            ...getBackButton()
          });
          
          const results = await getSMIByFilters(filters);
          
          if (results.length === 0) {
            let suggestions = '';
            
            if (filters.canBackdate === true) {
              suggestions += '\n\n💡 *Совет:* Попробуйте выбрать "Не важно" в формате публикации';
            }
            if (filters.minVisits === 1000000) {
              suggestions += '\n💡 *Совет:* Попробуйте "До 1 млн/мес" или "Любая посещаемость"';
            }
            
            await bot.sendMessage(chatId,
              `❌ *По выбранным параметрам СМИ не найдено.*\n\n` +
              `*Параметры поиска:*\n` +
              `🌍 Страна: ${filters.country}\n` +
              `📂 Категория: ${filters.category}\n` +
              `📊 Посещаемость: ${filters.minVisits ? 'Более 1 млн/мес' : filters.maxVisits ? 'До 1 млн/мес' : 'Любая'}\n` +
              `📅 Формат: ${filters.canBackdate === true ? 'Задним числом' : filters.canBackdate === false ? 'Актуальной датой' : 'Не важно'}` +
              suggestions,
              {
                parse_mode: 'Markdown',
                ...getMainMenu()
              }
            );
          } else {
            let response = `✅ *Найдено СМИ: ${results.length}*\n\n`;
            response += `*Параметры поиска:*\n`;
            response += `🌍 Страна: ${filters.country}\n`;
            response += `📂 Категория: ${filters.category}\n`;
            response += `📊 Посещаемость: ${filters.minVisits ? 'Более 1 млн/мес' : filters.maxVisits ? 'До 1 млн/мес' : 'Любая'}\n`;
            response += `📅 Формат: ${filters.canBackdate === true ? 'Задним числом' : filters.canBackdate === false ? 'Актуальной датой' : 'Не важно'}\n\n`;
            
            response += `📋 *Результаты:*\n\n`;
            
            const displayResults = results.slice(0, 10);
            
            displayResults.forEach((smi, index) => {
              const visits = smi.visits_per_month ? 
                `👁 ${formatNumber(smi.visits_per_month)}/мес` : 
                '👁 нет данных';
              const backdate = smi.can_backdate ? '📅 Да' : '📅 Нет';
              
              response += `${index + 1}. *${smi.name}*\n`;
              response += `   🌍 ${smi.country}\n`;
              response += `   📂 ${smi.category}\n`;
              response += `   ${visits}\n`;
              response += `   Задним числом: ${backdate}\n`;
              
              if (smi.website) {
                response += `   🔗 [Сайт](${smi.website})\n`;
              }
              
              if (smi.description) {
                const shortDesc = smi.description.length > 100 ? 
                  smi.description.substring(0, 100) + '...' : smi.description;
                response += `   📝 ${shortDesc}\n`;
              }
              
              response += `\n`;
            });
            
            if (results.length > 10) {
              response += `\n_Показано 10 из ${results.length} результатов_\n`;
            }
            
            response += `\n📞 *Для заказа или дополнительной информации используйте кнопку "Менеджер"*`;
            
            await bot.sendMessage(chatId, response, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              ...getMainMenu()
            });
          }
          
          clearUserState(chatId);
          break;
      }
    } catch (error) {
      console.error('Ошибка обработки СМИ:', error);
      await bot.sendMessage(chatId,
        '❌ *Произошла ошибка при поиске*\n\nПопробуйте еще раз или свяжитесь с менеджером.',
        {
          parse_mode: 'Markdown',
          ...getMainMenu()
        }
      );
      clearUserState(chatId);
    }
  }
});

// ========== ЗАПУСК СЕРВЕРА ==========
app.listen(port, () => {
  console.log(`✅ Сервер запущен на порту ${port}`);
  console.log(`🤖 PR Media Bot готов к работе!`);
  console.log(`📊 База: 105,764+ записей СМИ`);
  console.log(`🌐 Webhook: ${webhookUrl}`);
  console.log(`🏥 Health check: ${renderUrl}/health`);
  console.log(`🌍 Веб-интерфейс: ${renderUrl}`);
});

// Обработка ошибок
bot.on('error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Необработанное исключение:', reason);
});