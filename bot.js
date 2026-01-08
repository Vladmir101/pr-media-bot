// bot.js - Webhook режим для Render
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.BOT_TOKEN;
const port = process.env.PORT || 3001;

if (!token) {
  console.error('❌ Токен бота не найден');
  process.exit(1);
}

console.log('🚀 Запуск в Webhook режиме для Render...');

// Создаем Express app и бота
const app = express();
const bot = new TelegramBot(token);

app.use(express.json());

// Импорт функций базы
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

// ========== НАСТРОЙКА WEBHOOK ==========

const webhookPath = `/webhook/${token}`;

// Устанавливаем webhook
const serviceName = process.env.RENDER_SERVICE_NAME || 'pr-media-bot';
const renderUrl = `https://${serviceName}.onrender.com`;
const webhookUrl = `${renderUrl}${webhookPath}`;

bot.setWebHook(webhookUrl)
  .then(() => {
    console.log(`✅ Webhook установлен: ${webhookUrl}`);
  })
  .catch(err => {
    console.error('❌ Ошибка webhook:', err);
  });

// Обработчик webhook
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Health check для Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'pr-media-bot',
    database: 'postgresql',
    records: '105,764+',
    timestamp: new Date().toISOString() 
  });
});

// Главная страница
app.get('/', (req, res) => {
  res.send(`
    <h1>🤖 PR Media Bot</h1>
    <p>База: 105,764+ записей СМИ</p>
    <p>Режим: Webhook</p>
    <p><a href="/health">Health Check</a></p>
  `);
});

// ========== КОМАНДЫ БОТА ==========

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    
    const welcomeText = `
🎯 *Добро пожаловать в MediaPro Bot v2.0!*

📊 *База данных:*
✅ ${stats?.total_smi || '100K+'} СМИ
✅ ${stats?.countries_count || '175'} стран
✅ ${stats?.categories_count || '20'} категорий
✅ ${stats?.backdate_count || '10K+'} с задним числом

👇 *Выберите действие:*
    `;

    const mainMenu = {
      reply_markup: {
        keyboard: [
          ['🔍 Поиск СМИ'],
          ['🌍 Поиск по стране'],
          ['📊 Топ СМИ'],
          ['ℹ️ Статистика']
        ],
        resize_keyboard: true
      }
    };

    bot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      ...mainMenu
    });
  } catch (error) {
    console.error('Ошибка приветствия:', error);
    bot.sendMessage(chatId, '🎯 Добро пожаловать!', {
      reply_markup: {
        keyboard: [['🔍 Поиск СМИ'], ['📊 Топ СМИ']],
        resize_keyboard: true
      }
    });
  }
});

// Поиск СМИ
bot.onText(/🔍 Поиск СМИ/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Введите название СМИ для поиска:', {
    reply_markup: { remove_keyboard: true }
  });
});

// Поиск по стране
bot.onText(/🌍 Поиск по стране/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const countries = await getCountries(10);
    
    if (countries.length === 0) {
      return bot.sendMessage(chatId, '❌ Не удалось загрузить список стран');
    }
    
    let response = '🌍 *Выберите страну:*\n\n';
    countries.forEach((country, index) => {
      response += `${index + 1}. ${country}\n`;
    });
    
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка стран:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки стран');
  }
});

// Топ СМИ
bot.onText(/📊 Топ СМИ/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const topSMI = await getTopSMIByVisits(5);
    
    if (topSMI.length === 0) {
      return bot.sendMessage(chatId, '❌ Нет данных о СМИ');
    }
    
    let response = '🏆 *ТОП-5 СМИ:*\n\n';
    
    topSMI.forEach((smi, index) => {
      const visits = formatNumber(smi.visits_per_month);
      
      response += `${index + 1}. *${smi.name}*\n`;
      response += `   🌍 ${smi.country} | ${visits}/мес\n`;
      response += smi.can_backdate ? '   📅 заднее число\n' : '';
      response += `\n`;
    });
    
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка топа:', error);
    bot.sendMessage(chatId, '❌ Ошибка загрузки топа');
  }
});

// Статистика
bot.onText(/ℹ️ Статистика/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const stats = await getDatabaseStats();
    
    let response = '📊 *СТАТИСТИКА БАЗЫ:*\n\n';
    
    if (stats) {
      response += `📰 Всего СМИ: ${stats.total_smi}\n`;
      response += `🌍 Стран: ${stats.countries_count}\n`;
      response += `📂 Категорий: ${stats.categories_count}\n`;
      response += `📅 С задним числом: ${stats.backdate_count}\n`;
      response += `👁 Средняя посещаемость: ${formatNumber(stats.avg_visits)}/мес\n`;
    }
    
    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Ошибка статистики:', error);
    bot.sendMessage(chatId, '❌ Ошибка статистики');
  }
});

// Обработка поисковых запросов
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/') || 
      text === '🔍 Поиск СМИ' || 
      text === '🌍 Поиск по стране' || 
      text === '📊 Топ СМИ' || 
      text === 'ℹ️ Статистика') {
    return;
  }
  
  // Поиск по названию
  if (text.length >= 3) {
    try {
      const results = await searchSMIByName(text, 5);
      
      if (results.length === 0) {
        return bot.sendMessage(chatId, `❌ По запросу "${text}" ничего не найдено.`);
      }
      
      let response = `🔍 *Найдено СМИ: ${results.length}*\n\n`;
      
      results.forEach((smi, index) => {
        const visits = smi.visits_per_month ? 
          `👁 ${formatNumber(smi.visits_per_month)}/мес` : 
          '👁 нет данных';
        const backdate = smi.can_backdate ? '📅 заднее число' : '';
        
        response += `${index + 1}. *${smi.name}*\n`;
        response += `   🌍 ${smi.country} | 📂 ${smi.category}\n`;
        response += `   ${visits} ${backdate}\n\n`;
      });
      
      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Ошибка поиска:', error);
      bot.sendMessage(chatId, '❌ Ошибка поиска');
    }
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`✅ Сервер запущен на порту ${port}`);
  console.log(`🤖 Бот готов к работе!`);
  console.log(`📊 База: 105,764+ записей СМИ`);
  console.log(`🌐 Webhook: ${webhookUrl}`);
  console.log(`🏥 Health check: ${renderUrl}/health`);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Ошибка webhook:', error.message);
});