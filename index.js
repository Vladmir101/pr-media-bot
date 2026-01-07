require('dotenv').config();
const PRBot = require('./bot');

const useWebhook = process.env.USE_WEBHOOK === 'true' || 
                   process.env.REPLIT_URL || 
                   process.env.RAILWAY_URL || 
                   false;

console.log('🚀 апуск PR бота MediaPro...');
console.log('ежим: ' + (useWebhook ? 'ебхук' : 'Polling'));
console.log('CSV база: smi-import-fixed.csv');
console.log('дмин: ' + (process.env.ADMIN_IDS || 'не настроен'));

// нициализируем базу данных
const { initDatabase } = require('./database');

initDatabase()
  .then(() => {
    console.log('✅ аза данных готова к работе');
    
    const bot = new PRBot(useWebhook);
    
    if (useWebhook) {
      bot.startWebhook('/webhook', process.env.PORT || 3000);
      console.log('✅ от запущен в режиме вебхука!');
      console.log('PORT: ' + (process.env.PORT || 3000));
    } else {
      console.log('✅ от успешно запущен локально (polling)!');
    }
  })
  .catch(err => {
    console.error('❌ шибка инициализации :', err.message);
    console.log('⚠️ от запускается без базы данных...');
    
    const bot = new PRBot(useWebhook);
    
    if (useWebhook) {
      bot.startWebhook('/webhook', process.env.PORT || 3000);
    }
  });
