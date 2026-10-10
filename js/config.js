/* =========================================================
   Конфигурация Supabase.
   anon-ключ публичный по дизайну Supabase — его можно
   держать в клиентском коде. Реальная защита данных
   обеспечивается RLS-политиками в базе.
   service_role key НИКОГДА не должен попадать на клиент.
   ========================================================= */

   const SUPABASE_URL = "https://lzepxkelhalztqyypdbm.supabase.co";
   const SUPABASE_ANON_KEY = "sb_publishable_QsteVyjkTJnYGoF8gSv8GA_72cojGWM";
   
   const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);