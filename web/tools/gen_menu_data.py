#!/usr/bin/env python3
"""
gen_menu_data.py — Tạo lại web/menu-data.js từ seed/menu_items.json

Chạy mỗi khi menu thay đổi:
  python3 web/tools/gen_menu_data.py

Lưu ý: chạy từ thư mục gốc project (~/Projects/lamha-kissaten/)
"""

import json, pathlib, datetime

ROOT   = pathlib.Path(__file__).parent.parent.parent   # lamha-kissaten/
SRC    = ROOT / 'seed' / 'menu_items.json'
TARGET = ROOT / 'web' / 'menu-data.js'

SUBCATEGORY_ORDER = [
    ('phin_coffee', 'Cà phê',              '☕'),
    ('hot_drinks',  'Đồ uống nóng',        '🍵'),
    ('latte',       'Latte',               '🥛'),
    ('tea',         'Các loại trà',        '🫖'),
    ('milk_tea',    'Trà sữa',             '🧋'),
    ('yogurt',      'Sữa chua & Coldbrew', '🍧'),
    ('pastry',      'Bánh',                '🥐'),
]

def main():
    with open(SRC, encoding='utf-8') as f:
        items = json.load(f)

    active = [i for i in items if i.get('available', True)]
    active.sort(key=lambda x: x.get('sort_order', 999))

    # Build JS
    cats_js = json.dumps(
        [{'id': s, 'label': l, 'emoji': e} for s, l, e in SUBCATEGORY_ORDER],
        ensure_ascii=False, indent=2
    )

    items_js_parts = []
    for item in active:
        c = item.get('customizations', item.get('customizations_json', {}))
        if isinstance(c, str):
            try: c = json.loads(c)
            except: c = {}

        def get_bee_group(sku, subcat):
            if item.get('bee_group'):
                return item['bee_group']
            if subcat == 'pastry':
                return 'kashi'
            if subcat in ('kissaten', 'latte'):
                return 'so'
            if subcat in ('hot_drinks', 'tea', 'yogurt'):
                return 'ritsu'
            return 'kin'

        obj = {
            'sku':         item['sku'],
            'name':        item['name'],
            'name_jp':     item.get('name_jp') or None,
            'subcategory': item.get('subcategory', ''),
            'bee_group':   get_bee_group(item['sku'], item.get('subcategory', '')),
            'role':        item.get('role', ''),
            'price_m':     item.get('price_m', item.get('price', 0)),
            'price_l':     item.get('price_l') or None,
            'customizations': c,
            'allergens':   item.get('allergens', []),
            'available':   True,
            'sort_order':  item.get('sort_order', 999),
        }
        if item.get('story_telling'):
            obj['story'] = item['story_telling']

        items_js_parts.append(json.dumps(obj, ensure_ascii=False, indent=2))

    items_js = ',\n  '.join(items_js_parts)
    today    = datetime.date.today().isoformat()
    n        = len(active)

    out = f"""// menu-data.js — Auto-generated từ seed/menu_items.json
// Đừng sửa tay. Dùng: python3 web/tools/gen_menu_data.py
// Cập nhật: {today} · {n} món

const CATEGORIES = {cats_js};

const MENU_DATA = [
  {items_js}
];
"""

    TARGET.write_text(out, encoding='utf-8')
    print(f'✅ Đã tạo {TARGET} ({n} món)')

if __name__ == '__main__':
    main()
