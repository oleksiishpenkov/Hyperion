/* =========================================================
   Подключение к Supabase (общая база офиса и водителей).
   Пусто — Hyperion работает как раньше: данные только в этом браузере.
   anon/publishable ключ можно держать в коде: доступ ограничивают правила базы (sql/supabase.sql).
   Ключ service_role / secret сюда НЕ вставлять.
   ========================================================= */
window.JTMS = window.JTMS || {};
JTMS.config = {
  supabaseUrl: 'https://relygkdgmynoyxnapiey.supabase.co',
  supabaseAnonKey: 'sb_publishable_nn8XYD0wM5iILhjwFCL2dg_krvxLKQm'   // publishable key (можно в коде)
};
