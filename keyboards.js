// keyboards.js - Клавиатуры для Telegram бота MediaPro

// ================================
// РЕПЛИКАТУРЫ (ОСНОВНЫЕ МЕНЮ)
// ================================

// Главное меню
function getMainMenu(isAdmin = false) {
  const menu = {
    reply_markup: {
      keyboard: [
        [{ text: '📰 ПОДОБРАТЬ СМИ' }],
        [{ text: '🏆 ПРЕМИИ' }],
        [
          { text: '👨‍⚖️ ЖЮРИ' },
          { text: '🤝 АССОЦИАЦИИ' }
        ],
        [
          { text: '⭐ ИЗБРАННОЕ' },
          { text: '👤 ЛИЧНЫЙ КАБИНЕТ' }
        ],
        [{ text: '📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ' }]
      ],
      resize_keyboard: true
    }
  };

  if (isAdmin) {
    menu.reply_markup.keyboard.push([{ text: '⚙️ АДМИН-ПАНЕЛЬ' }]);
  }

  return menu;
}

// Личный кабинет / профиль
function getProfileMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Моя статистика' }],
        [{ text: '⭐ Избранное' }],
        [{ text: '⚙️ Настройки' }],
        [{ text: '🔙 На главную' }]
      ],
      resize_keyboard: true
    }
  };
}

// Меню выбора типа поиска
function getSearchTypeMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📰 Поиск по СМИ' }],
        [{ text: '🎯 Поиск по тегам' }],
        [{ text: '🌍 Поиск по регионам' }],
        [{ text: '🔙 Назад' }]
      ],
      resize_keyboard: true
    }
  };
}

// Категории СМИ для поиска
function getSMICategories() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '⚡ Быстрый поиск' }],
        [{ text: '🔍 Расширенный поиск' }],
        [{ text: '🏆 Премии и конкурсы' }],
        [{ text: '🔙 Назад' }]
      ],
      resize_keyboard: true
    }
  };
}

// Быстрый поиск - топ категории
function getQuickSearchCategories() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '🔥 ТОП Business' }],
        [{ text: '📱 ТОП Tech & Startups' }],
        [{ text: '💰 ТОП Finance' }],
        [{ text: '🌿 ТОП Lifestyle & Eco' }],
        [{ text: '🔙 Назад' }]
      ],
      resize_keyboard: true
    }
  };
}

// Клавиатура с кнопкой "Назад"
function getBackKeyboard() {
  return {
    reply_markup: {
      keyboard: [[{ text: '🔙 Назад' }]],
      resize_keyboard: true
    }
  };
}

// ИНЛАЙН КЛАВИАТУРЫ
// ================================

// Пагинация для результатов поиска
function getPaginationKeyboard(currentPage, totalPages, queryId = '') {
  const buttons = [];
  
  if (currentPage > 1) {
    buttons.push({
      text: '◀️ Назад',
      callback_data: `page_${currentPage - 1}_${queryId}`
    });
  }
  
  buttons.push({
    text: `${currentPage}/${totalPages}`,
    callback_data: 'current_page'
  });
  
  if (currentPage < totalPages) {
    buttons.push({
      text: 'Вперед ▶️',
      callback_data: `page_${currentPage + 1}_${queryId}`
    });
  }
  
  return {
    reply_markup: {
      inline_keyboard: [buttons]
    }
  };
}

// Кнопки действий для СМИ
function getSMIActionsKeyboard(smiId, isFavorite = false) {
  const favoriteText = isFavorite ? '❌ Удалить из избранного' : '⭐ Добавить в избранное';
  
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: favoriteText,
            callback_data: `toggle_fav_${smiId}`
          }
        ],
        [
          {
            text: '📞 Контакты',
            callback_data: `contacts_${smiId}`
          },
          {
            text: '🌐 Сайт',
            callback_data: `website_${smiId}`
          }
        ]
      ]
    }
  };
}

// Админ-панель
function getAdminPanel() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: '📊 Статистика' }],
        [{ text: '📁 Импорт CSV' }],
        [{ text: '📢 Рассылка' }],
        [{ text: '🔙 На главную' }]
      ],
      resize_keyboard: true
    }
  };
}

// Экспорт всех функций
module.exports = {
  getMainMenu,
  getProfileMenu,        // Добавлено
  getSearchTypeMenu,     // Добавлено
  getSMICategories,
  getQuickSearchCategories,
  getBackKeyboard,
  getPaginationKeyboard,
  getSMIActionsKeyboard,
  getAdminPanel
};