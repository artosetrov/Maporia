// Скрипт для удаления "Test place" из базы данных
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из .env.local
const envPath = join(__dirname, '..', '.env.local');
let supabaseUrl, supabaseKey;

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');
  
  for (const line of envLines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
      supabaseKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (err) {
  console.error('Ошибка чтения .env.local:', err.message);
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Ошибка: Не найдены переменные окружения NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteTestPlace() {
  try {
    console.log('Поиск мест с названием "Test place"...');
    
    // Находим все места с названием "Test place"
    const { data: places, error: searchError } = await supabase
      .from('places')
      .select('id, title, created_at')
      .ilike('title', '%Test place%');

    if (searchError) {
      console.error('Ошибка поиска:', searchError);
      return;
    }

    if (!places || places.length === 0) {
      console.log('Места с названием "Test place" не найдены');
      return;
    }

    console.log(`Найдено мест: ${places.length}`);
    places.forEach(p => {
      console.log(`  - ${p.title} (ID: ${p.id})`);
    });

    // Удаляем каждое найденное место
    for (const place of places) {
      const placeId = place.id;
      console.log(`\nУдаление места: ${place.title} (${placeId})...`);

      // Удаляем связанные данные
      const { error: photosError } = await supabase
        .from('place_photos')
        .delete()
        .eq('place_id', placeId);
      
      if (photosError) {
        console.warn(`  ⚠ Предупреждение при удалении фото:`, photosError.message);
      } else {
        console.log('  ✓ Фото удалены');
      }

      const { error: commentsError } = await supabase
        .from('comments')
        .delete()
        .eq('place_id', placeId);
      
      if (commentsError) {
        console.warn(`  ⚠ Предупреждение при удалении комментариев:`, commentsError.message);
      } else {
        console.log('  ✓ Комментарии удалены');
      }

      const { error: reactionsError } = await supabase
        .from('reactions')
        .delete()
        .eq('place_id', placeId);
      
      if (reactionsError) {
        console.warn(`  ⚠ Предупреждение при удалении реакций:`, reactionsError.message);
      } else {
        console.log('  ✓ Реакции удалены');
      }

      // Удаляем само место
      const { error: deleteError } = await supabase
        .from('places')
        .delete()
        .eq('id', placeId);

      if (deleteError) {
        console.error(`  ✗ Ошибка удаления места:`, deleteError.message);
      } else {
        console.log(`  ✓ Место "${place.title}" успешно удалено!`);
      }
    }

    console.log('\n✅ Готово! Все места "Test place" удалены.');
  } catch (err) {
    console.error('Неожиданная ошибка:', err);
    process.exit(1);
  }
}

deleteTestPlace();
