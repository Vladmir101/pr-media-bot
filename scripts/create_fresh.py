# scripts/create_fresh.py
import psycopg2

print("=" * 60)
print("С СТ СТТЫ Ы")
print("=" * 60)

conn = psycopg2.connect(
    host="dpg-d56ghore5dus73copac0-a.frankfurt-postgres.render.com",
    port=5432,
    database="pr_media_bot",
    user="pr_media_user",
    password="9YBZx4NoNs9vpKD53Y5VqRgDL9IMXhzy",
    sslmode="require"
)

conn.autocommit = True
cursor = conn.cursor()

print("Ш 1: Создаю таблицу категорий...")
cursor.execute("""
    CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
""")
print("   ✅ Таблица 'categories' создана")

print("\nШ 2: обавляю 20 категорий по Т...")
categories = [
    ('IT',), ('изнес',), ('Стартапы',), ('Технологии',), ('инансы',),
    ('рипто',), ('аркетинг',), ('PR',), ('едицина',), ('расота',),
    ('ода',), ('ультура',), ('скусство',), ('узыка',), ('ино',),
    ('Спорт',), ('бразование',), ('аука',), ('едвижимость',), ('Lifestyle',)
]

cursor.executemany("INSERT INTO categories (name) VALUES (%s);", categories)
print(f"   ✅ обавлено {len(categories)} категорий")

print("\nШ 3: Создаю таблицу С...")
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
    );
""")
print("   ✅ Таблица 'smi' создана")

print("\nШ 4: Создаю индексы для быстрого поиска...")
indexes = [
    ("idx_smi_country", "CREATE INDEX idx_smi_country ON smi(country);"),
    ("idx_smi_category", "CREATE INDEX idx_smi_category ON smi(category_id);"),
    ("idx_smi_visits", "CREATE INDEX idx_smi_visits ON smi(visits_per_month);"),
    ("idx_smi_backdate", "CREATE INDEX idx_smi_backdate ON smi(can_backdate);"),
    ("idx_smi_active", "CREATE INDEX idx_smi_active ON smi(is_active);")
]

for idx_name, sql in indexes:
    cursor.execute(sql)
    print(f"   ✅ ндекс '{idx_name}' создан")

print("\nШ 5: роверяю созданные таблицы...")
cursor.execute("""
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
""")

tables_created = cursor.fetchall()

print(f"\n📊 Т С Т: {len(tables_created)}")
for table in tables_created:
    print(f"   • {table[0]}")

cursor.close()
conn.close()

print("\n" + "=" * 60)
print("🎉  Ь Т!")
print("=" * 60)
print("Теперь можно импортировать данные из CSV файла")
print("=" * 60)
