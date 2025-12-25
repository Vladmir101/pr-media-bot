require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { User, SMI, Award, Jury, Association, SearchQuery, findSMI, importSMIFromCSV, searchSMILikeCSV, initDatabase } = require('./database');
const keyboards = require('./keyboards');
const stateManager = require('./states');
const utils = require('./utils');
const fs = require('fs');
const path = require('path');

class PRBot {
  constructor(useWebhook = false) {
    // Опции для бота
    const options = {
      request: {
        timeout: 60000
      }
    };
    
    // Если нужен вебхук (для Replit/Railway/Render)
    if (useWebhook) {
      // Без polling, будем обрабатывать вебхуки
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме вебхука');
    } else {
      // Для локального запуска оставляем polling
      options.polling = true;
      this.bot = new TelegramBot(process.env.BOT_TOKEN, options);
      console.log('🤖 Бот инициализирован в режиме polling');
    }
    
    // СПИСОК АДМИНИСТРАТОРОВ - ЗАМЕНИТЕ НА ВАШ TELEGRAM ID!
    this.ADMIN_IDS = process.env.ADMIN_IDS ? 
      process.env.ADMIN_IDS.split(',') : 
      ['5970834739'];
    
    // Инициализируем парсер PR-новостей
    this.prParser = new (require('./pr-news-parser'))();
    
    this.initHandlers();
    this.initCSVCommands(); // Добавляем CSV команды
  }
  
  // Метод для запуска через вебхук
  startWebhook(webhookPath, port = process.env.PORT || 3000) {
    // Устанавливаем вебхук
    const webhookUrl = process.env.WEBHOOK_URL || `${process.env.REPLIT_URL || process.env.RAILWAY_URL || process.env.RENDER_URL || ''}${webhookPath}`;
    
    console.log(`🔗 Устанавливаю вебхук: ${webhookUrl}`);
    
    this.bot.setWebHook(webhookUrl)
      .then(() => {
        console.log(`✅ Вебхук установлен: ${webhookUrl}`);
      })
      .catch(err => {
        console.error('❌ Ошибка установки вебхука:', err);
      });
    
    // Создаем endpoint для вебхука
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    // Health check endpoint для Render
    app.get('/health', (req, res) => {
      res.status(200).send('OK');
    });
    
    // Обработчик вебхука от Telegram
    app.post(webhookPath, (req, res) => {
      this.bot.processUpdate(req.body);
      res.sendStatus(200);
    });
    
    // Стартуем сервер
    app.listen(port, () => {
      console.log(`🚀 Сервер запущен на порту ${port}`);
      console.log(`🌐 Вебхук: ${webhookPath}`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
    });
    
    return app;
  }
  
  // Проверка является ли пользователь администратором
  isAdmin(chatId) {
    return this.ADMIN_IDS.includes(chatId.toString());
  }
  
  // Инициализация обработчиков
  initHandlers() {
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.registerUser(msg);
      stateManager.resetState(chatId);
      
      const welcomeMessage = `👋 *Добро пожаловать в PR-агентство MediaPro!*\n\n` +
        `Я помогу вам подобрать СМИ, премии, экспертов для жюри и профессиональные ассоциации.\n\n` +
        `Выберите нужный раздел:`;
      
      // Проверяем, админ ли этот пользователь
      const isAdmin = this.isAdmin(chatId);
      
      await this.bot.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(isAdmin)
      });
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
      
      if (text.startsWith('/')) return; // Пропускаем команды
      
      const userState = stateManager.getState(chatId);
      
      // Проверка на админ-команды (ДАЖЕ ЕСЛИ ЕСТЬ currentSection!)
      if (this.isAdmin(chatId)) {
        const adminCommands = [
          '📊 Статистика бота', '👥 Пользователи',
          '📰 Управление СМИ', '🏆 Управление премиями',
          '📥 Экспорт данных', '🗑️ Очистить кэш',
          '🌐 Веб-админка', '📢 Рассылка',
          '⚙️ АДМИН-ПАНЕЛЬ', '🏠 Главное меню',
          '🔙 Назад в админку'
        ];
        
        if (adminCommands.includes(text)) {
          await this.handleAdminCommand(chatId, text);
          return;
        }
      }
      
      // Если пользователь в разделе PR-новостей
      if (userState.currentSection === 'pr_news') {
        await this.handlePRNews(chatId, text, userState);
        return;
      }
      
