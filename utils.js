class Utils {
  // Форматирование числа с разделителями
  formatNumber(number) {
    if (!number) return '0';
    return number.toLocaleString('ru-RU');
  }

  // Форматирование даты
  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'неизвестно';
    }
  }

  // Конвертация в CSV
  convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0].dataValues || data[0]);
    const rows = data.map(item => {
      const values = headers.map(header => {
        let value = item[header] || item.dataValues?.[header] || '';
        // Экранируем кавычки и запятые
        if (typeof value === 'string') {
          value = value.replace(/"/g, '""');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
          }
        }
        return value;
      });
      return values.join(',');
    });
    
    return [headers.join(','), ...rows].join('\n');
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
      'education': '🎓'
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
      'china': '🇨🇳'
    };
    
    const countryLower = country.toLowerCase();
    for (const [key, flag] of Object.entries(flagMap)) {
      if (countryLower.includes(key)) {
        return flag;
      }
    }
    
    return '🌍';
  }

  // Получение эмодзи для аудитории
  getAudienceEmoji(audienceNumber) {
    if (!audienceNumber) return '👥';
    
    if (audienceNumber >= 1000000) return '👑';
    if (audienceNumber >= 500000) return '🔥';
    if (audienceNumber >= 100000) return '⭐';
    return '👥';
  }

  // Очистка текста от лишних символов
  cleanText(text) {
    if (!text) return '';
    return text.replace(/"/g, '').trim();
  }

  // Сокращение текста
  truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

module.exports = new Utils();
   