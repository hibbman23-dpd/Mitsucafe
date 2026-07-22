/**
 * SeedSheets.gs — Khởi tạo 8 tabs + bulk import 27 món từ JSON.
 *
 * Cách chạy (1 lần khi setup):
 *   1. Mở Sheets > Extensions > Apps Script
 *   2. Tạo file riêng và paste hoặc clasp push toàn bộ /gas
 *   3. Chạy initAllSheets() → tạo 8 tabs với headers (ORDERS, MENU, CART, INVENTORY, CUSTOMERS, STAFF, PROMOTIONS, CONFIG)
 *   4. Copy nội dung seed/menu_items.json vào biến MENU_JSON dưới đây (hoặc fetch URL)
 *   5. Chạy seedMenuFromJson()
 *   6. Chạy seedConfigDefaults() để khởi tạo CONFIG keys
 *
 * CART tab: dùng cho Glide app (giỏ hàng tạm, append-when-add, delete-on-submit).
 *   Pattern: Glide ghi row khi user "Add to cart" với user_id = số điện thoại.
 *   Submit đơn → Glide filter rows theo user_id → JS compute column build items[] JSON →
 *   POST webhook tới GAS → trên success, Glide xoá các rows đã submit.
 */

function initAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var schemas = {
    'ORDERS': [
      'order_id', 'event_id', 'timestamp', 'channel', 'utm_source', 'location_id',
      'table_id', 'staff_id', 'customer_id', 'items_json', 'subtotal', 'total',
      'status', 'confirmed_at', 'making_at', 'ready_at', 'delivering_at', 'delivered_at',
      'payment_method', 'payment_status', 'label_printed_at', 'invoice_url',
      'printed_at', 'notes', 'customer_name', 'short_code', 'delivery_type', 'utm_campaign',
    ],
    'MENU': [
      'sku', 'name', 'name_jp', 'category', 'subcategory', 'role',
      'price_m', 'price_l', 'cost_nl', 'cost_packaging', 'cogs_percent',
      'base_id', 'recipe_id', 'allergens', 'customizations_json',
      'on_promo', 'promo_price', 'promo_start', 'promo_end',
      'available', 'prep_time_sec', 'image_url', 'sort_order', 'story_telling',
    ],
    'INVENTORY': [
      'ingredient_id', 'name', 'unit', 'current_stock', 'min_stock',
      'cost_per_unit', 'supplier', 'last_updated',
    ],
    'CUSTOMERS': [
      'customer_id', 'name', 'phone', 'zalo_id', 'first_order', 'last_order',
      'total_orders', 'total_spent',
      'stamp_count', 'stamp_total_ever', 'free_drinks_earned', 'free_drinks_used',
      'notes',
    ],
    'STAFF': [
      'staff_id', 'name', 'role', 'pin', 'active', 'hourly_rate', 'shift_start', 'shift_end',
    ],
    'PROMOTIONS': [
      'campaign_id', 'name', 'type', 'discount_value', 'discount_type',
      'schedule_type', 'start_date', 'end_date', 'start_time', 'end_time',
      'days_of_week', 'target_skus',
      'currently_running', 'zalo_sent', 'telegram_sent', 'slides_updated', 'is_active',
    ],
    'CART': [
      'cart_id', 'user_id', 'sku', 'name', 'qty', 'price',
      'modifiers_json', 'subtotal', 'added_at',
    ],
    'CONFIG': ['key', 'value'],
    'EXPENSES': [
      'expense_id', 'date', 'category', 'amount', 'description', 'payment_method',
      'staff_id', 'receipt_url', 'created_at'
    ],
    'DAILY_METRICS': [
      'date', 'revenue', 'cogs', 'orders_count', 'average_order_value', 'updated_at'
    ],
    'CAMERA_EVENTS': [
      'event_id', 'timestamp', 'camera_name', 'event_type', 'duration_sec', 'description', 'snapshot_url', 'status'
    ],
    'MARKETING_LOG': [
      'activity_id', 'date', 'type', 'platform', 'campaign_id', 'title',
      'utm_tag', 'cost_vnd', 'effort_hours', 'reach', 'clicks', 'notes'
    ],
    'AGENT_INSIGHTS': [
      'insight_id', 'timestamp', 'agent', 'summary', 'verdict', 'doc_link'
    ],
    'COMMAND_QUEUE': [
      'command_id', 'created_at', 'text', 'status', 'result', 'updated_at', 'source'
    ],
  };

  Object.keys(schemas).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(schemas[name]);
      sheet.getRange(1, 1, 1, schemas[name].length).setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
  Logger.log('All 8 tabs initialized.');
}

