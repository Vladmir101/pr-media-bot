// init-db.js - файл инициализации базы данных
console.log('⚙️ НАСТРОЙКА БАЗЫ ДАННЫХ PR BOT');
console.log('='.repeat(40));

require('dotenv').config();
const { sequelize, SMI, User } = require('./database');

async function setupDatabase() {
  try {
    console.log('\n1. 🔐 Подключаюсь к базе...');
    await sequelize.authenticate();
    console.log('   ✅ Соединение установлено');
    
    console.log('\n2. 🔄 Создаю таблицы...');
    await sequelize.sync({ force: true });
    console.log('   ✅ Таблицы созданы');
    
    console.log('\n3. 👤 Добавляю тестового пользователя...');
    // Ваш Telegram ID из .env или вставьте свой
    const adminId = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',')[0] : '123456789';
    
    await User.create({
      telegramId: adminId,
      username: 'admin_user',
      firstName: 'Администратор',
      lastName: 'Системы',
      role: 'admin'
    });
    console.log('   ✅ Пользователь создан (ID: ' + adminId + ')');
    
    console.log('\n4. 📰 Добавляю тестовые СМИ...');
    const testSMI = [
      {
        name: 'Forbes Россия',
        category: 'Бизнес',
        country: 'Россия',
        backdated: false,
        audience: 'Крупный',
        audienceNumber: 2100000,
        contact: 'pr@forbes.ru',
        price: 100000,
        description: 'Ведущий деловой журнал',
        website: 'https://forbes.ru'
      },
      {
        name: 'VC.ru',
        category: 'IT',
        country: 'Россия',
        backdated: true,
        audience: 'Средний',
        audienceNumber: 850000,
        contact: 'contact@vc.ru',
        price: 75000,
        description: 'Крупнейшее IT-издание',
        website: 'https://vc.ru'
      },
      {
        name: 'ТАСС',
        category: 'Новости',
        country: 'Россия',
        backdated: false,
        audience: 'Очень крупный',
        audienceNumber: 3000000,
        contact: 'press@tass.ru',
        price: 150000,
        description: 'Федеральное агентство новостей',
        website: 'https://tass.ru'
      }
    ];
    
    await SMI.bulkCreate(testSMI);
    console.log('   ✅ Добавлено ' + testSMI.length + ' тестовых СМИ');
    
    console.log('\n5. 📊 Проверяю данные...');
    const userCount = await User.count();
    const smiCount = await SMI.count();
    
    console.log('   📈 Пользователей: ' + userCount);
    console.log('   📈 СМИ в базе: ' + smiCount);
    
    console.log('\n' + '='.repeat(40));
    console.log('🎉 БАЗА ДАННЫХ ГОТОВА!');
    console.log('\n👉 Теперь запустите:');
    console.log('   node bot.js');
    console.log('\n🌐 Админ-панель: http://localhost:3000/admin');
    console.log('🔐 Пароль: admin123');
    
  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error('\nДетали ошибки:');
    console.error(error);
    process.exit(1);
  }
}

// Запускаем
setupDatabase();