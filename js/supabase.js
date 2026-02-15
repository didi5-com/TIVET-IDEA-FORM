// Shared Supabase client loader for admin pages
// Usage: include this script in admin-login.html and admin.html
// It will dynamically load the Supabase SDK (v2) if needed and expose `window.supabaseClient`.

(function () {
  const SUPABASE_URL = "https://wvkfkwuggvzcgjoqcfya.supabase.co"; // e.g., https://abcxyzcompany.supabase.co
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2a2Zrd3VnZ3Z6Y2dqb3FjZnlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNzcxMDUsImV4cCI6MjA4NjY1MzEwNX0.1U7qNtAcLLkovltTX7acfithEKbfgxY6qFAEawZMxZw"; // Project Settings → API → anon key

  function createClient() {
    if (!window.supabase) {
      console.error("Supabase SDK not available on window.supabase");
      return;
    }
    try {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      document.dispatchEvent(new CustomEvent('supabase:ready'));
    } catch (e) {
      console.error('Failed to initialize Supabase client', e);
    }
  }

  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@supabase/supabase-js@2';
    script.async = true;
    script.onload = createClient;
    script.onerror = () => console.error('Failed to load Supabase SDK');
    document.head.appendChild(script);
  } else {
    createClient();
  }
})();