/**
 * Tạo riêng CART tab nếu sheet đã setup từ trước Day 4 (không cần rerun initAllSheets).
 * An toàn: không xoá data nếu CART đã tồn tại.
 */
function initCartSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('CART');
  if (sheet) {
    Logger.log('CART tab already exists.');
    return;
  }
  sheet = ss.insertSheet('CART');
  var headers = ['cart_id', 'user_id', 'sku', 'name', 'qty', 'price',
                 'modifiers_json', 'subtotal', 'added_at'];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  Logger.log('CART tab created.');
}

/**
 * Cập nhật config print server — chạy 1 lần sau khi đổi IP hoặc port.
 * Không cần xoá CONFIG — sẽ ghi đè các key đã tồn tại.
 */
function setupPrintServerConfig() {
  var printCfg = {
    'PRINT_SERVER_IP':   '192.168.1.8',
    'PRINT_SERVER_PORT': '5001',
    'STORE_NAME':        'LAM HA KISSATEN',
    'STORE_ADDRESS':     'Lam Ha, Lam Dong',
    'STORE_PHONE':       '',
    'RECEIPT_FOOTER1':   'Cam on! Hen gap lai nhe!',
    'RECEIPT_FOOTER2':   'lamhakissaten',
  };
  Object.keys(printCfg).forEach(function (k) { setConfig(k, printCfg[k]); });
  Logger.log('Print server config updated: PRINT_SERVER_IP=192.168.1.8:5001');
}

function seedConfigDefaults() {
  var defaults = {
    'LOCATION_ID': 'LH01',
    'TELEGRAM_BOT_TOKEN': '<paste-from-BotFather>',
    'TELEGRAM_CHAT_ID': '<your-chat-id>',
    'ZALO_OA_TOKEN': '<phase-2>',
    'VIETQR_BANK_CODE': '<e.g. VCB>',
    'VIETQR_ACCOUNT': '<bank-account-number>',
    'VIETQR_ACCT_NAME': '<account-holder-name>',
    'LABEL_PRINTER_IP': '192.168.1.50',
    'LABEL_PRINTER_PORT': '9100',
    'LABEL_PRINTER_MODEL': 'POS-58L',
    'PRINT_SERVER_PORT': '5000',
    'STAMP_THRESHOLD_1': '66000',
    'STAMP_THRESHOLD_2': '100000',
    'STAMP_THRESHOLD_SPECIAL': '490000',
    'STAMPS_FOR_FREE': '10',
    'CAFE_NAME': '<tên quán>',
    'CAFE_ADDRESS': '<địa chỉ>',
    'CAFE_PHONE': '<sđt>',
    'PROMO_5PERCENT_ACTIVE': 'false',
    'PROMO_5PERCENT_START': '',
    'PROMO_5PERCENT_END': '',
    'PROMO_5PERCENT_MSG': 'Ưu đãi đặc biệt: Giảm giá toàn bộ menu!',
    'PROMO_PERCENT': '5',
  };
  Object.keys(defaults).forEach(function (k) {
    if (!getConfig(k)) setConfig(k, defaults[k]);
  });
  Logger.log('Default CONFIG seeded.');
}

/**
 * P2 (cafe-insight): tạo sẵn các CONFIG key cho GA4 + Meta để chủ quán dán giá trị sau.
 * Idempotent — chỉ thêm key còn THIẾU, KHÔNG ghi đè key đã có giá trị. Chạy 1 lần trong editor.
 * Sau khi chạy: mở tab CONFIG, thay phần chữ gợi ý '<...>' bằng giá trị thật.
 */
