console.log("========== ПРОВЕРКА БАЗЫ ДАННЫХ ==========");

const db = require("./database.js");

async function checkDatabase() {
    try {
        console.log("\n1.   Инициализация базы данных...");
        await db.initDatabase();
        console.log("    База данных готова");
        
        console.log("\n2.  Проверка текущих данных...");
        const beforeCount = await db.SMI.count();
        console.log("   Записей в таблице SMI: " + beforeCount);
        
        console.log("\n3.  Импорт из CSV...");
        try {
            const result = await db.importSMIFromCSV("./smi-import.csv");
            
            console.log("\n    РЕЗУЛЬТАТЫ ИМПОРТА:");
            console.log("   -----------------------");
            console.log("   Всего записей в CSV: " + result.total);
            console.log("   Добавлено новых: " + result.imported);
            console.log("   Обновлено: " + result.updated);
            console.log("   -----------------------");
            
        } catch (importError) {
            console.error("\n    Ошибка импорта: " + importError.message);
        }
        
        console.log("\n4.  Итоговые данные:");
        const afterCount = await db.SMI.count();
        console.log("   Всего записей в базе: " + afterCount);
        
        console.log("\n5.   Примеры записей:");
        const samples = await db.SMI.findAll({
            limit: 3,
            order: [["name", "ASC"]]
        });
        
        if (samples.length > 0) {
            samples.forEach((item, index) => {
                console.log("\n   " + (index + 1) + ". " + item.name);
                console.log("      Категория: " + item.category);
                console.log("      Страна: " + item.country);
                console.log("      Цена: " + item.price?.toLocaleString() + " руб.");
                if (item.website) {
                    console.log("      Сайт: " + item.website);
                }
            });
        } else {
            console.log("    В базе нет данных");
        }
        
        console.log("\n Проверка завершена!");
        
    } catch (error) {
        console.error("\n Критическая ошибка: " + error.message);
    }
}

checkDatabase();
