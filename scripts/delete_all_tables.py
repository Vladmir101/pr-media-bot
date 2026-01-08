# scripts/delete_all_tables.py
import psycopg2
import sys

print("=" * 60)
print("  СХ Т  Ы")
print("=" * 60)

# аши данные подключения
DB_CONFIG = {
    "host": "dpg-d56ghore5dus73copac0-a.frankfurt-postgres.render.com",
    "port": 5432,
    "database": "pr_media_bot",
    "user": "pr_media_user",
    "password": "9YBZx4NoNs9vpKD53Y5VqRgDL9IMXhzy",
    "sslmode": "require"
}

try:
    # 1. одключение
    print("1. одключаюсь к базе данных...")
    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True
    cursor = conn.cursor()
    print("✅ одключение успешно!")
    
    # 2. олучаем С таблицы
    print("\n2. щу все таблицы в базе...")
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """)
    
    all_tables = [row[0] for row in cursor.fetchall()]
    
    if not all_tables:
        print("✅ аза уже пустая!")
        sys.exit(0)
    
    print(f"айдено таблиц: {len(all_tables)}")
    for i, table in enumerate(all_tables, 1):
        print(f"   {i:2}. {table}")
    
    # 3. даляем С таблицы
    print("\n3. Я С ТЫ...")
    deleted_count = 0
    
    for table in all_tables:
        try:
            # спользуем кавычки для таблиц с большой буквы
            cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')
            print(f"   ✅ далил: {table}")
            deleted_count += 1
        except Exception as e:
            print(f"   ❌ шибка с {table}: {str(e)[:50]}")
    
    print(f"\n4. роверяю результат...")
    
    # 4. роверяем что осталось
    cursor.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    """)
    
    remaining_tables = cursor.fetchall()
    
    if not remaining_tables:
        print("✅ С ТЫ Ы! аза пуста.")
    else:
        print(f"⚠️  сталось таблиц: {len(remaining_tables)}")
        for table in remaining_tables:
            print(f"   • {table[0]}")
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print(f"🎉  {deleted_count} Т!")
    print("=" * 60)
    
except Exception as e:
    print(f"\n❌ ТСЯ Ш: {e}")
    sys.exit(1)
