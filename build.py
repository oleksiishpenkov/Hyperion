"""Собирает самодостаточные страницы в dist/: CSS, JS и картинки встраиваются внутрь HTML."""
import re, base64
from pathlib import Path
ROOT = Path(__file__).parent
DIST = ROOT / 'dist'; DIST.mkdir(exist_ok=True)

def data_uri(rel):
    b = (ROOT / rel).read_bytes()
    return 'data:image/png;base64,' + base64.b64encode(b).decode()

for page in ['orders.html', 'order-new.html', 'dispatch.html', 'driver.html', 'ports.html', 'settings.html', 'login.html']:
    s = (ROOT / page).read_text(encoding='utf-8')
    s = re.sub(r'<link rel="stylesheet" href="(assets/[^"]+\.css)">',
               lambda m: '<style>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '\n</style>', s)
    s = re.sub(r'<script src="(assets/[^"]+\.js)"></script>',
               lambda m: '<script>\n' + (ROOT / m.group(1)).read_text(encoding='utf-8') + '\n</script>', s)
    s = re.sub(r'(src|href)="(assets/brand/[^"]+\.png)"', lambda m: m.group(1) + '="' + data_uri(m.group(2)) + '"', s)
    assert not re.search(r'(src|href)="assets/', s), page + ': осталась ссылка на assets/'
    (DIST / page).write_text(s, encoding='utf-8')
    print('OK', page, len(s) // 1024, 'KB')