function seedInsightConfigKeys() {
  var defaults = {
    'GA4_PROPERTY_ID': '<GA4 Property ID dạng SỐ, KHÔNG phải G-xxx>',
    'META_SYSTEM_TOKEN': '<dán token Meta — System User hoặc token 60 ngày>',
    'META_PAGE_ID': '<Facebook Page ID — Graph Explorer: me/accounts>',
    'META_IG_USER_ID': '<IG user ID — {PAGE_ID}?fields=instagram_business_account>',
    'THREADS_TOKEN': '<token Threads (graph.threads.net) — tuỳ chọn>',
    'THREADS_USER_ID': '<Threads user ID — tuỳ chọn>',
  };
  Object.keys(defaults).forEach(function (k) {
    if (!getConfig(k)) setConfig(k, defaults[k]);
  });
  Logger.log('Insight CONFIG keys seeded — mở tab CONFIG, thay <...> bằng giá trị thật.');
}

/**
 * MENU_JSON — paste nội dung seed/menu_items.json vào đây trước khi chạy.
 * Hoặc dùng UrlFetchApp.fetch nếu repo public.
 */
var MENU_JSON = [
  {
    "sku": "DR001",
    "name": "Cf mitsu",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR001",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 1
  },
  {
    "sku": "DR002",
    "name": "Cf sữa",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "leader",
    "price_m": 20000,
    "price_l": null,
    "cost_nl": 6000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR002",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 2
  },
  {
    "sku": "DR003",
    "name": "Cf đen",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "leader",
    "price_m": 18000,
    "price_l": null,
    "cost_nl": 5400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR003",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 3
  },
  {
    "sku": "DR004",
    "name": "Cf bơ đậu phộng",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "trend",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR004",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 4
  },
  {
    "sku": "DR005",
    "name": "Cf muối",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "trend",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR005",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 5
  },
  {
    "sku": "DR006",
    "name": "Cf caramel muối hồng",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR006",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 6
  },
  {
    "sku": "DR007",
    "name": "Cf dalgona",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "trend",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR007",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 7
  },
  {
    "sku": "DR008",
    "name": "Cf chocolate",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "standard",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR008",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 8
  },
  {
    "sku": "DR009",
    "name": "Cf kem dẻo buôn mê",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR009",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 9
  },
  {
    "sku": "DR010",
    "name": "Bạc sỉu",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "hero",
    "price_m": 20000,
    "price_l": null,
    "cost_nl": 6000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR010",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 10
  },
  {
    "sku": "DR011",
    "name": "Phindi hạnh nhân",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR011",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 11
  },
  {
    "sku": "DR012",
    "name": "Ca cao sữa",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "standard",
    "price_m": 20000,
    "price_l": null,
    "cost_nl": 6000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR012",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 12
  },
  {
    "sku": "DR013",
    "name": "Ca cao muối",
    "category": "beverage",
    "subcategory": "coffee",
    "role": "trend",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR013",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 13
  },
  {
    "sku": "DR020",
    "name": "Trà gừng mật ong",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "standard",
    "price_m": 20000,
    "price_l": null,
    "cost_nl": 6000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR020",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 20
  },
  {
    "sku": "DR021",
    "name": "Trà gừng đường nâu",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "standard",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR021",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 21
  },
  {
    "sku": "DR022",
    "name": "Trà thảo mộc",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR022",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 22
  },
  {
    "sku": "DR023",
    "name": "Hoa hồng táo đỏ",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR023",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 23
  },
  {
    "sku": "DR024",
    "name": "Thanh yên bá tước",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR024",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 24
  },
  {
    "sku": "DR025",
    "name": "Trà đào cam quế",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "trend",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR025",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 25
  },
  {
    "sku": "DR026",
    "name": "Ca cao quế",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "standard",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR026",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 26
  },
  {
    "sku": "DR027",
    "name": "Matcha batā",
    "category": "beverage",
    "subcategory": "hot_drinks",
    "role": "signature",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR027",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 27
  },
  {
    "sku": "DR030",
    "name": "Matcha mitsu",
    "category": "beverage",
    "subcategory": "latte",
    "role": "signature",
    "price_m": 40000,
    "price_l": null,
    "cost_nl": 12000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR030",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 30
  },
  {
    "sku": "DR031",
    "name": "Matcha croissant",
    "category": "beverage",
    "subcategory": "latte",
    "role": "signature",
    "price_m": 40000,
    "price_l": null,
    "cost_nl": 12000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR031",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 31
  },
  {
    "sku": "DR032",
    "name": "Matcha latte",
    "category": "beverage",
    "subcategory": "latte",
    "role": "hero",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR032",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 32
  },
  {
    "sku": "DR033",
    "name": "Matcha latte muối",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR033",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 33
  },
  {
    "sku": "DR034",
    "name": "Matcha coco",
    "category": "beverage",
    "subcategory": "latte",
    "role": "standard",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR034",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 34
  },
  {
    "sku": "DR035",
    "name": "Matcha đậu đỏ",
    "category": "beverage",
    "subcategory": "latte",
    "role": "standard",
    "price_m": 30000,
    "price_l": 35000,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR035",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 35
  },
  {
    "sku": "DR036",
    "name": "Matcha caramel muối hồng",
    "category": "beverage",
    "subcategory": "latte",
    "role": "signature",
    "price_m": 35000,
    "price_l": null,
    "cost_nl": 10500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR036",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 36
  },
  {
    "sku": "DR037",
    "name": "Matcha butterfly coco",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 35000,
    "price_l": null,
    "cost_nl": 10500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR037",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 37
  },
  {
    "sku": "DR038",
    "name": "Matcha coldwhish",
    "category": "beverage",
    "subcategory": "latte",
    "role": "standard",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR038",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 38
  },
  {
    "sku": "DR039",
    "name": "Cloudy matcha",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR039",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 39
  },
  {
    "sku": "DR040",
    "name": "Houjicha latte",
    "category": "beverage",
    "subcategory": "latte",
    "role": "hero",
    "price_m": 30000,
    "price_l": 35000,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR040",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 40
  },
  {
    "sku": "DR041",
    "name": "Ca cao croissant",
    "category": "beverage",
    "subcategory": "latte",
    "role": "signature",
    "price_m": 40000,
    "price_l": null,
    "cost_nl": 12000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR041",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 41
  },
  {
    "sku": "DR042",
    "name": "Ca cao latte",
    "category": "beverage",
    "subcategory": "latte",
    "role": "standard",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR042",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 42
  },
  {
    "sku": "DR043",
    "name": "Ca cao latte muối",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR043",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 43
  },
  {
    "sku": "DR044",
    "name": "Ca cao bạc hà",
    "category": "beverage",
    "subcategory": "latte",
    "role": "standard",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR044",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 44
  },
  {
    "sku": "DR045",
    "name": "Ca cao oreo kem dẻo",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR045",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 45
  },
  {
    "sku": "DR046",
    "name": "Ca cao caramel sữa dừa",
    "category": "beverage",
    "subcategory": "latte",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR046",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 46
  },
  {
    "sku": "DR050",
    "name": "Trà mitsu",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "signature",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR050",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 50
  },
  {
    "sku": "DR051",
    "name": "Trà sen vàng",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "hero",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR051",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 51
  },
  {
    "sku": "DR052",
    "name": "Trà gạo sen sữa",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "signature",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR052",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 52
  },
  {
    "sku": "DR053",
    "name": "Trà quấn quýt",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR053",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 53
  },
  {
    "sku": "DR054",
    "name": "Trà dưa lưới",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR054",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 54
  },
  {
    "sku": "DR055",
    "name": "Trà cam hoa nhài",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR055",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 55
  },
  {
    "sku": "DR056",
    "name": "Trà vải hoa hồng",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR056",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 56
  },
  {
    "sku": "DR057",
    "name": "Trà ổi hồng",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR057",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 57
  },
  {
    "sku": "DR058",
    "name": "Trà thơm hạt đác",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "trend",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR058",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 58
  },
  {
    "sku": "DR059",
    "name": "Trà đào",
    "category": "beverage",
    "subcategory": "fruit_tea",
    "role": "hero",
    "price_m": 32000,
    "price_l": 35000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR059",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 59
  },
  {
    "sku": "DR060",
    "name": "Trà sữa mitsu",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR060",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 60
  },
  {
    "sku": "DR061",
    "name": "Trà sữa truyền thống",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "leader",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR061",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 61
  },
  {
    "sku": "DR062",
    "name": "Trà sữa đậu đỏ",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 37000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR062",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 62
  },
  {
    "sku": "DR063",
    "name": "Trà sữa gạo rang",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR063",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 63
  },
  {
    "sku": "DR064",
    "name": "Trà sữa milo",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "standard",
    "price_m": 32000,
    "price_l": 37000,
    "cost_nl": 9600,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR064",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 64
  },
  {
    "sku": "DR065",
    "name": "Trà sữa phomai mặn",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "trend",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR065",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 65
  },
  {
    "sku": "DR066",
    "name": "Trà sữa kem tiramisu",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 30000,
    "price_l": 35000,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR066",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 66
  },
  {
    "sku": "DR067",
    "name": "Trà sữa olong",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "hero",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR067",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 67
  },
  {
    "sku": "DR068",
    "name": "Trà sữa đại hồng bào",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR068",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 68
  },
  {
    "sku": "DR069",
    "name": "Hồng trà shan tuyết",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR069",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 69
  },
  {
    "sku": "DR070",
    "name": "Hồng trà mật hương",
    "category": "beverage",
    "subcategory": "milk_tea",
    "role": "signature",
    "price_m": 28000,
    "price_l": 32000,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR070",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 70
  },
  {
    "sku": "DR080",
    "name": "Sữa chua mitsu",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "signature",
    "price_m": 35000,
    "price_l": null,
    "cost_nl": 10500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR080",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 80
  },
  {
    "sku": "DR081",
    "name": "Sữa chua dâu sấy",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR081",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 81
  },
  {
    "sku": "DR082",
    "name": "Sữa chua việt quất",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR082",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 82
  },
  {
    "sku": "DR083",
    "name": "Sữa chua ca cao",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR083",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 83
  },
  {
    "sku": "DR084",
    "name": "Sữa chua xoài sấy",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR084",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 84
  },
  {
    "sku": "DR085",
    "name": "Sữa chua đào sấy",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR085",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 85
  },
  {
    "sku": "DR086",
    "name": "Sữa chua chanh dây sấy",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR086",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 86
  },
  {
    "sku": "DR087",
    "name": "Sữa chua matcha",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 28000,
    "price_l": null,
    "cost_nl": 8400,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR087",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 87
  },
  {
    "sku": "DR088",
    "name": "Sữa chua đanh đá",
    "category": "beverage",
    "subcategory": "yogurt",
    "role": "standard",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 7500,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR088",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": [
        {
          "id": "thach_them",
          "name": "Thạch thêm",
          "price": 5000
        },
        {
          "id": "tran_chau_them",
          "name": "Trân châu thêm",
          "price": 5000
        },
        {
          "id": "banh_flan_them",
          "name": "Bánh flan thêm",
          "price": 7000
        }
      ]
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 88
  },
  {
    "sku": "DR090",
    "name": "Coldbrew chanh vàng",
    "category": "beverage",
    "subcategory": "coldbrew",
    "role": "hero",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR090",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 90
  },
  {
    "sku": "DR091",
    "name": "Coldbrew mơ muội",
    "category": "beverage",
    "subcategory": "coldbrew",
    "role": "signature",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR091",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 91
  },
  {
    "sku": "DR092",
    "name": "Coldbrew đào",
    "category": "beverage",
    "subcategory": "coldbrew",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR092",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 92
  },
  {
    "sku": "DR093",
    "name": "Coldbrew bưởi hồng",
    "category": "beverage",
    "subcategory": "coldbrew",
    "role": "standard",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR093",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 93
  },
  {
    "sku": "DR094",
    "name": "Coldbrew yuzu",
    "category": "beverage",
    "subcategory": "coldbrew",
    "role": "trend",
    "price_m": 30000,
    "price_l": null,
    "cost_nl": 9000,
    "cost_packaging": 2500,
    "cogs_percent": 0.35,
    "base_id": "base_01",
    "recipe_id": "R_DR094",
    "recipe_json": {},
    "allergens": [],
    "customizations": {
      "sugar": [
        "100%",
        "70%",
        "50%",
        "30%",
        "0%"
      ],
      "ice": [
        "full",
        "less",
        "none"
      ],
      "toppings": []
    },
    "prep_time_sec": 180,
    "available": true,
    "sort_order": 94
  },
  {
    "sku": "BK001",
    "name": "Bánh croissant bơ Pháp",
    "category": "pastry",
    "subcategory": "pastry",
    "role": "pairing",
    "price_m": 28000,
    "price_l": null,
    "cost_nl": 12000,
    "cost_packaging": 1200,
    "cogs_percent": 0.43,
    "base_id": "base_09",
    "recipe_id": "R024",
    "recipe_json": {},
    "allergens": [
      "milk",
      "gluten"
    ],
    "customizations": {},
    "prep_time_sec": 60,
    "available": false,
    "sort_order": 100
  },
  {
    "sku": "BK002",
    "name": "Tiramisu",
    "category": "pastry",
    "subcategory": "pastry",
    "role": "pairing",
    "price_m": 42000,
    "price_l": null,
    "cost_nl": 18000,
    "cost_packaging": 1200,
    "cogs_percent": 0.46,
    "base_id": "base_09",
    "recipe_id": "R025",
    "recipe_json": {},
    "allergens": [
      "milk",
      "gluten",
      "egg"
    ],
    "customizations": {},
    "prep_time_sec": 60,
    "available": false,
    "sort_order": 101
  },
  {
    "sku": "BK003",
    "name": "Bánh mì pate Hà Nội",
    "category": "pastry",
    "subcategory": "pastry",
    "role": "breakfast",
    "price_m": 25000,
    "price_l": null,
    "cost_nl": 10000,
    "cost_packaging": 800,
    "cogs_percent": 0.43,
    "base_id": "base_09",
    "recipe_id": "R026",
    "recipe_json": {},
    "allergens": [
      "gluten",
      "egg"
    ],
    "customizations": {},
    "prep_time_sec": 120,
    "available": false,
    "sort_order": 102
  }
];


