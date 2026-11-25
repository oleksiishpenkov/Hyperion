# Hyperion TMS

Prototype TMS for container transport (Jenson Logistics). Plain HTML, CSS and JavaScript: no build step, no Node.js.

- `index.html` → Orders; `index.html#driver` → driver app
- Pages: `orders.html`, `order-new.html`, `dispatch.html`, `driver.html`, `ports.html`, `settings.html`
- Shared code and data: `assets/`
- Supabase import files: `data/`, `sql/`

Data is kept in each browser (localStorage) until Supabase is connected.

## Run locally
Open the folder in VS Code and start the Live Server extension on `index.html`.

## Publish on GitHub Pages
Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.

## Shared base (Supabase)
Without settings Hyperion keeps data in each browser only. To share orders between the office and the drivers' phones:

1. In Supabase → SQL Editor, run `sql/supabase.sql` once. It is safe to run again after updates.
2. In `assets/config.js`, set `supabaseUrl` and the **anon public** (or publishable) key. Never put the `service_role` / secret key in the code.
3. Authentication → Users → Add user (tick Auto Confirm). The first account becomes Office. Give everyone else access in Hyperion → Settings → Team.

Drivers see only jobs sent to their truck. They can mark progress and add CMR and photos. Changes made without a connection are kept in the browser and sent later.
