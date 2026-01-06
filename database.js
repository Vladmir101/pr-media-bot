const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

// ========== КОНФИГУРАЦИЯ БАЗЫ ДАННЫХ ==========
// Для Render используем PostgreSQL, локально — SQLite
let sequelize;

if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
  // PostgreSQL для продакшена (Render)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false
  });
  console.log('📊 Используется PostgreSQL (Render)');
} else {
  // SQLite для локальной разработки
  const storagePath = path.join(__dirname, 'database.db');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: storagePath,
    logging: false
  });
  console.log('📊 Используется SQLite (локально)');
}

// ========== МОДЕЛИ БАЗЫ ДАННЫХ ==========

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
  username: DataTypes.STRING(100),
  firstName: DataTypes.STRING(100),
  lastName: DataTypes.STRING(100),
  phone: DataTypes.STRING(50),
  email: DataTypes.STRING(150),
  company: DataTypes.STRING(200),
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

// Модель СМИ - ИСПРАВЛЕНО: используем TEXT для длинных полей
const SMI = sequelize.define('SMI', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.TEXT, // Вместо STRING используем TEXT для длинных названий
    allowNull: false
  },
  category: {
    type: DataTypes.TEXT, // TEXT вместо STRING
    allowNull: false
  },
  country: DataTypes.TEXT, // TEXT вместо STRING
  backdated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  audience: DataTypes.TEXT, // TEXT вместо STRING
  audienceNumber: DataTypes.BIGINT, // BIGINT для больших чисел
  contact: DataTypes.TEXT, // TEXT вместо STRING
  price: DataTypes.BIGINT, // BIGINT для больших сумм
  description: DataTypes.TEXT, // TEXT для длинных описаний
  website: DataTypes.TEXT, // TEXT вместо STRING
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  // Дополнительные поля из CSV
  language: DataTypes.TEXT,
  mediaType: DataTypes.TEXT,
  frequency: DataTypes.TEXT,
  coverage: DataTypes.TEXT,
  editorialPolicies: DataTypes.TEXT,
  socialMedia: DataTypes.TEXT,
  metrics: DataTypes.TEXT,
  specialFeatures: DataTypes.TEXT
}, {
  timestamps: true,
  tableName: 'smis',
  indexes: [
    { fields: ['name'] },
    { fields: ['category'] },
    { fields: ['country'] },
    { fields: ['backdated'] },
    { fields: ['isActive'] }
  ]
});

// Модель премий
const Award = sequelize.define('Award', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: DataTypes.TEXT,
  location: DataTypes.TEXT,
  deadline: DataTypes.DATE,
  fee: DataTypes.BIGINT,
  prize: DataTypes.TEXT,
  description: DataTypes.TEXT,
  website: DataTypes.TEXT,
  contact: DataTypes.TEXT,
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
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: DataTypes.TEXT,
  expertise: DataTypes.TEXT,
  location: DataTypes.TEXT,
  fee: DataTypes.BIGINT,
  description: DataTypes.TEXT,
  contact: DataTypes.TEXT,
  website: DataTypes.TEXT,
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
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: DataTypes.TEXT,
  members: DataTypes.BIGINT,
  location: DataTypes.TEXT,
  fee: DataTypes.BIGINT,
  benefits: DataTypes.TEXT,
  contact: DataTypes.TEXT,
  website: DataTypes.TEXT,
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
  type: DataTypes.STRING(50),
  filters: DataTypes.JSON,
  resultsCount: DataTypes.INTEGER,
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: Sequelize.NOW
  }
});

// ========== ФУНКЦИИ РАБОТЫ С БАЗОЙ ==========

// Инициализация базы данных
async function initDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Подключение к базе данных установлено');
    
    // Синхронизация моделей (force: false - не удалять существующие данные)
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

