require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, importSMIFromCSV, searchSMILikeCSV, initDatabase, Op, fixSMITable } = require('./database');
const stateManager = require('./states');
const fs = require('fs');

class PRBot {
  constructor(useWebhook = false) {
    const options = {
      request: {
        timeout: 60000
      }
    };
    
    if (useWebhook) {
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме вебхука');
    } else {
      options.polling = true;
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме polling');
    }
    
    this.ADMIN_IDS = process.env.ADMIN_IDS ? 
      process.env.ADMIN_IDS.split(',') : 
      ['5970834739'];
    
    this.csvSearches = new Map(); // Хранит результаты поисков: chatId_searchId -> {results, filterName, createdAt}
    
    this.initHandlers();
    this.initCSVCommands();
  }
  
  startWebhook(webhookPath, port = process.env.PORT || 3000) {
    const webhookUrl = process.env.WEBHOOK_URL || `${process.env.REPLIT_URL || process.env.RAILWAY_URL || process.env.RENDER_URL || ''}${webhookPath}`;
    
    console.log(`🔗 Устанавливаю вебхук: ${webhookUrl}`);
    
    this.bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`✅ Вебхук установлен: ${webhookUrl}`);
      })
      .catch(err => {
        console.error('❌ Ошибка установки вебхука:', err);
      });
    
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });
    
    app.post(webhookPath, (req, res) => {
      this.bot.processUpdate(req.body);
      res.sendStatus(200);
    });
    
    app.listen(port, () => {
      console.log(`🚀 Сервер запущен на порту ${port}`);
      console.log(`🌐 Вебхук: ${webhookPath}`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
    });
    
    return app;
  }
  
  isAdmin(chatId) {
    return this.ADMIN_IDS.includes(chatId.toString());
  }
  
  // Получение эмодзи для категории
  getCategoryEmoji(category) {
    if (!category) return '📋';
    
    const emojiMap = {
      'business': '💼',
      'technology': '💻',
      'news': '📰',
      'financial': '💰',
      'music': '🎵',
      'movie': '🎬',
      'sport': '⚽',
      'health': '🏥',
      'education': '🎓',
      'travel': '✈️',
      'food': '🍕',
      'fashion': '👗',
      'automotive': '🚗',
      'real estate': '🏠',
      'entertainment': '🎭',
      'lifestyle': '🌟',
      'science': '🔬',
      'gaming': '🎮'
    };
    
    const categoryLower = category.toLowerCase();
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (categoryLower.includes(key)) {
        return emoji;
      }
    }
    
    return '📋';
  }
  
  // Получение флага для страны
  getCountryFlag(country) {
    if (!country) return '🌍';
    
    const flagMap = {
      'russia': '🇷🇺',
      'usa': '🇺🇸',
      'united states': '🇺🇸',
      'germany': '🇩🇪',
      'france': '🇫🇷',
      'uk': '🇬🇧',
      'united kingdom': '🇬🇧',
      'china': '🇨🇳',
      'japan': '🇯🇵',
      'korea': '🇰🇷',
      'india': '🇮🇳',
      'brazil': '🇧🇷',
      'canada': '🇨🇦',
      'australia': '🇦🇺',
      'italy': '🇮🇹',
      'spain': '🇪🇸'
    };
    
    const countryLower = country.toLowerCase();
    for (const [key, flag] of Object.entries(flagMap)) {
      if (countryLower.includes(key)) {
        return flag;
      }
    }
    
    return '🌍';
  }
  
  // Главное меню
  getMainMenu(isAdmin = false) {
    const menu = {
      reply_markup: {
        keyboard: [
          ['🔍 ПОИСК СМИ'],
          ['📞 КОНТАКТЫ']
        ],
        resize_keyboard: true
      }
    };
    
    if (isAdmin) {
      menu.reply_markup.keyboard.push(['⚙️ АДМИН']);
    }
    
    return menu;
  }
  
  // Меню поиска СМИ
  getSearchMenu() {
    return {
      reply_markup: {
        keyboard: [
          ['🔍 Бизнес-СМИ', '💻 IT-СМИ', '📰 Новостные'],
          ['🇷🇺 Российские', '🌍 Международные'],
          ['💰 До 100к', '💰 До 200к'],
          ['📊 Все СМИ', '🔙 Назад']
        ],
        resize_keyboard: true
      }
    };
  }
  
  initHandlers() {
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.registerUser(msg);
      stateManager.resetState(chatId);
      
      const welcomeMessage = `👋 *Добро пожаловать в MediaPro!*\n\n` +
        `Я помогу вам найти подходящие СМИ из базы данных.\n\n` +
        `*Доступные команды:*\n` +
        `/search - Начать поиск СМИ\n` +
        `/contacts - Контактная информация\n\n` +
        `Выберите действие:`;
      
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...this.getMainMenu(isAdmin)
      });
    });
    
    // Команда /search
    this.bot.onText(/\/search/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showSearchMenu(chatId);
    });
    
    // Команда /contacts
    this.bot.onText(/\/contacts/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showContacts(chatId);
    });
    
    // Команда /admin
    this.bot.onText(/\/admin/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (this.isAdmin(chatId)) {
        await this.showAdminMenu(chatId);
      } else {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
      }
    });
    
    // Обработка текстовых сообщений
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      if (text.startsWith('/')) return;
      
      const userState = stateManager.getState(chatId);
      
      // Проверка на админ-команды
      if (this.isAdmin(chatId) && text === '⚙️ АДМИН') {
        await this.showAdminMenu(chatId);
        return;
      }
      
      // Главное меню
      if (!userState.currentSection) {
        await this.handleMainMenu(chatId, text);
      } 
      // Раздел поиска
      else if (userState.currentSection === 'search') {
        await this.handleSearch(chatId, text, userState);
      }
    });
    
    // Обработка инлайн-кнопок
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      // Пагинация для поиска
      if (data.startsWith('page_')) {
        const [_, searchId, page] = data.split('_');
        await this.showResultsPage(chatId, searchId, parseInt(page));
      }
      // Главное меню
      else if (data === 'to_main') {
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, '🏠 *Главное меню*', {
          parse_mode: 'Markdown',
          ...this.getMainMenu(this.isAdmin(chatId))
        });
      }
      // Новый поиск
      else if (data === 'new_search') {
        stateManager.updateState(chatId, {
          currentSection: 'search'
        });
        await this.showSearchMenu(chatId);
      }
      
      await this.bot.answerCallbackQuery(query.id);
    });
  }
  
  // Инициализация CSV команд
  initCSVCommands() {
    // Команда /import - импорт данных
    this.bot.onText(/\/import/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Начинаю импорт данных из CSV...');
        
        const result = await importSMIFromCSV('./smi-import-fixed.csv');
        
        let response = `✅ *Импорт завершен!*\n\n`;
        response += `📊 *Результаты:*\n`;
        response += `• Прочитано записей: ${result.total}\n`;
        response += `• Добавлено новых: ${result.imported}\n`;
        response += `• Обновлено: ${result.updated}\n\n`;
        response += `Всего в базе: ${await SMI.count()} записей`;
        
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Ошибка импорта CSV:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка импорта: ${error.message}`);
      }
    });

    // Команда /fixtable - исправление таблицы
    this.bot.onText(/\/fixtable/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ Только для администраторов');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Пересоздаю таблицу smis...');
        
        const result = await fixSMITable();
        
        if (result.success) {
          await this.bot.sendMessage(chatId, 
            '🎉 *ТАБЛИЦА ПЕРЕСОЗДАНА!*\n\n' +
            'Теперь импортируйте данные:\n' +
            '`/import` - загрузит СМИ из CSV',
            { parse_mode: 'Markdown' }
          );
        } else {
          await this.bot.sendMessage(chatId, `❌ Ошибка: ${result.message}`);
        }
        
      } catch (error) {
        console.error('Ошибка пересоздания таблицы:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /stats - статистика
    this.bot.onText(/\/stats/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        const smiCount = await SMI.count();
        const userCount = await User.count();
        
        const message = `📊 *СТАТИСТИКА СИСТЕМЫ*\n\n` +
          `📰 СМИ в базе: ${smiCount}\n` +
          `👥 Пользователей: ${userCount}\n` +
          `🕒 Время сервера: ${new Date().toLocaleString('ru-RU')}`;
        
        await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
      } catch (error) {
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /check - проверка системы
    this.bot.onText(/\/check/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await require('./database').sequelize.authenticate();
        
        const smiCount = await SMI.count();
        const csvExists = fs.existsSync('./smi-import-fixed.csv');
        
        let report = `✅ *СИСТЕМА РАБОТАЕТ НОРМАЛЬНО*\n\n`;
        report += `🗄️ База данных: ✅ Подключена\n`;
        report += `📰 Записей СМИ: ${smiCount}\n`;
        report += `📁 CSV файл: ${csvExists ? '✅ Найден' : '❌ Не найден'}\n\n`;
        report += `🎯 *Доступные команды:*\n`;
        report += `/search - Поиск СМИ\n`;
        report += `/stats - Статистика\n`;
        
        if (this.isAdmin(chatId)) {
          report += `/import - Импорт CSV\n`;
          report += `/fixtable - Исправить таблицу\n`;
        }
        
        await this.bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });
        
      } catch (error) {
        await this.bot.sendMessage(chatId, 
          `❌ *ОШИБКА СИСТЕМЫ*\n\n` +
          `Сообщение: ${error.message}\n\n` +
          `Проверьте подключение к базе данных.`,
          { parse_mode: 'Markdown' }
        );
      }
    });
  }
  
  // Регистрация пользователя
  async registerUser(msg) {
    const { id, username, first_name, last_name } = msg.from;
    
    try {
      await User.findOrCreate({
        where: { telegramId: id },
        defaults: {
          username,
          firstName: first_name,
          lastName: last_name
        }
      });
    } catch (error) {
      console.error('Ошибка регистрации пользователя:', error);
    }
  }
  
  // Главное меню
  async handleMainMenu(chatId, text) {
    switch(text) {
      case '🔍 ПОИСК СМИ':
        await this.showSearchMenu(chatId);
        break;
        
      case '📞 КОНТАКТЫ':
        await this.showContacts(chatId);
        break;
        
      case '⚙️ АДМИН':
        if (this.isAdmin(chatId)) {
          await this.showAdminMenu(chatId);
        } else {
          await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        }
        break;
        
      default:
        await this.bot.sendMessage(chatId, 'Пожалуйста, выберите действие из меню:', 
          this.getMainMenu(this.isAdmin(chatId)));
    }
  }
  
  // Показать меню поиска
  async showSearchMenu(chatId) {
    stateManager.updateState(chatId, {
      currentSection: 'search'
    });
    
    await this.bot.sendMessage(chatId, '🔍 *ПОИСК СМИ*\n\nВыберите фильтр для поиска:', {
      parse_mode: 'Markdown',
      ...this.getSearchMenu()
    });
  }
  
  // Обработка поиска
  async handleSearch(chatId, text, state) {
    if (text === '🔙 Назад') {
      stateManager.resetState(chatId);
      await this.bot.sendMessage(chatId, '🏠 *Главное меню*', {
        parse_mode: 'Markdown',
        ...this.getMainMenu(this.isAdmin(chatId))
      });
      return;
    }
    
    let filters = {};
    let filterName = '';
    
    switch(text) {
      case '🔍 Бизнес-СМИ':
        filters.category = 'Business';
        filterName = 'бизнес-СМИ';
        break;
      case '💻 IT-СМИ':
        filters.category = 'Technology';
        filterName = 'IT-СМИ';
        break;
      case '📰 Новостные':
        filters.category = 'News';
        filterName = 'новостные СМИ';
        break;
      case '🇷🇺 Российские':
        filters.country = 'Russia';
        filterName = 'российские СМИ';
        break;
      case '🌍 Международные':
        filters.country = 'United States of America';
        filterName = 'международные СМИ';
        break;
      case '💰 До 100к':
        filters.maxPrice = 100000;
        filterName = 'до 100,000 руб.';
        break;
      case '💰 До 200к':
        filters.maxPrice = 200000;
        filterName = 'до 200,000 руб.';
        break;
      case '📊 Все СМИ':
        filterName = 'все СМИ';
        break;
      default:
        return;
    }
    
    try {
      const loadingMsg = await this.bot.sendMessage(chatId, `🔍 *Ищу ${filterName}...*`, {
        parse_mode: 'Markdown'
      });
      
      const results = await searchSMILikeCSV(filters);
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, 
          `😔 *По запросу "${filterName}" ничего не найдено.*\n\n` +
          'Попробуйте другой фильтр или измените критерии поиска.',
          {
            parse_mode: 'Markdown',
            ...this.getSearchMenu()
          }
        );
        return;
      }
      
      // Сохраняем результаты для пагинации
      const searchId = Date.now().toString();
      this.csvSearches.set(`${chatId}_${searchId}`, {
        results: results,
        filterName: filterName,
        createdAt: Date.now()
      });
      
      // Очищаем старые результаты (старше 1 часа)
      this.cleanupOldSearches();
      
      // Показываем первую страницу
      await this.showResultsPage(chatId, searchId, 1);
      
    } catch (error) {
      console.error('Ошибка поиска:', error);
      await this.bot.sendMessage(chatId, `❌ Ошибка поиска: ${error.message}`);
    }
  }
  
  // Показать страницу результатов
  async showResultsPage(chatId, searchId, page) {
    const searchKey = `${chatId}_${searchId}`;
    const searchData = this.csvSearches.get(searchKey);
    
    if (!searchData) {
      await this.bot.sendMessage(chatId, '❌ Результаты поиска устарели. Пожалуйста, выполните новый поиск.');
      return;
    }
    
    const { results, filterName } = searchData;
    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    
    if (page < 1 || page > totalPages) {
      page = 1;
    }
    
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, results.length);
    const pageResults = results.slice(startIndex, endIndex);
    
    let message = `🔍 *${filterName}*\n`;
    message += `📊 Найдено: ${results.length} СМИ | Страница ${page}/${totalPages}\n\n`;
    
    pageResults.forEach((item, index) => {
      const globalIndex = startIndex + index + 1;
      
      const categoryEmoji = this.getCategoryEmoji(item.category);
      const countryFlag = this.getCountryFlag(item.country);
      
      // Очищаем данные от кавычек
      const cleanWebsite = item.website ? item.website.replace(/"/g, '') : '';
      const cleanContact = item.contact ? item.contact.replace(/"/g, '') : '';
      const cleanDescription = item.description ? item.description.replace(/"/g, '') : '';
      
      message += `*${globalIndex}. ${item.name}*\n`;
      message += `   ${categoryEmoji} *Категория:* ${item.category || 'Без категории'}\n`;
      message += `   ${countryFlag} *Страна:* ${item.country || 'Не указана'}\n`;
      message += `   👥 *Аудитория:* ${item.audience || 'н/д'}\n`;
      message += `   💰 *Цена:* ${item.price ? item.price.toLocaleString('ru-RU') + ' руб.' : 'цена по запросу'}\n`;
      
      // Показываем дополнительные поля если они есть
      if (cleanWebsite && cleanWebsite.trim() !== '') {
        message += `   🌐 *Сайт:* ${cleanWebsite}\n`;
      }
      
      if (cleanContact && cleanContact.trim() !== '') {
        message += `   📞 *Контакты:* ${cleanContact}\n`;
      }
      
      if (cleanDescription && cleanDescription.trim() !== '') {
        const shortDesc = cleanDescription.length > 100 ? 
          cleanDescription.substring(0, 100) + '...' : cleanDescription;
        message += `   📝 *Описание:* ${shortDesc}\n`;
      }
      
      message += '\n';
    });
    
    // Создаем клавиатуру с пагинацией
    const inlineKeyboard = [];
    
    // Кнопки пагинации
    const paginationRow = [];
    
    if (page > 1) {
      paginationRow.push({
        text: '◀️ Назад',
        callback_data: `page_${searchId}_${page - 1}`
      });
    }
    
    paginationRow.push({
      text: `${page}/${totalPages}`,
      callback_data: 'page_info'
    });
    
    if (page < totalPages) {
      paginationRow.push({
        text: 'Вперед ▶️',
        callback_data: `page_${searchId}_${page + 1}`
      });
    }
    
    if (paginationRow.length > 0) {
      inlineKeyboard.push(paginationRow);
    }
    
    // Кнопки действий
    inlineKeyboard.push([
      {
        text: '🏠 Главное меню',
        callback_data: 'to_main'
      },
      {
        text: '🔄 Новый поиск',
        callback_data: 'new_search'
      }
    ]);
    
    // Сохраняем ID сообщения для редактирования
    const searchDataWithMessage = { ...searchData, messageId: null };
    
    if (page === 1) {
      // Отправляем новое сообщение
      const sentMessage = await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineKeyboard }
      });
      
      searchDataWithMessage.messageId = sentMessage.message_id;
      this.csvSearches.set(searchKey, searchDataWithMessage);
    } else {
      // Редактируем существующее сообщение
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: searchData.messageId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      } catch (error) {
        // Если не удалось отредактировать, отправляем новое
        const sentMessage = await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
        
        searchDataWithMessage.messageId = sentMessage.message_id;
        this.csvSearches.set(searchKey, searchDataWithMessage);
      }
    }
  }
  
  // Очистка старых результатов поиска
  cleanupOldSearches() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [key, data] of this.csvSearches.entries()) {
      if (now - data.createdAt > oneHour) {
        this.csvSearches.delete(key);
      }
    }
  }
  
  // Показать контакты
  async showContacts(chatId) {
    const message = `📞 *КОНТАКТНАЯ ИНФОРМАЦИЯ*\n\n` +
      `👤 Ваш менеджер: *Анна Петрова*\n` +
      `📱 Телефон: +7 (XXX) XXX-XX-XX\n` +
      `✉️ Email: manager@mediapro.ru\n` +
      `🕐 Часы работы: Пн-Пт 10:00-19:00\n\n` +
      `*Услуги:*\n` +
      `• Подбор СМИ\n` +
      `• Консультации\n` +
      `• Медиапланирование\n\n` +
      `Напишите ваш вопрос в чат.`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...this.getMainMenu(this.isAdmin(chatId))
    });
  }
  
  // Показать админ-меню
  async showAdminMenu(chatId) {
    const userCount = await User.count();
    const smiCount = await SMI.count();
    
    const message = `⚙️ *АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
      `📊 Статистика:\n` +
      `• Пользователей: ${userCount}\n` +
      `• СМИ в базе: ${smiCount}\n\n` +
      `*Доступные команды:*\n` +
      `/import - Импорт данных из CSV\n` +
      `/fixtable - Исправить таблицу\n` +
      `/stats - Статистика системы\n` +
      `/check - Проверка системы`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  // Обработка админ-команд
  async handleAdminCommand(chatId, text) {
    switch(text) {
      case '⚙️ АДМИН':
        await this.showAdminMenu(chatId);
        break;
    }
  }
}

// Создаем и запускаем бота
if (require.main === module) {
  const useWebhook = process.env.USE_WEBHOOK === 'true' || 
                     process.env.REPLIT_URL || 
                     process.env.RAILWAY_URL || 
                     false;
  
  console.log(`🔄 Режим запуска: ${useWebhook ? 'Вебхук' : 'Polling'}`);
  console.log(`🌐 PORT: ${process.env.PORT || 3000}`);
  console.log(`⚙️ USE_WEBHOOK: ${process.env.USE_WEBHOOK || 'false'}`);
  
  initDatabase().then(() => {
    console.log('✅ База данных готова к работе');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      prBot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
    }
  }).catch(err => {
    console.error('❌ Ошибка инициализации БД:', err.message);
    console.log('⚠️ Бот запускается без базы данных...');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      prBot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
    }
  });
} else {
  module.exports = PRBot;
}