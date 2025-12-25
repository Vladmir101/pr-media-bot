const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

// На Render используем SQLite в памяти, локально — файл
const storagePath = process.env.NODE_ENV === 'production' 
  ? ':memory:'  // В памяти для Render (данные теряются при перезапуске)
  : path.join(__dirname, 'database.db');  // Локально для разработки

// Инициализация базы данных
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: storagePath,
  logging: false
});

// Модель пользователя
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  telegramId: {
    type: DataTypes.BIGINT,
    unique: true,
    allowNull: false
  },
  username: DataTypes.STRING,
  firstName: DataTypes.STRING,
  lastName: DataTypes.STRING,
  phone: DataTypes.STRING,
  email: DataTypes.STRING,
  company: DataTypes.STRING,
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  favorites: {
    type: DataTypes.JSON,
    defaultValue: {
      smi: [],
      awards: [],
      jury: [],
      associations: []
    }
  },
  searchHistory: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
});

// Модель СМИ
const SMI = sequelize.define('SMI', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  country: DataTypes.STRING,
  backdated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  audience: DataTypes.STRING,
  audienceNumber: DataTypes.INTEGER,
  contact: DataTypes.STRING,
  price: DataTypes.INTEGER,
  description: DataTypes.TEXT,
  website: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  }
});

