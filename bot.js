require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, importSMIFromCSV, searchSMILikeCSV, initDatabase, Op, fixSMITable } = require('./database');
const keyboards = require('./keyboards'); // Подключаем клавиатуры
const stateManager = require('./states'); // Подключаем менеджер состояний
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
  
  // Получение эмодзи для категории (используем из keyboards.js)
  getCategoryEmoji(category) {
    return keyboards.getCategoryEmoji ? keyboards.getCategoryEmoji(category) : '📋';
  }
  
  // Получение флага для страны (используем из keyboards.js)
  getCountryFlag(country) {
    return keyboards.getCountryFlag ? keyboards.getCountryFlag(country) : '🌍';
  }
  
  initHandlers() {
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.registerUser(msg);
      stateManager.resetState(chatId);
      
      const welcomeMessage = `👋 *Добро пожаловать в MediaPro!*\n\n` +
        `Я помогу вам найти подходящие СМИ из базы данных.\n\n` +
        `Выберите нужный раздел:`;
      
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(isAdmin)
      });
    });
    
    // Команда /search
    this.bot.onText(/\/search/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showSearchTypeMenu(chatId);
    });
    
    // Команда /contacts
    this.bot.onText(/\/contacts/, async (msg) => {
      const chatId = msg.chat.id;
      await this.showContactManager(chatId);
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
      if (this.isAdmin(chatId) && text === '⚙️ АДМИН-ПАНЕЛЬ') {
        await this.showAdminMenu(chatId);
        return;
      }
      
      // Главное меню
      if (!userState.currentSection) {
        await this.handleMainMenu(chatId, text);
      } 
      // Раздел поиска СМИ
      else if (userState.currentSection === 'smi') {
        await this.handleSMIFlow(chatId, text, userState);
      }
      // Раздел профиля
      else if (userState.currentSection === 'profile') {
        await this.handleProfile(chatId, text, userState);
      }
    });
    
    // Обработка инлайн-кнопок
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      console.log(`📲 Callback query: ${data} от ${chatId}`);
      
      // Пагинация для поиска
      if (data.startsWith('page_')) {
        const [_, searchId, page] = data.split('_');
        await this.showResultsPage(chatId, searchId, parseInt(page));
      }
      // Главное меню
      else if (data === 'main_menu') {
        stateManager.resetState(chatId);
        const isAdmin = this.isAdmin(chatId);
        await this.bot.sendMessage(chatId, '🏠 *Главное меню*', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
      }
      // Новый поиск
      else if (data === 'new_search') {
        await this.showSearchTypeMenu(chatId);
      }
      // Экспорт
      else if (data.startsWith('export_')) {
        const searchId = data.split('_')[1];
        await this.exportToCSV(chatId, searchId);
      }
      // Добавление в избранное
      else if (data.startsWith('fav_smi_')) {
        const itemId = data.split('_')[2];
        await this.addToFavorites(chatId, 'smi', parseInt(itemId));
        await this.bot.answerCallbackQuery(query.id, { text: '✅ Добавлено в избранное' });
      }
      // Контакты
      else if (data.startsWith('contact_smi_')) {
        const itemId = data.split('_')[2];
        await this.showContactInfo(chatId, 'smi', parseInt(itemId));
      }
      // Закрыть уведомление
      else if (data === 'close_notification') {
        try {
          await this.bot.deleteMessage(chatId, query.message.message_id);
        } catch (error) {
          // Игнорируем ошибки удаления
        }
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
    const isAdmin = this.isAdmin(chatId);
    
    switch(text) {
      case '📰 ПОДОБРАТЬ СМИ':
        await this.showSearchTypeMenu(chatId);
        break;
        
      case '🏆 ПРЕМИИ':
        await this.bot.sendMessage(chatId, '🏆 *РАЗДЕЛ ПРЕМИЙ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;
        
      case '👨‍⚖️ ЖЮРИ':
        await this.bot.sendMessage(chatId, '👨‍⚖️ *РАЗДЕЛ ЖЮРИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;
        
      case '🤝 АССОЦИАЦИИ':
        await this.bot.sendMessage(chatId, '🤝 *РАЗДЕЛ АССОЦИАЦИЙ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(isAdmin)
        });
        break;
        
      case '⭐ ИЗБРАННОЕ':
        await this.showFavorites(chatId);
        break;
        
      case '👤 ЛИЧНЫЙ КАБИНЕТ':
        stateManager.updateState(chatId, {
          currentSection: 'profile'
        });
        await this.showProfile(chatId);
        break;
        
      case '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ':
        await this.showContactManager(chatId);
        break;
        
      case '⚙️ АДМИН-PANEЛЬ':
        if (isAdmin) {
          await this.showAdminMenu(chatId);
        } else {
          await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        }
        break;
        
      default:
        await this.bot.sendMessage(chatId, 'Пожалуйста, выберите раздел из меню:', 
          keyboards.getMainMenu(isAdmin));
    }
  }
  
  // Показать меню выбора типа поиска
  async showSearchTypeMenu(chatId) {
    stateManager.updateState(chatId, {
      currentSection: 'smi',
      step: 'search_type',
      filters: {}
    });
    
    await this.bot.sendMessage(chatId, 
      '📰 *ПОДБОР СМИ*\n\n' +
      'Выберите тип поиска:\n\n' +
      '⚡ *Быстрый поиск* - популярные фильтры\n' +
      '🔍 *Расширенный поиск* - точная настройка',
      {
        parse_mode: 'Markdown',
        ...keyboards.getSearchTypeMenu()
      }
    );
  }
  
  // Обработка потока СМИ
  async handleSMIFlow(chatId, text, state) {
    const isAdmin = this.isAdmin(chatId);
    
    switch(state.step) {
      case 'search_type':
        if (text === '⬅️ НАЗАД' || text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        if (text === '⚡ Быстрый поиск') {
          stateManager.updateState(chatId, { step: 'quick_menu' });
          await this.showQuickSearchMenu(chatId);
          return;
        }
        
        if (text === '🔍 Расширенный поиск') {
          stateManager.updateState(chatId, { step: 'category' });
          await this.bot.sendMessage(chatId, '📌 *ВЫБЕРИТЕ КАТЕГОРИЮ СМИ:*', {
            parse_mode: 'Markdown',
            ...keyboards.getSMICategories()
          });
          return;
        }
        break;
        
      case 'quick_menu':
        await this.handleQuickSearch(chatId, text, state);
        break;
        
      case 'category':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'search_type' });
          await this.bot.sendMessage(chatId, 'Выберите тип поиска:', keyboards.getSearchTypeMenu());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        // Сохраняем выбранную категорию (убираем эмодзи)
        const category = text.replace(/^[^\w\s]+\s/, '');
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, category },
          step: 'country'
        });
        
        await this.bot.sendMessage(chatId, '🌍 *ВЫБЕРИТЕ СТРАНУ:*', {
          parse_mode: 'Markdown',
          ...keyboards.getCountries()
        });
        break;
        
      case 'country':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'category' });
          await this.bot.sendMessage(chatId, 'Выберите категорию:', keyboards.getSMICategories());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        let country = '';
        if (text === '🌍 Все страны') {
          country = ''; // Будем игнорировать фильтр по стране
        } else if (text === '🌏 Другая страна') {
          // Запрос ручного ввода
          stateManager.updateState(chatId, { ...state, step: 'custom_country' });
          await this.bot.sendMessage(chatId,
            '🌍 Введите название страны на английском:\n(например: Germany, France, Japan)',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['⬅️ НАЗАД']],
                resize_keyboard: true
              }
            }
          );
          return;
        } else {
          // Убираем флаг эмодзи
          country = text.split(' ').slice(1).join(' ');
          // Конвертируем русское название в английское для поиска
          if (country === 'Россия') country = 'Russia';
          else if (country === 'США') country = 'USA';
          else if (country === 'Германия') country = 'Germany';
          else if (country === 'Франция') country = 'France';
          else if (country === 'Китай') country = 'China';
          else if (country === 'Великобритания') country = 'United Kingdom';
        }
        
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, country },
          step: 'backdated'
        });
        
        await this.bot.sendMessage(chatId, '📅 *ЗАДНИЕ ЧИСЛА (BACKDATED)*\n\nНужны ли публикации задним числом?', {
          parse_mode: 'Markdown',
          ...keyboards.getBackdatedOptions()
        });
        break;
        
      case 'custom_country':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'country' });
          await this.bot.sendMessage(chatId, 'Выберите страну:', keyboards.getCountries());
          return;
        }
        
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, country: text },
          step: 'backdated'
        });
        
        await this.bot.sendMessage(chatId, '📅 *ЗАДНИЕ ЧИСЛА (BACKDATED)*\n\nНужны ли публикации задним числом?', {
          parse_mode: 'Markdown',
          ...keyboards.getBackdatedOptions()
        });
        break;
        
      case 'backdated':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'country' });
          await this.bot.sendMessage(chatId, 'Выберите страну:', keyboards.getCountries());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        let backdatedValue = null;
        if (text.includes('Да')) backdatedValue = true;
        else if (text.includes('Нет')) backdatedValue = false;
        else if (text.includes('Не важно')) backdatedValue = null;
        
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, backdated: backdatedValue },
          step: 'audience'
        });
        
        await this.bot.sendMessage(chatId, '📊 *ВЫБЕРИТЕ ОХВАТ АУДИТОРИИ:*', {
          parse_mode: 'Markdown',
          ...keyboards.getAudienceOptions()
        });
        break;
        
      case 'audience':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'backdated' });
          await this.bot.sendMessage(chatId, 'Выберите опцию backdated:', keyboards.getBackdatedOptions());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        let audienceFilter = {};
        
        if (text.includes('До 100К')) audienceFilter = { min: 0, max: 100000 };
        else if (text.includes('100К - 500К')) audienceFilter = { min: 100000, max: 500000 };
        else if (text.includes('500К - 1М')) audienceFilter = { min: 500000, max: 1000000 };
        else if (text.includes('1М - 5М')) audienceFilter = { min: 1000000, max: 5000000 };
        else if (text.includes('5М+')) audienceFilter = { min: 5000000, max: null };
        else if (text.includes('Любая аудитория')) audienceFilter = { min: 0, max: null };
        
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, audience: audienceFilter },
          step: 'price'
        });
        
        await this.bot.sendMessage(chatId, '💵 *ВЫБЕРИТЕ ЦЕНОВОЙ ДИАПАЗОН:*', {
          parse_mode: 'Markdown',
          ...keyboards.getPriceOptions()
        });
        break;
        
      case 'price':
        if (text === '⬅️ НАЗАД') {
          stateManager.updateState(chatId, { step: 'audience' });
          await this.bot.sendMessage(chatId, 'Выберите охват аудитории:', keyboards.getAudienceOptions());
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(isAdmin));
          return;
        }
        
        let priceFilter = {};
        
        if (text.includes('До 50K')) priceFilter = { max: 50000 };
        else if (text.includes('50K-100K')) priceFilter = { min: 50000, max: 100000 };
        else if (text.includes('100K-200K')) priceFilter = { min: 100000, max: 200000 };
        else if (text.includes('200K+')) priceFilter = { min: 200000, max: null };
        else if (text.includes('Любая цена')) priceFilter = { min: 0, max: null };
        
        // Сохраняем фильтр цены
        stateManager.updateState(chatId, {
          ...state,
          filters: { ...state.filters, price: priceFilter }
        });
        
        // ВЫПОЛНЯЕМ ПОИСК С ВСЕМИ ФИЛЬТРАМИ
        await this.performExtendedSearch(chatId, state.filters);
        break;
    }
  }
  
  // Показать меню быстрого поиска
  async showQuickSearchMenu(chatId) {
    await this.bot.sendMessage(chatId, 
      '⚡ *БЫСТРЫЙ ПОИСК СМИ*\n\n' +
      'Выберите популярный фильтр:',
      {
        parse_mode: 'Markdown',
        ...keyboards.getQuickSearchMenu()
      }
    );
  }
  
  // Обработка быстрого поиска
  async handleQuickSearch(chatId, text, state) {
    const isAdmin = this.isAdmin(chatId);
    
    if (text === '⬅️ НАЗАД') {
      stateManager.updateState(chatId, { step: 'search_type' });
      await this.bot.sendMessage(chatId, 'Выберите тип поиска:', keyboards.getSearchTypeMenu());
      return;
    }
    
    if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
      stateManager.resetState(chatId);
      await this.bot.sendMessage(chatId, 'Главное меню:', 
        keyboards.getMainMenu(isAdmin));
      return;
    }
    
    if (text === '🔍 Расширенный поиск') {
      stateManager.updateState(chatId, { step: 'category' });
      await this.bot.sendMessage(chatId, '📌 Выберите категорию:', keyboards.getSMICategories());
      return;
    }
    
    if (text === '🎯 Рекомендации') {
      await this.showRecommendations(chatId);
      return;
    }
    
    const loadingMsg = await this.bot.sendMessage(chatId, '⚡ *Ищу по быстрому фильтру...*', {
      parse_mode: 'Markdown'
    });
    
    try {
      let filters = {};
      let filterName = '';
      
      // Определяем фильтры по выбранной кнопке
      switch(text) {
        case '🔥 ТОП Business':
          filters = { category: 'Business' };
          filterName = 'ТОП Business СМИ';
          break;
        case '🔥 ТОП Technology':
          filters = { category: 'Technology' };
          filterName = 'ТОП Technology СМИ';
          break;
        case '🇷🇺 Российские СМИ':
          filters = { country: 'Russia' };
          filterName = 'Российские СМИ';
          break;
        case '🌍 Международные':
          filters = { country: 'USA' };
          filterName = 'Международные СМИ';
          break;
        case '💰 Бюджетные СМИ':
          filters = { maxPrice: 50000 };
          filterName = 'Бюджетные СМИ (до 50K руб.)';
          break;
        case '👥 Крупная аудитория':
          filters = { minAudience: 1000000 };
          filterName = 'СМИ с крупной аудиторией (1M+)';
          break;
      }
      
      if (Object.keys(filters).length > 0) {
        const results = await this.searchWithFilters(filters);
        
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
        
        if (results.length === 0) {
          await this.bot.sendMessage(chatId, 
            `😔 *По фильтру "${filterName}" ничего не найдено.*\n\n` +
            'Попробуйте другой фильтр или расширенный поиск.',
            {
              parse_mode: 'Markdown',
              ...keyboards.getQuickSearchMenu()
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
        
        // Показываем первую страницу с inline-пагинацией
        await this.showResultsPage(chatId, searchId, 1);
      }
      
    } catch (error) {
      console.error('Ошибка быстрого поиска:', error);
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка поиска. Попробуйте позже.');
    }
  }
  
  // Поиск с фильтрами (адаптер для searchSMILikeCSV)
  async searchWithFilters(filters) {
    try {
      // Преобразуем фильтры для функции searchSMILikeCSV
      const searchFilters = {};
      
      if (filters.category) searchFilters.category = filters.category;
      if (filters.country) searchFilters.country = filters.country;
      if (filters.backdated !== undefined) searchFilters.backdated = filters.backdated;
      if (filters.maxPrice) searchFilters.maxPrice = filters.maxPrice;
      if (filters.minPrice) searchFilters.minPrice = filters.minPrice;
      if (filters.maxAudience) searchFilters.maxAudience = filters.maxAudience;
      if (filters.minAudience) searchFilters.minAudience = filters.minAudience;
      if (filters.sortBy) searchFilters.sortBy = filters.sortBy;
      
      // Выполняем поиск
      const results = await searchSMILikeCSV(searchFilters);
      
      // Сортировка если указана
      if (filters.sortBy === 'price_asc') {
        results.sort((a, b) => (a.price || 0) - (b.price || 0));
      } else if (filters.sortBy === 'price_desc') {
        results.sort((a, b) => (b.price || 0) - (a.price || 0));
      } else if (filters.sortBy === 'audience_desc') {
        results.sort((a, b) => (b.audienceNumber || 0) - (a.audienceNumber || 0));
      }
      
      return results;
      
    } catch (error) {
      console.error('Ошибка поиска с фильтрами:', error);
      return [];
    }
  }
  
  // Выполнить расширенный поиск
  async performExtendedSearch(chatId, filters) {
    const loadingMsg = await this.bot.sendMessage(chatId, '🔍 *Выполняю поиск по вашим фильтрам...*', {
      parse_mode: 'Markdown'
    });
    
    try {
      // Преобразуем фильтры для функции searchSMILikeCSV
      const searchFilters = {};
      
      if (filters.category) searchFilters.category = filters.category;
      if (filters.country) searchFilters.country = filters.country;
      if (filters.backdated !== undefined && filters.backdated !== null) {
        searchFilters.backdated = filters.backdated;
      }
      
      if (filters.price) {
        if (filters.price.max) searchFilters.maxPrice = filters.price.max;
        if (filters.price.min) searchFilters.minPrice = filters.price.min;
      }
      
      if (filters.audience) {
        if (filters.audience.max) searchFilters.maxAudience = filters.audience.max;
        if (filters.audience.min) searchFilters.minAudience = filters.audience.min;
      }
      
      const results = await searchSMILikeCSV(searchFilters);
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, 
          `😔 *По вашим критериям ничего не найдено.*\n\n` +
          'Попробуйте изменить фильтры или используйте быстрый поиск.',
          {
            parse_mode: 'Markdown',
            ...keyboards.getAfterSearchMenu()
          }
        );
        stateManager.resetState(chatId);
        return;
      }
      
      // Сохраняем результаты для пагинации
      const searchId = Date.now().toString();
      this.csvSearches.set(`${chatId}_${searchId}`, {
        results: results,
        filterName: 'Результаты расширенного поиска',
        createdAt: Date.now()
      });
      
      // Показываем первую страницу с inline-пагинацией
      await this.showResultsPage(chatId, searchId, 1);
      
    } catch (error) {
      console.error('Ошибка расширенного поиска:', error);
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка поиска. Попробуйте позже.');
    }
  }
  
  // Показать рекомендации
  async showRecommendations(chatId) {
    try {
      const loadingMsg = await this.bot.sendMessage(chatId, '🎯 *Подбираю рекомендации...*', {
        parse_mode: 'Markdown'
      });
      
      // Получаем несколько вариантов для рекомендаций
      const results = [];
      
      // 1. Популярные бизнес-СМИ
      const businessSMI = await searchSMILikeCSV({ category: 'Business' });
      if (businessSMI.length > 0) results.push(...businessSMI.slice(0, 3));
      
      // 2. Бюджетные варианты
      const budgetSMI = await searchSMILikeCSV({ maxPrice: 50000 });
      if (budgetSMI.length > 0) results.push(...budgetSMI.slice(0, 2));
      
      // 3. Российские СМИ
      const russianSMI = await searchSMILikeCSV({ country: 'Russia' });
      if (russianSMI.length > 0) results.push(...russianSMI.slice(0, 2));
      
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, 
          '😔 *Не удалось сформировать рекомендации.*\n\n' +
          'Попробуйте использовать расширенный поиск.',
          {
            parse_mode: 'Markdown',
            ...keyboards.getQuickSearchMenu()
          }
        );
        return;
      }
      
      // Удаляем дубликаты
      const uniqueResults = Array.from(
        new Map(results.map(item => [item.name, item])).values()
      );
      
      // Сохраняем результаты для пагинации
      const searchId = Date.now().toString();
      this.csvSearches.set(`${chatId}_${searchId}`, {
        results: uniqueResults,
        filterName: 'Рекомендованные СМИ',
        createdAt: Date.now()
      });
      
      // Показываем первую страницу с inline-пагинацией
      await this.showResultsPage(chatId, searchId, 1);
      
    } catch (error) {
      console.error('Ошибка рекомендаций:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка формирования рекомендаций.');
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
      
      if (item.audience) {
        message += `   👥 *Аудитория:* ${item.audience}\n`;
      }
      
      message += `   💰 *Цена:* ${item.price ? item.price.toLocaleString('ru-RU') + ' руб.' : 'цена по запросу'}\n`;
      
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
    
    // Создаем inline-клавиатуру с пагинацией
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
    
    // Кнопки действий (используем функцию из keyboards.js если есть, иначе дефолтную)
    const firstItemId = pageResults[0]?.id;
    
    if (keyboards.getPagination) {
      const paginationMarkup = keyboards.getPagination(page, totalPages, searchId, firstItemId);
      
      if (page === 1) {
        // Отправляем новое сообщение
        const sentMessage = await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          ...paginationMarkup
        });
        
        // Сохраняем ID сообщения для редактирования
        searchData.messageId = sentMessage.message_id;
        this.csvSearches.set(searchKey, searchData);
      } else {
        // Редактируем существующее сообщение
        try {
          await this.bot.editMessageText(message, {
            chat_id: chatId,
            message_id: searchData.messageId,
            parse_mode: 'Markdown',
            ...paginationMarkup
          });
        } catch (error) {
          // Если не удалось отредактировать, отправляем новое
          const sentMessage = await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            ...paginationMarkup
          });
          
          searchData.messageId = sentMessage.message_id;
          this.csvSearches.set(searchKey, searchData);
        }
      }
    } else {
      // Дефолтная пагинация (если функция getPagination не существует)
      inlineKeyboard.push([
        {
          text: '🏠 Главное меню',
          callback_data: 'main_menu'
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
  
  // Показать профиль
  async showProfile(chatId) {
    const message = `👤 *ЛИЧНЫЙ КАБИНЕТ*\n\n` +
      `📊 *Статистика:*\n` +
      `• Функционал в разработке\n\n` +
      `Выберите действие:`;
    
    const isAdmin = this.isAdmin(chatId);
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...keyboards.getProfileMenu()
    });
  }
  
  // Обработка личного кабинета
  async handleProfile(chatId, text, state) {
    const isAdmin = this.isAdmin(chatId);
    
    switch(text) {
      case '📊 Статистика':
        await this.bot.sendMessage(chatId, '📊 *СТАТИСТИКА*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getProfileMenu()
        });
        break;
        
      case '🕐 История запросов':
        await this.bot.sendMessage(chatId, '🕐 *ИСТОРИЯ ЗАПРОСОВ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown',
          ...keyboards.getProfileMenu()
        });
        break;
        
      case '⬅️ НАЗАД':
      case '🏠 ГЛАВНОЕ МЕНЮ':
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', 
          keyboards.getMainMenu(isAdmin));
        break;
    }
  }
  
  // Показать избранное
  async showFavorites(chatId) {
    const isAdmin = this.isAdmin(chatId);
    
    await this.bot.sendMessage(chatId, '⭐ *ИЗБРАННОЕ*\n\nФункционал в разработке', {
      parse_mode: 'Markdown',
      ...keyboards.getMainMenu(isAdmin)
    });
  }
  
  // Добавить в избранное
  async addToFavorites(chatId, type, itemId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      // Здесь должна быть логика добавления в избранное
      console.log(`Добавление в избранное: ${type} ${itemId} для пользователя ${chatId}`);
      
      // Временное сообщение
      await this.bot.sendMessage(chatId, '✅ Добавлено в избранное (функционал в разработке)');
      
    } catch (error) {
      console.error('Ошибка добавления в избранное:', error);
    }
  }
  
  // Показать контакты менеджера
  async showContactManager(chatId) {
    const message = `📞 *СВЯЗЬ С МЕНЕДЖЕРОМ*\n\n` +
      `👤 Ваш менеджер: *Анна Петрова*\n` +
      `📱 +7 (XXX) XXX-XX-XX\n` +
      `✉️ manager@mediapro.ru\n` +
      `🕐 Часы работы: Пн-Пт 10:00-19:00\n\n` +
      `*Услуги:*\n` +
      `• Подбор СМИ\n` +
      `• Консультации\n` +
      `• Медиапланирование\n\n` +
      `⬅️ Напишите ваш вопрос в чат.`;
    
    const isAdmin = this.isAdmin(chatId);
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      ...keyboards.getMainMenu(isAdmin)
    });
  }
  
  // Показать контакты СМИ
  async showContactInfo(chatId, type, itemId) {
    try {
      const item = await SMI.findByPk(itemId);
      if (!item) {
        await this.bot.sendMessage(chatId, '❌ Информация о СМИ не найдена');
        return;
      }
      
      const message = `📞 *КОНТАКТНАЯ ИНФОРМАЦИЯ*\n\n` +
        `*${item.name}*\n` +
        `📧 Контакт: ${item.contact || 'запросить у менеджера'}\n` +
        `🌐 Сайт: ${item.website || 'не указан'}\n` +
        `📍 Страна: ${item.country || 'не указана'}\n` +
        `📊 Аудитория: ${item.audience || 'не указана'}\n` +
        `💰 Цена: ${item.price ? item.price.toLocaleString('ru-RU') + ' руб.' : 'цена по запросу'}`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
      
    } catch (error) {
      console.error('Ошибка показа контактов:', error);
      await this.bot.sendMessage(chatId, '⚠️ Не удалось загрузить контактную информацию');
    }
  }
  
  // Экспорт в CSV
  async exportToCSV(chatId, searchId) {
    const searchKey = `${chatId}_${searchId}`;
    const searchData = this.csvSearches.get(searchKey);
    
    if (!searchData || !searchData.results || searchData.results.length === 0) {
      await this.bot.sendMessage(chatId, '❌ Нет данных для экспорта');
      return;
    }
    
    try {
      // Создаем CSV контент
      const headers = ['Название', 'Категория', 'Страна', 'Аудитория', 'Цена', 'Контакты', 'Сайт', 'Описание', 'Backdated'];
      let csvContent = headers.join(',') + '\n';
      
      searchData.results.forEach(item => {
        const row = [
          `"${(item.name || '').replace(/"/g, '""')}"`,
          `"${item.category || ''}"`,
          `"${item.country || ''}"`,
          `"${item.audience || ''}"`,
          item.price || 0,
          `"${item.contact || ''}"`,
          `"${item.website || ''}"`,
          `"${(item.description || '').replace(/"/g, '""')}"`,
          item.backdated ? 'Да' : 'Нет'
        ];
        csvContent += row.join(',') + '\n';
      });
      
      // Создаем временный файл
      const fileName = `export_${chatId}_${Date.now()}.csv`;
      const filePath = `./temp_${fileName}`;
      
      fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8');
      
      // Отправляем файл
      await this.bot.sendDocument(
        chatId,
        filePath,
        {},
        {
          filename: fileName,
          caption: `📥 *ЭКСПОРТ РЕЗУЛЬТАТОВ ПОИСКА*\n\n` +
                   `✅ Экспортировано: *${searchData.results.length}* записей\n` +
                   `🔍 Поиск: ${searchData.filterName || 'Результаты поиска'}`,
          parse_mode: 'Markdown'
        }
      );
      
      // Удаляем временный файл
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5000);
      
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      await this.bot.sendMessage(chatId, '❌ Ошибка при экспорте данных');
    }
  }
  
  // Показать админ-меню
  async showAdminMenu(chatId) {
    try {
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
      
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(isAdmin)
      });
      
    } catch (error) {
      console.error('Ошибка показа админ-меню:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка загрузки админ-панели');
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