# scripts/clean_database.py
import psycopg2
import sys

print("🧹 СТ Ы ЫХ POSTGRESQL")
print("=" * 60)

# анные из Render
DB_CONFIG = {
    "host": "dpg-d56ghore5dus73copac0-a.frankfurt-postgres.render.com",
    "port": 5432,
    "database": "pr_media_bot",
    "user": "pr_media_user",
    "password": "9YBZx4NoNs9vpKD53Y5VqRgDL9IMXhzy",
    "sslmode": "require"
}

try:
    print("🔗 одключаюсь к базе...")
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    
    print("✅ одключение успешно!")
    
    # даляем старые таблицы
    print("\n🧹 даляю старые таблицы...")
    tables = ["associations", "juries", "awards", "smi", "categories"]
    for table in tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
        print(f"   ✅ {table}")
    
    # Создаем категории
    print("\n📁 Создаю таблицу категорий...")
    cursor.execute("""
        CREATE TABLE categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 20 категорий по Т
    categories = [
        'IT', 'изнес', 'Стартапы', 'Технологии', 'инансы',
        'рипто', 'аркетинг', 'PR', 'едицина', 'расота',
        'ода', 'ультура', 'скусство', 'узыка', 'ино',
        'Спорт', 'бразование', ('аука',), ('едвижимость',), ('Lifestyle',)
    ]
    
    for category in categories:
        cursor.execute("INSERT INTO categories (name) VALUES (%s)", (category,))
    print(f"   ✅ обавлено {len(categories)} категорий")
    
    # Создаем таблицу С
    print("\n📁 Создаю таблицу С...")
    cursor.execute("""
        CREATE TABLE smi (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            country VARCHAR(100) NOT NULL,
            category_id INTEGER NOT NULL REFERENCES categories(id),
            visits_per_month INTEGER,
            can_backdate BOOLEAN DEFAULT false,
            website VARCHAR(500),
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            lead_time_hours INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Создаем индексы
    print("\n📊 Создаю индексы...")
    cursor.execute("CREATE INDEX idx_smi_country ON smi(country)")
    cursor.execute("CREATE INDEX idx_smi_category ON smi(category_id)")
    cursor.execute("CREATE INDEX idx_smi_visits ON smi(visits_per_month)")
    cursor.execute("CREATE INDEX idx_smi_backdate ON smi(can_backdate)")
    
    # роверяем
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables_created = [row[0] for row in cursor.fetchall()]
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print("🎉  СШ Щ  СТ!")
    print("=" * 60)
    print(f"📋 Созданные таблицы ({len(tables_created)}):")
    for table in tables_created:
        print(f"   • {table}")
    print("\n✅ аза готова к импорту CSV!")
    print("=" * 60)
    
except Exception as e:
    print(f"\n❌ шибка: {e}")
    sys.exit(1)