function seedMenuFromJson() {
  if (!MENU_JSON.length) {
    throw new Error('Paste nội dung seed/menu_items.json vào biến MENU_JSON ở SeedSheets.gs trước.');
  }
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('MENU');
  if (!sheet) throw new Error('Run initAllSheets() trước');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  MENU_JSON.forEach(function (item) {
    var row = headers.map(function (h) {
      if (h === 'allergens') return JSON.stringify(item.allergens || []);
      if (h === 'customizations_json') return JSON.stringify(item.customizations || {});
      return item[h] != null ? item[h] : '';
    });
    sheet.appendRow(row);
  });
  Logger.log('Seeded ' + MENU_JSON.length + ' menu items.');
}

/**
 * Migration cho Agent ROI (2026-06-07) — chạy 1 lần trên Sheet ĐÃ DEPLOY trước đó.
 * An toàn & idempotent: chỉ thêm cái thiếu, không xoá/ghi đè data.
 *   1. Thêm header 'utm_campaign' (cột 28) vào ORDERS nếu chưa có.
 *   2. Tạo tab MARKETING_LOG nếu chưa có.
 */
function migrateForRoiAgent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. ORDERS: đảm bảo có cột utm_campaign
  var orders = ss.getSheetByName('ORDERS');
  if (orders) {
    var lastCol = orders.getLastColumn();
    var headers = orders.getRange(1, 1, 1, lastCol).getValues()[0];
    if (headers.indexOf('utm_campaign') === -1) {
      orders.getRange(1, lastCol + 1)
        .setValue('utm_campaign')
        .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff');
      Logger.log('ORDERS: added utm_campaign header at col ' + (lastCol + 1));
    } else {
      Logger.log('ORDERS: utm_campaign already present.');
    }
  } else {
    Logger.log('ORDERS sheet missing — chạy initAllSheets() trước.');
  }

  // 2. MARKETING_LOG
  if (typeof initMarketingLog === 'function') {
    initMarketingLog();
  }
  Logger.log('migrateForRoiAgent() done.');
}
