// Главное меню (с возможностью добавления админ-кнопки)
function getMainMenu(isAdmin = false) {
  const keyboard = [
    [{ text: "📰 ПОДОБРАТЬ СМИ" }, { text: "📢 PR НОВОСТИ" }], // ← ДОБАВИЛИ КНОПКУ
    [{ text: "🏆 ПРЕМИИ" }],
    [{ text: "👨‍⚖️ ЖЮРИ" }, { text: "🤝 АССОЦИАЦИИ" }],
    [{ text: "⭐ ИЗБРАННОЕ" }, { text: "👤 ЛИЧНЫЙ КАБИНЕТ" }],
    [{ text: "📞 СВЯЗАТЬСЯ С МЕНЕДЖЕРОМ" }]
  ];
  
  // Добавляем админ-кнопку ТОЛЬКО для администраторов
  if (isAdmin) {
    keyboard.unshift([{ text: "⚙️ АДМИН-ПАНЕЛЬ" }]);
  }
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
}

// Админ-меню
function getAdminMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Статистика бота" }, { text: "👥 Пользователи" }],
        [{ text: "📰 Управление СМИ" }, { text: "🏆 Управление премиями" }],
        [{ text: "📥 Экспорт данных" }, { text: "🗑️ Очистить кэш" }],
        [{ text: "🌐 Веб-админка" }, { text: "📢 Рассылка" }],
        [{ text: "🏠 Главное меню" }]
      ],
      resize_keyboard: true
    }
  };
}

// Категории СМИ
function getSMICategories() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📰 Бизнес" }, { text: "💻 IT" }],
        [{ text: "💰 Финансы" }, { text: "📰 Новости" }],
        [{ text: "🎭 Культура" }, { text: "🏥 Здоровье" }],
        [{ text: "🚀 Технологии" }, { text: "🛒 Розница" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Страны
function getCountries() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🇷🇺 Россия" }, { text: "🇺🇸 США" }],
        [{ text: "🇬🇧 Великобритания" }, { text: "🇩🇪 Германия" }],
        [{ text: "🇫🇷 Франция" }, { text: "🇨🇳 Китай" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Опции backdated
function getBackdatedOptions() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "✅ Да" }, { text: "❌ Нет" }],
        [{ text: "⚠️ Не важно" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Опции аудитории
function getAudienceOptions() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "👥 До 100К" }, { text: "👥 100К - 500К" }],
        [{ text: "👥 500К - 1М" }, { text: "👥 1М - 5М" }],
        [{ text: "👥 5М+" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Меню профиля
function getProfileMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Статистика" }, { text: "🕐 История запросов" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Категории премий
function getAwardCategories() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🎭 Культура" }, { text: "🏥 Здоровье" }],
        [{ text: "🚀 Технологии" }, { text: "🛒 Розница" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// Пагинация
function getPagination(currentPage, totalPages, searchId) {
  const buttons = [];
  
  if (currentPage > 1) {
    buttons.push({ text: "◀️ Назад", callback_data: `page_${searchId}_${currentPage - 1}` });
  }
  
  buttons.push({ text: `${currentPage}/${totalPages}`, callback_data: 'current' });
  
  if (currentPage < totalPages) {
    buttons.push({ text: "Вперед ▶️", callback_data: `page_${searchId}_${currentPage + 1}` });
  }
  
  return {
    reply_markup: {
      inline_keyboard: [
        buttons,
        [
          { text: "⭐ В избранное", callback_data: `fav_smi_${searchId}` },
          { text: "📞 Контакты", callback_data: `contact_smi_${searchId}` }
        ],
        [
          { text: "📥 Экспорт в CSV", callback_data: `export_${searchId}` },
          { text: "🔄 Новый поиск", callback_data: 'new_search' }
        ]
      ]
    }
  };
}

// Уведомление о закрытии
function getCloseNotification() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "❌ Закрыть", callback_data: 'close_notification' }]
      ]
    }
  };
}

// ПР Новости - меню раздела
function getPRNewsMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📈 PR Тренды" }, { text: "🎯 PR Кейсы" }],
        [{ text: "📊 PR Аналитика" }, { text: "🔥 Кризисные PR" }],
        [{ text: "🔍 Поиск PR-новостей" }],
        [{ text: "⬅️ НАЗАД" }, { text: "🏠 ГЛАВНОЕ МЕНЮ" }]
      ],
      resize_keyboard: true
    }
  };
}

// ПР Новости - после поиска
function getAfterPRSearchMenu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🔍 Новый поиск" }, { text: "📈 PR Тренды" }],
        [{ text: "📢 Все PR-новости" }, { text: "🏠 Главное меню" }]
      ],
      resize_keyboard: true
    }
  };
}

module.exports = {
  getMainMenu,
  getAdminMenu,
  getSMICategories,
  getCountries,
  getBackdatedOptions,
  getAudienceOptions,
  getProfileMenu,
  getAwardCategories,
  getPagination,
  getCloseNotification,
  getPRNewsMenu,          // ← ДОБАВИЛИ
  getAfterPRSearchMenu    // ← ДОБАВИЛИ
};