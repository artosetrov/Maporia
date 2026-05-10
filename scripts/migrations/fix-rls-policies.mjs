// Скрипт для автоматического исправления RLS политик
// Запустите: npm run fix-rls
// 
// ВАЖНО: Для автоматического выполнения нужен SUPABASE_SERVICE_ROLE_KEY
// Получите его в Supabase Dashboard > Settings > API > service_role key (секретный)
// 
// Если автоматическое выполнение не работает, скрипт выведет SQL код,
// который нужно выполнить вручную в Supabase Dashboard > SQL Editor

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
const envPath = join(__dirname, '..', '.env.local');
let supabaseUrl, supabaseServiceRoleKey;

try {
  const envContent = readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n');
  
  for (const line of envLines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseServiceRoleKey = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch (err) {
  console.error('Ошибка чтения .env.local:', err.message);
  console.log('\nСоздайте файл .env.local и добавьте:');
  console.log('NEXT_PUBLIC_SUPABASE_URL=your_supabase_url');
  console.log('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  console.log('\nПолучите service_role key в Supabase Dashboard > Settings > API');
  process.exit(1);
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Ошибка: Не найдены переменные окружения');
  console.log('Нужны: NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  console.log('\nДобавьте SUPABASE_SERVICE_ROLE_KEY в .env.local:');
  console.log('Получите его в Supabase Dashboard > Settings > API > service_role key (секретный)');
  process.exit(1);
}

// Создаем клиент с service role key (имеет полные права)
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixRLSPolicies() {
  try {
    console.log('🔧 Исправление RLS политик для таблицы places...\n');

    // 1. Проверяем текущие политики
    console.log('1. Проверяем текущие политики DELETE...');
    const { data: currentPolicies, error: checkError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          policyname,
          cmd,
          qual
        FROM pg_policies 
        WHERE tablename = 'places' AND cmd = 'DELETE';
      `
    }).catch(() => {
      // Если RPC не доступен, используем прямой SQL через REST API
      return { data: null, error: null };
    });
    if (checkError) {
      console.warn('   Не удалось проверить текущие политики:', checkError.message);
    }

    if (currentPolicies && currentPolicies.length > 0) {
      console.log('   Найдены существующие политики DELETE:');
      currentPolicies.forEach(p => {
        console.log(`   - ${p.policyname}`);
      });
    } else {
      console.log('   Политики DELETE не найдены');
    }

    // 2. Удаляем старую политику если существует
    console.log('\n2. Удаляем старую политику (если существует)...');
    const dropPolicySQL = `
      DROP POLICY IF EXISTS "Users can delete their own places" ON places;
    `;
    
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: dropPolicySQL
    }).catch(async () => {
      // Альтернативный способ через REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceRoleKey,
          'Authorization': `Bearer ${supabaseServiceRoleKey}`
        },
        body: JSON.stringify({ sql: dropPolicySQL })
      });
      return { error: response.ok ? null : new Error('Failed to drop policy') };
    });

    if (dropError) {
      console.warn('   ⚠ Не удалось удалить старую политику (может не существовать):', dropError.message);
    } else {
      console.log('   ✓ Старая политика удалена');
    }

    // 3. Создаем новую политику
    console.log('\n3. Создаем новую политику DELETE...');
    const createPolicySQL = `
      CREATE POLICY "Users can delete their own places"
      ON places
      FOR DELETE
      USING (auth.uid() = created_by);
    `;

    // Используем прямой SQL запрос через REST API
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({ sql: createPolicySQL })
    }).catch(async () => {
      // Если exec_sql не доступен, попробуем через Supabase Management API
      console.log('   Попытка через альтернативный метод...');
      return { ok: false };
    });

    if (!createResponse.ok) {
      console.error('   ✗ Не удалось создать политику автоматически');
      console.log('\n📝 Выполните SQL вручную в Supabase Dashboard:');
      console.log('\n' + '='.repeat(60));
      console.log(createPolicySQL);
      console.log('='.repeat(60));
      console.log('\nИнструкции:');
      console.log('1. Откройте https://app.supabase.com');
      console.log('2. Выберите ваш проект');
      console.log('3. Перейдите в SQL Editor');
      console.log('4. Скопируйте SQL выше и выполните');
      console.log('\nИли используйте готовый файл: fix-rls-policies.sql');
      return;
    }

    console.log('   ✓ Политика создана успешно');

    // 4. Включаем RLS
    console.log('\n4. Включаем RLS для таблицы places...');
    const enableRLSSQL = `ALTER TABLE places ENABLE ROW LEVEL SECURITY;`;
    
    const enableResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({ sql: enableRLSSQL })
    });

    if (enableResponse.ok) {
      console.log('   ✓ RLS включен');
    } else {
      console.warn('   ⚠ Не удалось включить RLS (может быть уже включен)');
    }

    // 5. Проверяем результат
    console.log('\n5. Проверяем результат...');
    const verifyResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceRoleKey,
        'Authorization': `Bearer ${supabaseServiceRoleKey}`
      },
      body: JSON.stringify({
        sql: `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'places' AND cmd = 'DELETE';`
      })
    });

    if (verifyResponse.ok) {
      const policies = await verifyResponse.json();
      if (policies && policies.length > 0) {
        console.log('   ✓ Политика DELETE найдена:');
        policies.forEach(p => {
          console.log(`     - ${p.policyname}`);
        });
      }
    }

    console.log('\n✅ Готово! RLS политики исправлены.');
    console.log('\nТеперь попробуйте удалить место в приложении.');

  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    console.log('\n📝 Альтернативный способ:');
    console.log('1. Откройте Supabase Dashboard > SQL Editor');
    console.log('2. Выполните SQL из файла fix-rls-policies.sql');
    process.exit(1);
  }
}

fixRLSPolicies();