      // Главное меню
      if (!userState.currentSection) {
        await this.handleMainMenu(chatId, text);
      } 
      // Раздел СМИ
      else if (userState.currentSection === 'smi') {
        await this.handleSMIFlow(chatId, text, userState);
      }
      // Раздел премий
      else if (userState.currentSection === 'awards') {
        await this.bot.sendMessage(chatId, '🏆 *РАЗДЕЛ ПРЕМИЙ*\n\nФункционал в разработке. Скоро будет доступен!', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        stateManager.resetState(chatId);
      }
      // Раздел личного кабинета
      else if (userState.currentSection === 'profile') {
        await this.handleProfile(chatId, text, userState);
      }
    });
    
    // Обработка инлайн-кнопок
    this.bot.on('callback_query', async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;
      
      // Пагинация
      if (data.startsWith('page_')) {
        const [_, searchId, page] = data.split('_');
        await this.showResultsPage(chatId, searchId, parseInt(page));
      }
      
      // Добавление в избранное
      else if (data.startsWith('fav_')) {
        const [_, type, itemId] = data.split('_');
        await this.addToFavorites(chatId, type, parseInt(itemId));
        await this.bot.answerCallbackQuery(query.id, { text: '✅ Добавлено в избранное' });
      }
      
      // Запрос контактов
      else if (data.startsWith('contact_')) {
        await this.showContactInfo(chatId, data);
      }
      
      // Экспорт
      else if (data.startsWith('export_')) {
        const searchId = data.split('_')[1];
        await this.exportToCSV(chatId, searchId);
      }
      
      // Новый поиск
      else if (data === 'new_search') {
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Выберите раздел:', keyboards.getMainMenu());
      }
      
      // В меню
      else if (data === 'main_menu') {
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', keyboards.getMainMenu());
      }
      
      // Закрыть уведомление
      await this.bot.answerCallbackQuery(query.id);
    });
  }
  
  // Инициализация CSV команд
  initCSVCommands() {
    // Команда /csv_import
    this.bot.onText(/\/csv_import/, async (msg) => {
      const chatId = msg.chat.id;
      
      // Проверка прав администратора
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
    
    // Команда /generate_smi
    this.bot.onText(/\/generate_smi/, async (msg) => {
      const chatId = msg.chat.id;
      
      if (!this.isAdmin(chatId)) {
        await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        return;
      }
      
      try {
        await this.bot.sendMessage(chatId, '🔄 Генерирую тестовые данные СМИ...');
        
        const testSMI = [
          {
            name: 'Forbes Russia',
            category: 'Business',
            country: 'Russia',
            audience: '2.1M',
            audienceNumber: 2100000,
            price: 100000,
            contact: 'contact@forbes.ru',
            website: 'https://forbes.ru',
            description: 'TOP business media in Russia',
            backdated: false
          },
          {
            name: 'VC.ru',
            category: 'Technology',
            country: 'Russia',
            audience: '850K',
            audienceNumber: 850000,
            price: 75000,
            contact: 'pr@vc.ru',
            website: 'https://vc.ru',
            description: 'Tech audience',
            backdated: true
          },
          {
            name: 'Новое СМИ 1',
            category: 'News',
            country: 'Russia',
            audience: '1.5M',
            audienceNumber: 1500000,
            price: 80000,
            contact: 'info@new.ru',
            website: 'https://new-media.ru',
            description: 'New media platform',
            backdated: false
          },
          {
            name: 'Новое СМИ 2',
            category: 'Business',
            country: 'USA',
            audience: '3M',
            audienceNumber: 3000000,
            price: 150000,
            contact: 'media@usa.com',
            website: 'https://usamedia.com',
            description: 'International media',
            backdated: true
          }
        ];
        
        const headers = ['name', 'category', 'country', 'backdated', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website'];
        let csvContent = headers.join(',') + '\n';
        
        testSMI.forEach(item => {
          const row = [
            '"' + item.name.replace(/"/g, '""') + '"',
            '"' + item.category + '"',
            '"' + item.country + '"',
            item.backdated ? 'true' : 'false',
            '"' + item.audience + '"',
            item.audienceNumber,
            '"' + item.contact + '"',
            item.price,
            '"' + item.description.replace(/"/g, '""') + '"',
            '"' + item.website + '"'
          ];
          csvContent += row.join(',') + '\n';
        });
        
        const filename = 'bot-generated-smi.csv';
        fs.writeFileSync(filename, csvContent, 'utf8');
        
        let response = '✅ *Сгенерированы тестовые данные:*\n\n';
        testSMI.forEach((item, index) => {
          response += `${index + 1}. *${item.name}*\n`;
          response += `   Категория: ${item.category}\n`;
          response += `   Страна: ${item.country}\n`;
          response += `   Цена: ${item.price.toLocaleString('ru-RU')} руб.\n\n`;
        });
        
        response += `Файл: \`${filename}\`\n`;
        response += 'Используйте `/csv_import` для импорта';
        
        await this.bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Ошибка генерации:', error);
        await this.bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
      }
    });
    
    // Команда /csv_search
    this.bot.onText(/\/csv_search/, async (msg) => {
      const chatId = msg.chat.id;
      
      const keyboard = {
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
      
      await this.bot.sendMessage(chatId, '🔍 *Выберите фильтр для поиска СМИ:*', {
        parse_mode: 'Markdown',
        ...keyboard
      });
    });
    
    // Обработка выбора фильтра CSV
    this.bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      
      // Пропускаем если это команда или пользователь в другом разделе
      if (text.startsWith('/') || stateManager.getState(chatId).currentSection) {
        return;
      }
      
      if (text && text !== '🔙 Назад') {
        let filters = {};
        let filterName = '';
        
        switch(text) {
          case '🔍 Бизнес-СМИ':
            filters.category = 'Бизнес';
            filterName = 'бизнес-СМИ';
            break;
          case '💻 IT-СМИ':
            filters.category = 'IT';
            filterName = 'IT-СМИ';
            break;
          case '📰 Новостные':
            filters.category = 'Новости';
            filterName = 'новостные СМИ';
            break;
          case '🇷🇺 Российские':
            filters.country = 'Россия';
            filterName = 'российские СМИ';
            break;
          case '🌍 Международные':
            filters.country = 'США';
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
        }
        
        if (filterName) {
          try {
            const results = await searchSMILikeCSV(filters);
            
            if (results.length === 0) {
              await this.bot.sendMessage(chatId, `По запросу "${filterName}" ничего не найдено.`);
              return;
            }
            
            let response = `🔍 *Найдено ${results.length} ${filterName}:*\n\n`;
            
            results.slice(0, 5).forEach((smi, index) => {
              response += `${index + 1}. *${smi.name}*\n`;
              response += `   Категория: ${smi.category}\n`;
              response += `   Страна: ${smi.country}\n`;
              response += `   Цена: ${smi.price?.toLocaleString()} руб.\n`;
              
              if (smi.audience) {
                response += `   Аудитория: ${smi.audience}\n`;
              }
              
              response += '\n';
            });
            
            if (results.length > 5) {
              response += `... и еще ${results.length - 5} СМИ`;
            }
            
            await this.bot.sendMessage(chatId, response, {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['🔙 Назад']],
                resize_keyboard: true
              }
            });
            
          } catch (error) {
            console.error('Ошибка поиска CSV:', error);
            await this.bot.sendMessage(chatId, `❌ Ошибка поиска: ${error.message}`);
          }
        }
      }
      
      // Кнопка "Назад"
      if (text === '🔙 Назад') {
        await this.bot.sendMessage(chatId, 'Главное меню', {
          reply_markup: {
            remove_keyboard: true
          }
        });
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
      case '⚙️ АДМИН-ПАНЕЛЬ':
        if (this.isAdmin(chatId)) {
          await this.showAdminMenu(chatId);
        } else {
          await this.bot.sendMessage(chatId, '⛔ У вас нет прав администратора');
        }
        break;
        
      case '📢 PR НОВОСТИ':
        stateManager.updateState(chatId, {
          currentSection: 'pr_news',
          step: 'main'
        });
        
        await this.bot.sendMessage(chatId, 
          '📢 *PR & КОММУНИКАЦИИ*\n\n' +
          'Актуальные новости и тренды для PR-специалистов:\n\n' +
          '• PR-стратегии и кампании\n' +
          '• Кризисные коммуникации\n' +
          '• Медиапланирование\n' +
          '• SMM и контент\n' +
          '• Бренд-коммуникации\n\n' +
          'Выберите категорию:',
          {
            parse_mode: 'Markdown',
            ...keyboards.getPRNewsMenu()
          }
        );
        break;
        
      case '📰 ПОДОБРАТЬ СМИ':
        stateManager.updateState(chatId, {
          currentSection: 'smi',
          step: 'category'
        });
        await this.bot.sendMessage(chatId, '📌 *ВЫБЕРИТЕ НАПРАВЛЕНИЕ ДЕЯТЕЛЬНОСТИ:*', {
          parse_mode: 'Markdown',
          ...keyboards.getSMICategories()
        });
        break;
        
      case '🏆 ПРЕМИИ':
        stateManager.updateState(chatId, {
          currentSection: 'awards',
          step: 'category'
        });
        await this.bot.sendMessage(chatId, '🏆 *ПОДБОР ПРЕМИЙ*\n\nВыберите направление премии:', {
          parse_mode: 'Markdown',
          ...keyboards.getAwardCategories()
        });
        break;
        
      case '👨‍⚖️ ЖЮРИ':
        await this.bot.sendMessage(chatId, '👨‍⚖️ *РАЗДЕЛ ЖЮРИ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        break;
        
      case '🤝 АССОЦИАЦИИ':
        await this.bot.sendMessage(chatId, '🤝 *РАЗДЕЛ АССОЦИАЦИЙ*\n\nВ разработке...', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
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
        
      default:
        await this.bot.sendMessage(chatId, 'Пожалуйста, выберите раздел из меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
    }
  }
  
  // Обработка потока СМИ
  async handleSMIFlow(chatId, text, state) {
    switch(state.step) {
      case 'category':
        if (text === '⬅️ НАЗАД') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        if (text === '🏠 ГЛАВНОЕ МЕНЮ') {
          stateManager.resetState(chatId);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        stateManager.setFilter(chatId, 'category', text.replace(/^[^\s]+\s/, ''));
        stateManager.updateState(chatId, { step: 'country' });
        
        await this.bot.sendMessage(chatId, '🌍 *ВЫБЕРИТЕ СТРАНУ:*\n\nИли введите название страны вручную:', {
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
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        let country = text;
        if (text.includes(' ')) {
          country = text.split(' ')[1];
        }
        
        stateManager.setFilter(chatId, 'country', country);
        stateManager.updateState(chatId, { step: 'backdated' });
        
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
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        let backdatedValue = null;
        if (text.includes('Да')) backdatedValue = 'Да';
        else if (text.includes('Нет')) backdatedValue = 'Нет';
        else if (text.includes('Не важно')) backdatedValue = 'Не важно';
        
        stateManager.setFilter(chatId, 'backdated', backdatedValue);
        stateManager.updateState(chatId, { step: 'audience' });
        
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
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
        }
        
        stateManager.setFilter(chatId, 'audience', text);
        
        await this.performSMISearch(chatId);
        break;
    }
  }
  
  // Поиск СМИ
  async performSMISearch(chatId) {
    const state = stateManager.getState(chatId);
    const filters = state.filters;
    
    try {
      const searchMsg = await this.bot.sendMessage(chatId, '🔍 *Ищу подходящие СМИ...*', {
        parse_mode: 'Markdown'
      });
      
      const results = await findSMI(filters);
      
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (user) {
        const searchHistory = user.searchHistory || [];
        
        let historyArray = [];
        try {
          if (typeof searchHistory === 'string') {
            historyArray = JSON.parse(searchHistory);
          } else if (Array.isArray(searchHistory)) {
            historyArray = searchHistory;
          }
        } catch (e) {
          historyArray = [];
        }
        
        historyArray.push({
          date: new Date().toISOString(),
          type: 'smi',
          filters,
          resultsCount: results.length
        });
        
        user.searchHistory = JSON.stringify(historyArray);
        await user.save();
      }
      
      const searchId = stateManager.saveSearchResults(chatId, results);
      
      await this.bot.deleteMessage(chatId, searchMsg.message_id);
      
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, '😔 *По вашему запросу ничего не найдено.*\n\nПопробуйте изменить критерии поиска.', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        stateManager.resetState(chatId);
        return;
      }
      
      await this.showResultsPage(chatId, searchId, 1);
      
    } catch (error) {
      console.error('Ошибка поиска:', error);
      await this.bot.sendMessage(chatId, '⚠️ Произошла ошибка при поиске. Пожалуйста, попробуйте позже.');
    }
  }
  
  // Показать страницу результатов
  async showResultsPage(chatId, searchId, page) {
    const pageData = stateManager.getPageResults(searchId, page);
    
    let message = `✅ *НАЙДЕНО ${pageData.totalItems} СМИ*\n\n`;
    
    pageData.items.forEach((item, index) => {
      const globalIndex = (page - 1) * 5 + index + 1;
      
      const categoryEmoji = utils.getCategoryEmoji(item.category);
      const countryFlag = utils.getCountryFlag(item.country);
      const backdatedEmoji = item.backdated ? '✅' : '❌';
      const audienceEmoji = utils.getAudienceEmoji(item.audienceNumber);
      const audienceFormatted = utils.formatNumber(item.audienceNumber);
      
      message += `*${globalIndex}. ${item.name}*\n`;
      message += `${categoryEmoji} ${item.category} | ${countryFlag} ${item.country}\n`;
      message += `Задние числа: ${backdatedEmoji} | Охват: ${audienceEmoji} ${audienceFormatted}\n`;
      message += `Контакт: ${item.contact || 'запросить у менеджера'}\n\n`;
    });
    
    if (page === 1) {
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getPagination(page, pageData.totalPages, searchId)
      });
    } else {
      try {
        await this.bot.editMessageText(message, {
          chat_id: chatId,
          message_id: pageData.messageId || undefined,
          parse_mode: 'Markdown',
          ...keyboards.getPagination(page, pageData.totalPages, searchId)
        });
      } catch (error) {
        await this.bot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          ...keyboards.getPagination(page, pageData.totalPages, searchId)
        });
      }
    }
  }
  
  // Добавление в избранное
  async addToFavorites(chatId, type, itemId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      } else {
        favorites = { smi: [], awards: [], jury: [], associations: [] };
      }
      
      if (!favorites[type]) {
        favorites[type] = [];
      }
      
      if (!favorites[type].includes(itemId)) {
        favorites[type].push(itemId);
        user.favorites = JSON.stringify(favorites);
        await user.save();
      }
    } catch (error) {
      console.error('Ошибка добавления в избранное:', error);
    }
  }
  
  // Показать профиль
  async showProfile(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let history = [];
      if (user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      }
      
      const totalFavorites = Object.values(favorites).reduce((sum, arr) => sum + arr.length, 0);
      
      const message = `👤 *ЛИЧНЫЙ КАБИНЕТ*\n\n` +
        `📊 *Статистика:*\n` +
        `• Всего запросов: ${history.length}\n` +
        `• В избранном: ${totalFavorites} позиций\n` +
        `• Последний запрос: ${history.length > 0 ? utils.formatDate(history[history.length-1].date) : 'нет'}\n\n` +
        `Выберите действие:`;
    
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа профиля:', error);
    }
  }
  
  // Обработка личного кабинета
  async handleProfile(chatId, text, state) {
    switch(text) {
      case '📊 Статистика':
        await this.showStatistics(chatId);
        break;
        
      case '🕐 История запросов':
        await this.showSearchHistory(chatId);
        break;
        
      case '⬅️ НАЗАД':
      case '🏠 ГЛАВНОЕ МЕНЮ':
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
        break;
    }
  }
  
  // Показать статистику
  async showStatistics(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      
      let history = [];
      if (user && user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let message = `📊 *ВАША СТАТИСТИКА*\n\n`;
      
      if (history.length === 0) {
        message += `У вас пока нет истории запросов.\nНачните поиск в разделе "📰 ПОДОБРАТЬ СМИ"`;
      } else {
        message += `Всего запросов: ${history.length}\n\n`;
        message += `Последние 5 запросов:\n`;
        
        history.slice(-5).reverse().forEach((item, index) => {
          message += `${index + 1}. ${utils.formatDate(item.date)} - ${item.type.toUpperCase()}\n`;
          if (item.filters && item.filters.category) {
            message += `   Категория: ${item.filters.category}\n`;
          }
          if (item.filters && item.filters.country) {
            message += `   Страна: ${item.filters.country}\n`;
          }
          message += `   Найдено: ${item.resultsCount || 0} позиций\n\n`;
        });
      }
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа статистики:', error);
    }
  }
  
  // Показать историю поиска
  async showSearchHistory(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      
      let history = [];
      if (user && user.searchHistory) {
        try {
          if (typeof user.searchHistory === 'string') {
            history = JSON.parse(user.searchHistory);
          } else if (Array.isArray(user.searchHistory)) {
            history = user.searchHistory;
          }
        } catch (e) {
          history = [];
        }
      }
      
      let message = `📋 *ИСТОРИЯ ЗАПРОСОВ*\n\n`;
      
      if (history.length === 0) {
        message += `У вас пока нет истории запросов.`;
      } else {
        history.reverse().forEach((item, index) => {
          if (index < 10) {
            message += `${index + 1}. ${utils.formatDate(item.date)} - ${item.type.toUpperCase()}\n`;
            if (item.filters && item.filters.category) {
              message += `   Категория: ${item.filters.category}\n`;
            }
            if (item.resultsCount !== undefined) {
              message += `   Найдено: ${item.resultsCount} позиций\n`;
            }
            message += `\n`;
          }
        });
        
        if (history.length > 10) {
          message += `... и еще ${history.length - 10} запросов`;
        }
      }
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    } catch (error) {
      console.error('Ошибка показа истории:', error);
      await this.bot.sendMessage(chatId, '📋 *ИСТОРИЯ ЗАПРОСОВ*\n\nВ разработке...', {
        parse_mode: 'Markdown',
        ...keyboards.getProfileMenu()
      });
    }
  }
  
  // Показать избранное
  async showFavorites(chatId) {
    try {
      const user = await User.findOne({ where: { telegramId: chatId } });
      if (!user) return;
      
      let favorites = {};
      if (user.favorites) {
        try {
          if (typeof user.favorites === 'string') {
            favorites = JSON.parse(user.favorites);
          } else {
            favorites = user.favorites;
          }
        } catch (e) {
          favorites = { smi: [], awards: [], jury: [], associations: [] };
        }
      }
      
      const smiFavorites = favorites.smi || [];
      
      if (smiFavorites.length === 0) {
        await this.bot.sendMessage(chatId, '⭐ *ИЗБРАННОЕ*\n\nУ вас пока нет избранных позиций.\nДобавляйте их из результатов поиска кнопкой "⭐ В избранное"', {
          parse_mode: 'Markdown',
          ...keyboards.getMainMenu(this.isAdmin(chatId))
        });
        return;
      }
      
      const smiItems = await SMI.findAll({
        where: { id: smiFavorites }
      });
      
      let message = `⭐ *ВАШЕ ИЗБРАННОЕ*\n\n`;
      message += `📰 СМИ (${smiItems.length}):\n\n`;
      
      smiItems.forEach((item, index) => {
        const categoryEmoji = utils.getCategoryEmoji(item.category);
        const countryFlag = utils.getCountryFlag(item.country);
        
        message += `${index + 1}. *${item.name}*\n`;
        message += `${categoryEmoji} ${item.category} | ${countryFlag} ${item.country}\n\n`;
      });
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getMainMenu(this.isAdmin(chatId))
      });
    } catch (error) {
      console.error('Ошибка показа избранного:', error);
    }
  }
  
  // Показать контакты менеджера
  async showContactManager(chatId) {
    const message = `📞 *СВЯЗЬ С МЕНЕДЖЕРОМ*\n\n` +
      `👤 Ваш персональный менеджер: *Анна Петрова*\n` +
      `📱 +7 (XXX) XXX-XX-XX\n` +
      `✉️ anna@agency.ru\n` +
      `🕐 Пн-Пт 10:00-19:00\n\n` +
      `*Чем могу помочь:*\n` +
      `• Консультация по СМИ\n` +
      `• Уточнение стоимости\n` +
      `• Запрос медиа-кита\n` +
      `• Обновление базы данных\n` +
      `• Заказ аналитики\n\n` +
      `⬅️ *Просто напишите ваш вопрос в чат*`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  // Показать контактную информацию
  async showContactInfo(chatId, data) {
    const [_, type, itemId] = data.split('_');
    
    try {
      let item;
      switch(type) {
        case 'smi':
          item = await SMI.findByPk(parseInt(itemId));
          break;
        case 'award':
          item = await Award.findByPk(parseInt(itemId));
          break;
        default:
          item = null;
      }
      
      if (!item) {
        await this.bot.sendMessage(chatId, 'Контактная информация не найдена');
        return;
      }
      
      const message = `📞 *КОНТАКТНАЯ ИНФОРМАЦИЯ*\n\n` +
        `Название: *${item.name}*\n` +
        `Контакт: ${item.contact || 'запросить у менеджера'}\n` +
        `Сайт: ${item.website || 'не указан'}\n\n` +
        `Для получения подробной информации свяжитесь с менеджером.`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Ошибка показа контактов:', error);
    }
  }
  
  // Экспорт в CSV
  async exportToCSV(chatId, searchId) {
    const results = stateManager.getSearchResults(searchId);
    
    if (results.length === 0) {
      await this.bot.sendMessage(chatId, 'Нет данных для экспорта');
      return;
    }
    
    try {
      const csvContent = utils.convertToCSV(results);
      const fileName = `export_${chatId}_${Date.now()}.csv`;
      const filePath = `./temp_${fileName}`;
      
      fs.writeFileSync(filePath, csvContent);
      
      await this.bot.sendDocument(chatId, filePath, {}, {
        filename: fileName
      });
      
      fs.unlinkSync(filePath);
      
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      await this.bot.sendMessage(chatId, '⚠️ Произошла ошибка при экспорте');
    }
  }
  
  // ========== PR НОВОСТИ ==========
  
  // Обработка PR-новостей
  async handlePRNews(chatId, text, state) {
    const loadingMsg = await this.bot.sendMessage(chatId, '⏳ *Ищу PR-материалы...*', {
      parse_mode: 'Markdown'
    });

    try {
      let news = [];
      let title = '';

      switch(text) {
        case '📈 PR Тренды':
          news = await this.prParser.getNewsByCategory('тренд');
          title = '📈 *АКТУАЛЬНЫЕ PR-ТРЕНДЫ*';
          break;
          
        case '🎯 PR Кейсы':
          news = await this.prParser.searchPRNews('кейс');
          title = '🎯 *PR-КЕЙСЫ И ПРАКТИКИ*';
          break;
          
        case '📊 PR Аналитика':
          news = await this.prParser.searchPRNews('аналитик');
          title = '📊 *PR-АНАЛИТИКА И МЕТРИКИ*';
          break;
          
        case '🔥 Кризисные PR':
          news = await this.prParser.getNewsByCategory('кризис');
          title = '🔥 *КРИЗИСНЫЕ КОММУНИКАЦИИ*';
          break;
          
        case '🔍 Поиск PR-новостей':
          stateManager.updateState(chatId, { step: 'search' });
          await this.bot.deleteMessage(chatId, loadingMsg.message_id);
          await this.bot.sendMessage(chatId,
            '🔍 *ПОИСК PR-МАТЕРИАЛОВ*\n\n' +
            'Введите ключевые слова для поиска:\n' +
            '(например: PR, коммуникации, медиа, бренд, SMM)',
            {
              parse_mode: 'Markdown',
              reply_markup: {
                keyboard: [['🏠 Главное меню']],
                resize_keyboard: true
              }
            }
          );
          return;
          
        case '📢 Все PR-новости':
          news = await this.prParser.parsePRNews();
          title = '📢 *ВСЕ PR-НОВОСТИ*';
          break;
          
        case '⬅️ НАЗАД':
        case '🏠 Главное меню':
          stateManager.resetState(chatId);
          await this.bot.deleteMessage(chatId, loadingMsg.message_id);
          await this.bot.sendMessage(chatId, 'Главное меню:', 
            keyboards.getMainMenu(this.isAdmin(chatId)));
          return;
          
        default:
          if (state.step === 'search') {
            news = await this.prParser.searchPRNews(text);
            title = `🔍 *РЕЗУЛЬТАТЫ ПОИСКА: "${text}"*`;
            
            await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            
            if (news.length === 0) {
              await this.bot.sendMessage(chatId,
                `😔 *По запросу "${text}" ничего не найдено.*\n\n` +
                `*Попробуйте:*\n` +
                `• Другие ключевые слова\n` +
                `• Более общий запрос\n` +
                `• Посмотреть все новости`,
                {
                  parse_mode: 'Markdown',
                  ...keyboards.getAfterPRSearchMenu()
                }
              );
              stateManager.updateState(chatId, { step: 'main' });
              return;
            }
            
            let message = `${title}\n*Найдено: ${news.length} материалов*\n\n`;
            
            news.slice(0, 10).forEach((item, index) => {
              message += `${index + 1}. *${item.title}*\n`;
              message += `   📍 ${item.source} | 🏷 ${item.category}\n`;
              if (item.excerpt) {
                message += `   ${item.excerpt}\n`;
              }
              message += `   ⏰ ${item.time}\n\n`;
            });
            
            if (news.length > 10) {
              message += `*... и еще ${news.length - 10} материалов*`;
            }
            
            await this.bot.sendMessage(chatId, message, {
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
              ...keyboards.getAfterPRSearchMenu()
            });
            
            stateManager.updateState(chatId, { step: 'main' });
            return;
          }
      }

      await this.bot.deleteMessage(chatId, loadingMsg.message_id);

      if (news.length === 0) {
        await this.bot.sendMessage(chatId, 
          `😔 *По категории "${text}" пока нет материалов.*\n` +
          `*Попробуйте другие категории или используйте поиск.*`,
          {
            parse_mode: 'Markdown',
            ...keyboards.getPRNewsMenu()
          }
        );
        return;
      }

      let message = `${title}\n*Найдено: ${news.length} материалов*\n\n`;
      
      news.slice(0, 8).forEach((item, index) => {
        message += `${index + 1}. *${item.title}*\n`;
        message += `   📍 ${item.source} | 🏷 ${item.category}\n`;
        if (item.excerpt) {
          message += `   ${item.excerpt}\n`;
        }
        message += `   ⏰ ${item.time}\n\n`;
      });

      if (news.length > 8) {
        message += `*... и еще ${news.length - 8} материалов*`;
      }

      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...keyboards.getPRNewsMenu()
      });

    } catch (error) {
      console.error('Ошибка PR-новостей:', error);
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      await this.bot.sendMessage(chatId,
        '❌ *Не удалось загрузить PR-новости.*\n' +
        '*Возможные причины:*\n' +
        '• Проблемы с интернет-соединением\n' +
        '• Сайт временно недоступен\n' +
        '• Превышено время ожидания\n\n' +
        '*Попробуйте:*\n' +
        '• Проверить подключение\n' +
        '• Подождать 5 минут\n' +
        '• Выбрать другую категорию',
        {
          parse_mode: 'Markdown',
          ...keyboards.getPRNewsMenu()
        }
      );
    }
  }

  // ========== АДМИНИСТРАТОРСКИЕ МЕТОДЫ ==========
  
  // Показать админ-меню
  async showAdminMenu(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      
      const message = `⚙️ *АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
        `📊 Статистика:\n` +
        `• Пользователей: ${userCount}\n` +
        `• СМИ в базе: ${smiCount}\n\n` +
        `Выберите действие:`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        ...keyboards.getAdminMenu()
      });
    } catch (error) {
      console.error('Ошибка показа админ-меню:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка загрузки админ-панели');
    }
  }
  
  // Обработка админ-команд
  async handleAdminCommand(chatId, text) {
    switch(text) {
      case '📊 Статистика бота':
        await this.showBotStats(chatId);
        break;
        
      case '👥 Пользователи':
        await this.showUsersList(chatId);
        break;
        
      case '📰 Управление СМИ':
        await this.bot.sendMessage(chatId, '📰 *УПРАВЛЕНИЕ СМИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '🏆 Управление премиями':
        await this.bot.sendMessage(chatId, '🏆 *УПРАВЛЕНИЕ ПРЕМИЯМИ*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '📥 Экспорт данных':
        await this.handleExportData(chatId);
        break;
        
      case '🗑️ Очистить кэш':
        await this.bot.sendMessage(chatId, '🗑️ *ОЧИСТКА КЭША*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '🌐 Веб-админка':
        await this.showWebAdminInfo(chatId);
        break;
        
      case '📢 Рассылка':
        await this.bot.sendMessage(chatId, '📢 *РАССЫЛКА*\n\nФункционал в разработке', {
          parse_mode: 'Markdown'
        });
        break;
        
      case '⚙️ АДМИН-ПАНЕЛЬ':
        await this.showAdminMenu(chatId);
        break;
        
      case '🏠 Главное меню':
        stateManager.resetState(chatId);
        await this.bot.sendMessage(chatId, 'Главное меню:', 
          keyboards.getMainMenu(this.isAdmin(chatId)));
        break;
        
      case '🔙 Назад в админку':
        await this.showAdminMenu(chatId);
        break;
        
      default:
        await this.bot.sendMessage(chatId, `🔧 Команда "${text}" пока не реализована.`);
    }
  }
  
  // Показать статистику бота
  async showBotStats(chatId) {
    try {
      const userCount = await User.count();
      const smiCount = await SMI.count();
      const awardCount = await Award.count();
      const juryCount = await Jury.count();
      const associationCount = await Association.count();
      
      const message = `📊 *СТАТИСТИКА БОТА*\n\n` +
        `👥 Пользователей: ${userCount}\n` +
        `📰 СМИ в базе: ${smiCount}\n` +
        `🏆 Премий: ${awardCount}\n` +
        `👨‍⚖️ Экспертов: ${juryCount}\n` +
        `🤝 Ассоциаций: ${associationCount}\n\n` +
        `🕒 Время сервера: ${new Date().toLocaleString()}`;
      
      await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Ошибка статистики:', error);
      await this.bot.sendMessage(chatId, '⚠️ Ошибка получения статистики');
    }
  }
  
  // Показать список пользователей
  async showUsersList(chatId) {
    try {
      console.log('🔄 Получаем список пользователей...');
      
      // Получаем пользователей
      const users = await User.findAll({
        order: [['createdAt', 'DESC']],
        limit: 10
      });
      
      console.log(`✅ Найдено пользователей: ${users.length}`);
      
      // Получаем общее количество
      const totalUsers = await User.count();
      
      let message = `👥 ПОСЛЕДНИЕ ПОЛЬЗОВАТЕЛИ (10 из ${totalUsers})\n\n`;
      
      if (users.length === 0) {
        message += `Нет зарегистрированных пользователей`;
      } else {
        users.forEach((user, index) => {
          // Дата регистрации
          const date = user.createdAt ? 
            new Date(user.createdAt).toLocaleDateString('ru-RU') : 'неизвестно';
          
          // Безопасное получение количества запросов
          let searches = 0;
          if (user.searchHistory) {
            try {
              if (typeof user.searchHistory === 'string') {
                const parsed = JSON.parse(user.searchHistory);
                searches = Array.isArray(parsed) ? parsed.length : 0;
              } else if (Array.isArray(user.searchHistory)) {
                searches = user.searchHistory.length;
              } else if (typeof user.searchHistory === 'number') {
                searches = user.searchHistory;
              }
            } catch (e) {
              searches = 0;
            }
          }
          
          // Экранируем специальные символы Markdown
          let name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          if (!name) name = 'Без имени';
          
          // Экранируем символы Markdown
          name = name.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
          
          let username = user.username ? `@${user.username}` : 'нет username';
          username = username.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
          
          message += `${index + 1}. ${name}\n`;
          message += `   ${username}\n`;
          message += `   ID: ${user.telegramId}\n`;
          message += `   Запросов: ${searches}\n`;
          message += `   Регистрация: ${date}\n\n`;
        });
      }
      
      // Отправляем БЕЗ parse_mode: 'Markdown'
      await this.bot.sendMessage(chatId, message);
      
      console.log('✅ Список пользователей отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка списка пользователей:');
      console.error('Сообщение:', error.message);
      console.error('Stack:', error.stack);
      
      // Отправляем простой текст без Markdown
      await this.bot.sendMessage(chatId, 
        `⚠️ Ошибка получения списка пользователей.\n\n` +
        `Ошибка: ${error.message}\n\n` +
        `Проверьте логи бота.`
      );
    }
  }
  
  // Показать информацию о веб-админке
  async showWebAdminInfo(chatId) {
    const message = `🌐 *ВЕБ-АДМИНИСТРАТОРСКАЯ ПАНЕЛЬ*\n\n` +
      `🔗 *Локальный доступ:*\n` +
      `\`http://localhost:3000/admin\`\n\n` +
      `🔐 *Пароль:* \`admin123\`\n\n` +
      `📋 *Возможности:*\n` +
      `• Загрузка CSV файлов\n` +
      `• Массовое добавление данных\n` +
      `• Просмотр полной статистики\n` +
      `• Управление всей базой данных\n\n` +
      `🌍 *Для внешнего доступа:*\n` +
      `1. Установите ngrok: \`npm install -g ngrok\`\n` +
      `2. Запустите: \`ngrok http 3000\`\n` +
      `3. Получите ссылку вида https://abcd1234.ngrok.io\n` +
      `4. Отправьте заказчику ссылку и пароль`;
    
    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    });
  }
  
  // Экспорт данных
  async handleExportData(chatId) {
    try {
      console.log('📥 Запрос на экспорт данных от', chatId);
      
      // Показываем сообщение о начале экспорта
      const loadingMsg = await this.bot.sendMessage(chatId, 
        '🔄 *Подготавливаю данные для экспорта...*\n\n' +
        'Пожалуйста, подождите...',
        { parse_mode: 'Markdown' }
      );
      
      // Получаем все СМИ из базы
      const smiList = await SMI.findAll({
        attributes: ['name', 'category', 'country', 'audience', 'audienceNumber', 'price', 'contact', 'website', 'description', 'backdated'],
        order: [['name', 'ASC']]
      });
      
      console.log(`📊 Найдено СМИ для экспорта: ${smiList.length}`);
      
      if (smiList.length === 0) {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
        await this.bot.sendMessage(chatId, 
          '📭 *В базе нет данных для экспорта*\n\n' +
          'Добавьте СМИ через админ-панель или импорт CSV.',
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // Создаем CSV контент
      const headers = [
        'Название', 'Категория', 'Страна', 'Аудитория', 
        'Число аудитории', 'Цена (руб)', 'Контакты', 'Сайт', 
        'Описание', 'Backdated'
      ];
      
      let csvContent = headers.join(';') + '\n';
      
      smiList.forEach(smi => {
        const row = [
          `"${(smi.name || '').replace(/"/g, '""')}"`,
          `"${smi.category || ''}"`,
          `"${smi.country || ''}"`,
          `"${smi.audience || ''}"`,
          smi.audienceNumber || 0,
          smi.price || 0,
          `"${smi.contact || ''}"`,
          `"${smi.website || ''}"`,
          `"${(smi.description || '').replace(/"/g, '""')}"`,
          smi.backdated ? 'Да' : 'Нет'
        ];
        csvContent += row.join(';') + '\n';
      });
      
      // Создаем временный файл
      const fileName = `smi_export_${new Date().toISOString().split('T')[0]}_${Date.now()}.csv`;
      const filePath = `./temp_${fileName}`;
      
      fs.writeFileSync(filePath, '\uFEFF' + csvContent, 'utf8'); // BOM для корректного отображения кириллицы
      
      // Удаляем сообщение о загрузке
      await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      
      // Отправляем файл
      await this.bot.sendDocument(
        chatId,
        filePath,
        {},
        {
          filename: fileName,
          caption: `📥 *ЭКСПОРТ ДАННЫХ СМИ*\n\n` +
                   `✅ Успешно экспортировано: *${smiList.length}* записей\n` +
                   `📅 Дата экспорта: ${new Date().toLocaleDateString('ru-RU')}\n` +
                   `📊 Формат: CSV (разделитель - точка с запятой)\n\n` +
                   `*Столбцы файла:*\n` +
                   `• Название, Категория, Страна\n` +
                   `• Аудитория, Число аудитории\n` +
                   `• Цена, Контакты, Сайт\n` +
                   `• Описание, Backdated`,
          parse_mode: 'Markdown'
        }
      );
      
      console.log(`✅ Файл экспортирован: ${fileName}, ${smiList.length} записей`);
      
      // Удаляем временный файл
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Временный файл удален: ${filePath}`);
        }
      }, 5000);
      
    } catch (error) {
      console.error('❌ Ошибка экспорта данных:', error);
      
      // Пытаемся отправить сообщение об ошибке
      try {
        await this.bot.sendMessage(chatId,
          '❌ *ОШИБКА ЭКСПОРТА ДАННЫХ*\n\n' +
          'Не удалось подготовить файл экспорта.\n\n' +
          'Возможные причины:\n' +
          '• Проблемы с доступом к базе данных\n' +
          '• Ошибка при формировании CSV\n' +
          '• Недостаточно памяти\n\n' +
          'Проверьте логи бота для подробностей.',
          { parse_mode: 'Markdown' }
        );
      } catch (sendError) {
        console.error('Не удалось отправить сообщение об ошибке:', sendError);
      }
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
  
  // === ДОБАВЛЕНО: ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ===
  initDatabase().then(() => {
    console.log('✅ База данных готова к работе');
    
    const prBot = new PRBot(useWebhook);
    
    if (useWebhook) {
      console.log("🚀 Запуск бота в режиме вебхука...");
      prBot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log("✅ Бот запущен в режиме вебхука!");
    } else {
      console.log("✅ Бот успешно запущен локально (polling)!");
      
      console.log("🔄 Запуск админ-панели...");
      try {
        const admin = require('./admin.js');
        admin.start();
        console.log("✅ Админ-панель запущена!");
      } catch (error) {
        console.log("❌ Не удалось запустить админ-панель:");
        console.log("   Ошибка:", error.message);
      }
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
  // ===========================================
} else {
  module.exports = PRBot;
}