// Модель премий
const Award = sequelize.define('Award', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: DataTypes.STRING,
  location: DataTypes.STRING,
  deadline: DataTypes.DATE,
  fee: DataTypes.INTEGER,
  prize: DataTypes.STRING,
  description: DataTypes.TEXT,
  website: DataTypes.STRING,
  contact: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

// Модель жюри
const Jury = sequelize.define('Jury', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: DataTypes.STRING,
  expertise: DataTypes.STRING,
  location: DataTypes.STRING,
  fee: DataTypes.INTEGER,
  description: DataTypes.TEXT,
  contact: DataTypes.STRING,
  website: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

// Модель ассоциаций
const Association = sequelize.define('Association', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: DataTypes.STRING,
  members: DataTypes.INTEGER,
  location: DataTypes.STRING,
  fee: DataTypes.INTEGER,
  benefits: DataTypes.TEXT,
  contact: DataTypes.STRING,
  website: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

// Модель поисковых запросов
const SearchQuery = sequelize.define('SearchQuery', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: DataTypes.INTEGER,
  type: DataTypes.STRING,
  filters: DataTypes.JSON,
  resultsCount: DataTypes.INTEGER,
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
});

// Функция инициализации базы данных
async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к базе данных установлено');
    
    // Синхронизация моделей
    await sequelize.sync({ force: false });
    console.log('✅ Модели синхронизированы');
    
    // Создаем тестовые данные, если таблица СМИ пуста
    const smiCount = await SMI.count();
    if (smiCount === 0) {
      console.log('📝 Создаю тестовые данные...');
      await createTestData();
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации базы данных:', error);
    return false;
  }
}

// Функция для поиска СМИ
async function findSMI(filters) {
  const whereClause = { isActive: true };
  
  if (filters.category) whereClause.category = filters.category;
  if (filters.country && filters.country !== 'Все страны') whereClause.country = filters.country;
  
  if (filters.backdated === 'Да') whereClause.backdated = true;
  else if (filters.backdated === 'Нет') whereClause.backdated = false;
  // Если 'Не важно' или null - не фильтруем
  
  if (filters.audience) {
    switch(filters.audience) {
      case '👥 До 100 тыс.':
        whereClause.audienceNumber = { [Op.lte]: 100000 };
        break;
      case '👥👥 100к - 1 млн':
        whereClause.audienceNumber = { 
          [Op.gt]: 100000,
          [Op.lte]: 1000000 
        };
        break;
      case '👥👥👥 Более 1 млн':
        whereClause.audienceNumber = { [Op.gt]: 1000000 };
        break;
      // '🌐 Любой охват' - не фильтруем
    }
  }
  
  const results = await SMI.findAll({
    where: whereClause,
    limit: 50,
    order: [['audienceNumber', 'DESC']]
  });
  
  return results;
}

// Создание тестовых данных
async function createTestData() {
  const testData = [
    {
      name: 'Forbes Россия',
      category: 'Бизнес',
      country: 'Россия',
      backdated: false,
      audience: '2.1M',
      audienceNumber: 2100000,
      contact: 'contact@forbes.ru',
      price: 100000,
      description: 'ТОП-деловое СМИ',
      website: 'https://forbes.ru'
    },
    {
      name: 'VC.ru',
      category: 'IT',
      country: 'Россия',
      backdated: true,
      audience: '850K',
      audienceNumber: 850000,
      contact: 'pr@vc.ru',
      price: 75000,
      description: 'Tech-аудитория',
      website: 'https://vc.ru'
    },
    {
      name: 'Bloomberg',
      category: 'Финансы',
      country: 'США',
      backdated: false,
      audience: '5M+',
      audienceNumber: 5000000,
      contact: 'media@bloomberg.com',
      price: 200000,
      description: 'Международное финансовое СМИ',
      website: 'https://bloomberg.com'
    },
    {
      name: 'Коммерсантъ',
      category: 'Финансы',
      country: 'Россия',
      backdated: true,
      audience: '1.2M',
      audienceNumber: 1200000,
      contact: 'info@kommersant.ru',
      price: 90000,
      description: 'Деловые новости',
      website: 'https://kommersant.ru'
    },
    {
      name: 'ТАСС',
      category: 'Новости',
      country: 'Россия',
      backdated: false,
      audience: '3M',
      audienceNumber: 3000000,
      contact: 'press@tass.ru',
      price: 150000,
      description: 'Федеральное информационное агентство',
      website: 'https://tass.ru'
    }
  ];
  
  await SMI.bulkCreate(testData);
  console.log(`✅ Создано ${testData.length} тестовых записей СМИ`);
}
const fs = require('fs');
const csv = require('csv-parser');

// Функция для импорта данных из CSV в таблицу SMI
async function importSMIFromCSV(filePath) {
  return new Promise((resolve, reject) => {
    const smiRecords = [];
    
    console.log(`📁 Загружаем данные из CSV: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Файл не найден: ${filePath}`);
      return reject(new Error('Файл не найден'));
    }
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Очищаем и преобразуем данные
        const record = {
          name: row.name ? row.name.trim() : '',
          category: row.category ? row.category.trim() : '',
          country: row.country ? row.country.trim() : '',
          backdated: row.backdated ? row.backdated.toLowerCase() === 'true' : false,
          audience: row.audience ? row.audience.trim() : '0',
          audienceNumber: parseInt(row.audienceNumber || row.audience || '0') || 0,
          contact: row.contact ? row.contact.trim() : '',
          price: parseInt(row.price || '0') || 0,
          description: row.description ? row.description.trim() : '',
          website: row.website ? row.website.trim() : '',
          isActive: true
        };
        
        // Обрабатываем audience если audienceNumber не указан
        if (!row.audienceNumber && row.audience) {
          const audienceStr = row.audience.toString().toUpperCase();
          if (audienceStr.includes('M') || audienceStr.includes('М')) {
            record.audienceNumber = parseInt(audienceStr.replace(/[^0-9.]/g, '')) * 1000000;
          } else if (audienceStr.includes('K') || audienceStr.includes('К')) {
            record.audienceNumber = parseInt(audienceStr.replace(/[^0-9.]/g, '')) * 1000;
          } else {
            record.audienceNumber = parseInt(audienceStr.replace(/[^0-9]/g, '')) || 0;
          }
        }
        
        smiRecords.push(record);
      })
      .on('end', async () => {
        console.log(`✅ Прочитано ${smiRecords.length} записей из CSV`);
        
        try {
          // Вставляем записи в базу данных
          let importedCount = 0;
          let updatedCount = 0;
          
          for (const record of smiRecords) {
            // Проверяем, существует ли уже запись с таким именем
            const existing = await SMI.findOne({ 
              where: { name: record.name } 
            });
            
            if (existing) {
              // Обновляем существующую запись
              await existing.update(record);
              updatedCount++;
            } else {
              // Создаем новую запись
              await SMI.create(record);
              importedCount++;
            }
          }
          
          console.log(`📊 Импорт завершен:`);
          console.log(`   ✅ Добавлено новых: ${importedCount}`);
          console.log(`   🔄 Обновлено существующих: ${updatedCount}`);
          console.log(`   📈 Всего в базе: ${await SMI.count()} записей`);
          
          resolve({ imported: importedCount, updated: updatedCount, total: smiRecords.length });
        } catch (error) {
          console.error('❌ Ошибка при сохранении в базу:', error);
          reject(error);
        }
      })
      .on('error', (error) => {
        console.error('❌ Ошибка чтения CSV:', error);
        reject(error);
      });
  });
}

