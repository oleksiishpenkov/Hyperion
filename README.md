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