// УДАЛЕНИЕ и пересоздание таблицы smis с правильными типами
async function recreateSMITable() {
  try {
    console.log('🔄 Пересоздаю таблицу smis с правильными типами...');
    
    // Удаляем таблицу если существует
    await sequelize.query('DROP TABLE IF EXISTS smis CASCADE');
    
    // Ждем немного
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Создаем таблицу заново
    await sequelize.sync({ force: true });
    
    console.log('✅ Таблица smis пересоздана с типами TEXT');
    return true;
  } catch (error) {
    console.error('❌ Ошибка пересоздания таблицы:', error);
    return false;
  }
}

// Поиск СМИ по фильтрам
async function findSMI(filters) {
  const whereClause = { isActive: true };
  
  if (filters.category) whereClause.category = filters.category;
  if (filters.country && filters.country !== 'Все страны') whereClause.country = filters.country;
  
  if (filters.backdated === 'Да') whereClause.backdated = true;
  else if (filters.backdated === 'Нет') whereClause.backdated = false;
  
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

// ========== CSV ФУНКЦИИ ==========
const fs = require('fs');
const csv = require('csv-parser');

// Импорт данных из CSV
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
        // Парсим все возможные поля из CSV
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
          isActive: true,
          // Дополнительные поля
          language: row.language ? row.language.trim() : '',
          mediaType: row.mediaType ? row.mediaType.trim() : '',
          frequency: row.frequency ? row.frequency.trim() : '',
          coverage: row.coverage ? row.coverage.trim() : '',
          editorialPolicies: row.editorialPolicies ? row.editorialPolicies.trim() : '',
          socialMedia: row.socialMedia ? row.socialMedia.trim() : '',
          metrics: row.metrics ? row.metrics.trim() : '',
          specialFeatures: row.specialFeatures ? row.specialFeatures.trim() : ''
        };
        
        // Конвертируем аудиторию если нужно
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
          let importedCount = 0;
          let updatedCount = 0;
          let errorCount = 0;
          
          // Вставляем пакетами по 1000 записей
          const batchSize = 1000;
          for (let i = 0; i < smiRecords.length; i += batchSize) {
            const batch = smiRecords.slice(i, i + batchSize);
            
            try {
              await SMI.bulkCreate(batch, {
                updateOnDuplicate: ['category', 'country', 'audience', 'audienceNumber', 'contact', 'price', 'description', 'website', 'backdated']
              });
              
              importedCount += batch.length;
              console.log(`📦 Пакет ${Math.floor(i/batchSize) + 1}/${Math.ceil(smiRecords.length/batchSize)}: добавлено ${batch.length} записей`);
            } catch (batchError) {
              console.error(`❌ Ошибка в пакете ${Math.floor(i/batchSize) + 1}:`, batchError.message);
              errorCount += batch.length;
            }
          }
          
          const totalInDb = await SMI.count();
          
          console.log(`📊 Импорт завершен:`);
          console.log(`   ✅ Добавлено новых: ${importedCount}`);
          console.log(`   🔄 Обновлено существующих: ${updatedCount}`);
          console.log(`   ❌ Ошибок: ${errorCount}`);
          console.log(`   📈 Всего в базе: ${totalInDb} записей`);
          
          resolve({ 
            imported: importedCount, 
            updated: updatedCount, 
            errors: errorCount,
            total: smiRecords.length,
            totalInDb: totalInDb
          });
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