// Функция для экспорта данных SMI в CSV
async function exportSMIToCSV(filePath) {
  try {
    const allSMI = await SMI.findAll({
      where: { isActive: true },
      order: [['category', 'ASC'], ['name', 'ASC']]
    });
    
    if (allSMI.length === 0) {
      console.log('❌ Нет данных для экспорта');
      return false;
    }
    
    // Создаем CSV заголовок
    const headers = ['name', 'category', 'country', 'backdated', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website'];
    let csvContent = headers.join(',') + '\n';
    
    // Добавляем данные
    allSMI.forEach(smi => {
      const row = [
        `"${smi.name.replace(/"/g, '""')}"`,
        `"${smi.category.replace(/"/g, '""')}"`,
        `"${smi.country ? smi.country.replace(/"/g, '""') : ''}"`,
        smi.backdated ? 'true' : 'false',
        `"${smi.audience ? smi.audience.replace(/"/g, '""') : ''}"`,
        smi.audienceNumber || 0,
        `"${smi.contact ? smi.contact.replace(/"/g, '""') : ''}"`,
        smi.price || 0,
        `"${smi.description ? smi.description.replace(/"/g, '""') : ''}"`,
        `"${smi.website ? smi.website.replace(/"/g, '""') : ''}"`
      ];
      
      csvContent += row.join(',') + '\n';
    });
    
    // Сохраняем в файл
    fs.writeFileSync(filePath, csvContent, 'utf8');
    console.log(`✅ Экспортировано ${allSMI.length} записей в ${filePath}`);
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка экспорта в CSV:', error);
    return false;
  }
}

// Функция для синхронизации CSV с базой данных
async function syncCSVWithDatabase(csvFilePath) {
  console.log('🔄 Синхронизация CSV с базой данных...');
  
  try {
    const result = await importSMIFromCSV(csvFilePath);
    
    // Также экспортируем обновленные данные обратно в CSV
    await exportSMIToCSV(csvFilePath);
    
    console.log('✅ Синхронизация завершена');
    return result;
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
    throw error;
  }
}

// Функция для поиска по CSV-подобным фильтрам
async function searchSMILikeCSV(filters = {}) {
  const whereClause = { isActive: true };
  
  // Поддерживаем все те же фильтры что и в findSMI
  if (filters.category) whereClause.category = { [Op.like]: `%${filters.category}%` };
  if (filters.country && filters.country !== 'Все страны') whereClause.country = { [Op.like]: `%${filters.country}%` };
  
  if (filters.name) whereClause.name = { [Op.like]: `%${filters.name}%` };
  
  if (filters.backdated === 'Да') whereClause.backdated = true;
  else if (filters.backdated === 'Нет') whereClause.backdated = false;
  
  // Фильтр по цене (бюджет)
  if (filters.maxPrice) {
    const maxPrice = parseInt(filters.maxPrice);
    if (!isNaN(maxPrice)) {
      whereClause.price = { [Op.lte]: maxPrice };
    }
  }
  
  // Фильтр по аудитории
  if (filters.minAudience) {
    const minAudience = parseInt(filters.minAudience);
    if (!isNaN(minAudience)) {
      whereClause.audienceNumber = { [Op.gte]: minAudience };
    }
  }
  
  const results = await SMI.findAll({
    where: whereClause,
    limit: filters.limit || 50,
    order: [
      filters.sortBy === 'price' ? ['price', filters.sortOrder || 'ASC'] : 
      filters.sortBy === 'audience' ? ['audienceNumber', filters.sortOrder || 'DESC'] :
      ['name', 'ASC']
    ]
  });
  
  return results;
}

module.exports = {
  sequelize,
  User,
  SMI,
  Award,
  Jury,
  Association,
  SearchQuery,
  initDatabase,
  findSMI,
  // Новые функции для работы с CSV
  importSMIFromCSV,
  exportSMIToCSV,
  syncCSVWithDatabase,
  searchSMILikeCSV
};