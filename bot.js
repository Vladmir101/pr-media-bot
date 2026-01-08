// bot.js - обновленный для новой структуры базы
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { 
  getCategories, 
  searchSMIByName,
  getCountryStats,
  getTopSMIByVisits,
  getCategoryStats,
  getCountries,
  getDatabaseStats,
  formatNumber
} = require('./database');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ Токен бота не найден. Проверьте .env файл');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Бот запущен с новой структурой базы!');

// Главное меню
const mainMenu = {
  reply_markup: {
    keyboard: [
      ['🔍 Поиск СМИ по названию'],
      ['🌍 Поиск по стране'],
      ['📂 Поиск по категории'],
      ['📊 Топ СМИ'],
      ['ℹ️ Статистика базы']
    ],
    resize_keyboard: true
  }
};

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    
    const welcomeText = `
🎯 *Добро пожаловать в MediaPro Bot v2.0!*

📊 *База данных обновлена:*
✅ ${stats?.total_smi || '100K+'} СМИ
✅ ${stats?.countries_count || '175'} стран
✅ ${stats?.categories_count || '20'} категорий
✅ ${stats?.backdate_count || '10K+'} с задним числом

📌 *Что умеет бот:*
🔍 Поиск СМИ по названию
🌍 Фильтр по стране и категории  
📊 Топ СМИ по посещаемости
📂 Поиск по 20 категориям
ℹ️ Подробная статистика

👇 *Выберите действие:*
    `;

    bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      ...mainMenu
    });
  } catch (error) {
    console.error('Ошибка приветствия:', error);
    bot.sendMessage(chatId, '🎯 Добро пожаловать в MediaPro Bot!', mainMenu);
  }
});

// Поиск СМИ по названию
bot.onText(/🔍 Поиск СМИ по названию/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Введите название СМИ для поиска (минимум 3 символа):', {
    reply_markup: { remove_keyboard: true }
  });
});

// Поиск по стране
bot.onText(/🌍 Поиск по стране/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const countries = await getCountries(15);
    
    if (countries.length === 0) {
      return bot.sendMessage(chatId, '❌ Не удалось загрузить список стран', mainMenu);
    }
    
    const keyboard = {
      reply_markup: {
        keyboard: [
          ...chunkArray(countries, 3).map(row => row.map(country => `🌍 ${country}`)),
          ['🔙 Назад']
        ],
        resize_keyboard: true
      }
    };
    
    bot.sendMessage(chatId, '🌍 Выберите страну:', keyboard);
    
  } catch (error) {
    console.error('Ошибка загрузки стран:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки стран', mainMenu);
  }
});

// Поиск по категории
bot.onText(/📂 Поиск по категории/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const categories = await getCategories();
    
    const keyboard = {
      reply_markup: {
        keyboard: [
          ...chunkArray(categories.map(cat => `${cat.name} (${cat.count})`), 2),
          ['🔙 Назад']
        ],
        resize_keyboard: true
      }
    };
    
    bot.sendMessage(chatId, '📂 Выберите категорию:', keyboard);
    
  } catch (error) {
    console.error('Ошибка загрузки категорий:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки категорий', mainMenu);
  }
});

// Топ СМИ
bot.onText(/📊 Топ СМИ/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const topSMI = await getTopSMIByVisits(10);
    
    if (topSMI.length === 0) {
      return bot.sendMessage(chatId, '❌ Нет данных о СМИ', mainMenu);
    }
    
    let response = '🏆 *ТОП-10 СМИ по посещаемости:*\n\n';
    
    topSMI.forEach((smi, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const visits = formatNumber(smi.visits_per_month);
      
      response += `${medal} *${smi.name}*\n`;
      response += `   🌍 ${smi.country} | 📂 ${smi.category}\n`;
      response += `   👁 ${visits}/мес`;
      response += smi.can_backdate ? ' | 📅 заднее число' : '';
      response += `\n\n`;
    });
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...mainMenu
    });
    
  } catch (error) {
    console.error('Ошибка загрузки топа:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки топа СМИ', mainMenu);
  }
});

// Статистика базы
bot.onText(/ℹ️ Статистика базы/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    const countryStats = await getCountryStats(10);
    const categoryStats = await getCategoryStats();
    
    let response = '📊 *СТАТИСТИКА БАЗЫ ДАННЫХ*\n\n';
    
    if (stats) {
      response += `📰 Всего СМИ: ${stats.total_smi}\n`;
      response += `🌍 Стран: ${stats.countries_count}\n`;
      response += `📂 Категорий: ${stats.categories_count}\n`;
      response += `📅 С задним числом: ${stats.backdate_count}\n`;
      response += `👁 Средняя посещаемость: ${formatNumber(stats.avg_visits)}/мес\n\n`;
    }
    
    response += '🌍 *Топ-10 стран:*\n';
    countryStats.forEach((stat, index) => {
      response += `${index + 1}. ${stat.country}: ${stat.count} СМИ\n`;
    });
    
    response += '\n📂 *Категории:*\n';
    categoryStats.forEach(stat => {
      if (stat.count > 0) {
        response += `• ${stat.name}: ${stat.count} СМИ\n`;
      }
    });
    
    bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      ...mainMenu
    });
    
  } catch (error) {
    console.error('Ошибка статистики:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки статистики', mainMenu);
  }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  // Обработка "Назад"
  if (text === '🔙 Назад') {
    return bot.sendMessage(chatId, 'Главное меню:', mainMenu);
  }
  
  // Поиск по названию
  if (text.length >= 3) {
    const searchText = text.replace('🌍 ', '').replace('📂 ', '');
    
    try {
      const results = await searchSMIByName(searchText, 10);
      
      if (results.length === 0) {
        return bot.sendMessage(chatId, `❌ По запросу "${searchText}" ничего не найдено.`, mainMenu);
      }
      
      let response = `🔍 *Найдено СМИ: ${results.length}*\n\n`;
      
      results.forEach((smi, index) => {
        const visits = smi.visits_per_month ? 
          `👁 ${formatNumber(smi.visits_per_month)}/мес` : 
          '👁 нет данных';
        const backdate = smi.can_backdate ? '📅 заднее число' : '';
        const leadTime = smi.lead_time_hours ? `⏱ ${smi.lead_time_hours}ч` : '';
        
        response += `${index + 1}. *${smi.name}*\n`;
        response += `   🌍 ${smi.country} | 📂 ${smi.category}\n`;
        response += `   ${visits} ${backdate} ${leadTime}\n`;
        
        if (smi.website) {
          response += `   🔗 ${smi.website}\n`;
        }
        
        response += `\n`;
      });
      
      if (results.length === 10) {
        response += `ℹ️ *Показано 10 из ${results.length}* результатов\n`;
      }
      
      bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        ...mainMenu
      });
      
    } catch (error) {
      console.error('Ошибка поиска:', error);
      bot.sendMessage(chatId, '❌ Ошибка поиска. Попробуйте позже.', mainMenu);
    }
  }
});

// Вспомогательная функция для разбиения массива
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Ошибка webhook:', error.message);
});

console.log('✅ Бот готов к работе!');
console.log('📊 База: 105,764+ записей СМИ');