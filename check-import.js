console.log('=== ПРОВЕРКА ИМПОРТИРОВАННЫХ ДАННЫХ ===');

const db = require('./database.js');

async function checkData() {
    await db.initDatabase();
    
    // Получаем все записи
    const allSMI = await db.SMI.findAll({
        order: [['name', 'ASC']]
    });
    
    console.log(\Всего записей в базе: \\);
    console.log('');
    
    allSMI.forEach((smi, index) => {
        console.log(\\. \\);
        console.log(\   Категория: \\);
        console.log(\   Страна: \\);
        console.log(\   Аудитория: \ (\)\);
        console.log(\   Цена: \ руб.\);
        console.log(\   Вебсайт: \\);
        console.log('');
    });
}

checkData();