// Экспорт данных в CSV
async function exportSMIToCSV(filePath) {
  try {
    const allSMI = await SMI.findAll({
      where: { isActive: true },
      order: [['category', 'ASC'], ['name', 'ASC']],
      limit: 100000 // Ограничение на экспорт
    });
    
    if (allSMI.length === 0) {
      console.log('❌ Нет данных для экспорта');
      return false;
    }
    
    const headers = [
      'name', 'category', 'country', 'backdated', 
      'audience', 'audienceNumber', 'contact', 'price', 
      'description', 'website', 'language', 'mediaType',
      'frequency', 'coverage', 'editorialPolicies', 
      'socialMedia', 'metrics', 'specialFeatures'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    allSMI.forEach(smi => {
      const row = [
        `"${smi.name ? smi.name.replace(/"/g, '""') : ''}"`,
        `"${smi.category ? smi.category.replace(/"/g, '""') : ''}"`,
        `"${smi.country ? smi.country.replace(/"/g, '""') : ''}"`,
        smi.backdated ? 'true' : 'false',
        `"${smi.audience ? smi.audience.replace(/"/g, '""') : ''}"`,
        smi.audienceNumber || 0,
        `"${smi.contact ? smi.contact.replace(/"/g, '""') : ''}"`,
        smi.price || 0,
        `"${smi.description ? smi.description.replace(/"/g, '""') : ''}"`,
        `"${smi.website ? smi.website.replace(/"/g, '""') : ''}"`,
        `"${smi.language ? smi.language.replace(/"/g, '""') : ''}"`,
        `"${smi.mediaType ? smi.mediaType.replace(/"/g, '""') : ''}"`,
        `"${smi.frequency ? smi.frequency.replace(/"/g, '""') : ''}"`,
        `"${smi.coverage ? smi.coverage.replace(/"/g, '""') : ''}"`,
        `"${smi.editorialPolicies ? smi.editorialPolicies.replace(/"/g, '""') : ''}"`,
        `"${smi.socialMedia ? smi.socialMedia.replace(/"/g, '""') : ''}"`,
        `"${smi.metrics ? smi.metrics.replace(/"/g, '""') : ''}"`,
        `"${smi.specialFeatures ? smi.specialFeatures.replace(/"/g, '""') : ''}"`
      ];
      
      csvContent += row.join(',') + '\n';
    });
    
    fs.writeFileSync(filePath, csvContent, 'utf8');
    console.log(`✅ Экспортировано ${allSMI.length} записей в ${filePath}`);
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка экспорта в CSV:', error);
    return false;
  }
}

// Синхронизация CSV с базой
async function syncCSVWithDatabase(csvFilePath) {
  console.log('🔄 Синхронизация CSV с базой данных...');
  
  try {
    const result = await importSMIFromCSV(csvFilePath);
    await exportSMIToCSV(csvFilePath);
    
    console.log('✅ Синхронизация завершена');
    return result;
  } catch (error) {
    console.error('❌ Ошибка синхронизации:', error);
    throw error;
  }
}

// Поиск по CSV-фильтрам
async function searchSMILikeCSV(filters = {}) {
  const whereClause = { isActive: true };
  
  if (filters.category) whereClause.category = { [Op.like]: `%${filters.category}%` };
  if (filters.country && filters.country !== 'Все страны') whereClause.country = { [Op.like]: `%${filters.country}%` };
  
  if (filters.name) whereClause.name = { [Op.like]: `%${filters.name}%` };
  
  if (filters.backdated === 'Да') whereClause.backdated = true;
  else if (filters.backdated === 'Нет') whereClause.backdated = false;
  
  if (filters.maxPrice) {
    const maxPrice = parseInt(filters.maxPrice);
    if (!isNaN(maxPrice)) {
      whereClause.price = { [Op.lte]: maxPrice };
    }
  }
  
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

// Функция для удаления и пересоздания таблицы (команда для бота)
async function fixSMITable() {
  try {
    await recreateSMITable();
    return { success: true, message: 'Таблица smis пересоздана с типами TEXT' };
  } catch (error) {
    return { success: false, message: `Ошибка: ${error.message}` };
  }
}

// ========== ЭКСПОРТ МОДУЛЯ ==========
module.exports = {
  sequelize,
  User,
  SMI,
  Award,
  Jury,
  Association,
  SearchQuery,
  initDatabase,
  recreateSMITable,
  fixSMITable,
  findSMI,
  importSMIFromCSV,
  exportSMIToCSV,
  syncCSVWithDatabase,
  searchSMILikeCSV
};