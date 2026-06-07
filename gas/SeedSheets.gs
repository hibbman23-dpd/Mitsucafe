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
    'STAMP_PER_CUP': '1',
    'STAMPS_FOR_FREE': '10',
    'CAFE_NAME': '<tên quán>',
    'CAFE_ADDRESS': '<địa chỉ>',
    'CAFE_PHONE': '<sđt>',
    'PROMO_5PERCENT_ACTIVE': 'false',
    'PROMO_5PERCENT_START': '',
    'PROMO_5PERCENT_END': '',
    'PROMO_5PERCENT_MSG': 'Khuyến mãi đặc biệt: Giảm giá 5% cho toàn bộ menu!',
  };
  Object.keys(defaults).forEach(function (k) {
    if (!getConfig(k)) setConfig(k, defaults[k]);
  });
  Logger.log('Default CONFIG seeded.');
}

/**
 * MENU_JSON — paste nội dung seed/menu_items.json vào đây trước khi chạy.
 * Hoặc dùng UrlFetchApp.fetch nếu repo public.
 */
var MENU_JSON = [
  {"sku":"DR001","name":"Cà phê đen đá","name_jp":"ベトナム式ブラックコーヒー","category":"beverage","subcategory":"phin_coffee","role":"leader","price_m":22000,"price_l":27000,"cost_nl":4500,"cost_packaging":2700,"cogs_percent":0.33,"base_id":"base_05","recipe_id":"R001","allergens":[],"customizations":{"sugar":["0%"],"ice":["full","less","none"]},"prep_time_sec":360,"available":true,"sort_order":1,"story_telling":"Arabica Lâm Hà — hạt từ chính vùng đất quanh quán"},
  {"sku":"DR002","name":"Cà phê sữa đá phin","name_jp":"コンデンスミルク・コーヒー","category":"beverage","subcategory":"phin_coffee","role":"leader","price_m":25000,"price_l":30000,"cost_nl":8300,"cost_packaging":2700,"cogs_percent":0.44,"base_id":"base_05","recipe_id":"R002","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less","none"]},"prep_time_sec":360,"available":true,"sort_order":2},
  {"sku":"DR003","name":"Bạc xỉu","category":"beverage","subcategory":"phin_coffee","role":"hero","price_m":28000,"price_l":33000,"cost_nl":9500,"cost_packaging":2700,"cogs_percent":0.44,"base_id":"base_05","recipe_id":"R003","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less","none"]},"prep_time_sec":300,"available":true,"sort_order":3},
  {"sku":"DR004","name":"Cà phê dừa","category":"beverage","subcategory":"phin_coffee","role":"hero","price_m":32000,"price_l":38000,"cost_nl":10200,"cost_packaging":2700,"cogs_percent":0.40,"base_id":"base_05","recipe_id":"R004","allergens":["milk","coconut"],"customizations":{"sugar":["100%","70%","50%"],"ice":["blended"]},"prep_time_sec":240,"available":true,"sort_order":4},
  {"sku":"DR005","name":"Cà phê muối","category":"beverage","subcategory":"phin_coffee","role":"trend","price_m":30000,"price_l":35000,"cost_nl":10800,"cost_packaging":2700,"cogs_percent":0.45,"base_id":"base_05","recipe_id":"R005","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%"],"ice":["full","less"]},"prep_time_sec":360,"available":true,"sort_order":5},
  {"sku":"DR006","name":"Cà phê kem trứng (Egg Coffee)","category":"beverage","subcategory":"phin_coffee","role":"signature","price_m":35000,"price_l":42000,"cost_nl":13500,"cost_packaging":2700,"cogs_percent":0.46,"base_id":"base_05","recipe_id":"R006","allergens":["egg","milk"],"customizations":{"sugar":["100%","70%"],"ice":["none"],"temp":["hot"]},"prep_time_sec":420,"available":true,"sort_order":6,"story_telling":"Egg coffee Hà Nội — đánh tay 3 phút mỗi ly"},
  {"sku":"DR007","name":"Americano","category":"beverage","subcategory":"machine_coffee","role":"leader","price_m":35000,"price_l":40000,"cost_nl":7500,"cost_packaging":2700,"cogs_percent":0.29,"base_id":"base_04","recipe_id":"R007","allergens":[],"customizations":{"sugar":["0%","30%"],"ice":["full","less","none"],"temp":["hot","iced"]},"prep_time_sec":90,"available":true,"sort_order":7},
  {"sku":"DR008","name":"Latte","category":"beverage","subcategory":"machine_coffee","role":"hero","price_m":42000,"price_l":48000,"cost_nl":12000,"cost_packaging":2700,"cogs_percent":0.35,"base_id":"base_04","recipe_id":"R008","allergens":["milk"],"customizations":{"sugar":["0%","30%","70%"],"ice":["none","less"],"temp":["hot","iced"]},"prep_time_sec":180,"available":true,"sort_order":8},
  {"sku":"DR009","name":"Cappuccino / Caramel Macchiato","category":"beverage","subcategory":"machine_coffee","role":"hero","price_m":45000,"price_l":52000,"cost_nl":13000,"cost_packaging":2700,"cogs_percent":0.35,"base_id":"base_04","recipe_id":"R009","allergens":["milk"],"customizations":{"sugar":["50%","70%","100%"],"ice":["none","less","full"],"temp":["hot","iced"]},"prep_time_sec":200,"available":true,"sort_order":9},
  {"sku":"DR010","name":"Trà sữa truyền thống","category":"beverage","subcategory":"milk_tea","role":"hero","price_m":32000,"price_l":38000,"cost_nl":10500,"cost_packaging":2700,"cogs_percent":0.41,"base_id":"base_01","recipe_id":"R010","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less","none"],"toppings":[{"id":"pearl","name":"trân châu trắng","price":5000},{"id":"boba_brown","name":"trân châu đường đen","price":6000},{"id":"coconut_jelly","name":"thạch dừa","price":5000},{"id":"lotus_seed","name":"hạt sen","price":8000}]},"prep_time_sec":180,"available":true,"sort_order":10},
  {"sku":"DR011","name":"Trà sữa Ô Long Lâm Đồng","name_jp":"ラムドン烏龍ミルクティー","category":"beverage","subcategory":"milk_tea","role":"signature","price_m":38000,"price_l":45000,"cost_nl":12500,"cost_packaging":2700,"cogs_percent":0.40,"base_id":"base_02","recipe_id":"R011","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less","none"],"toppings":[{"id":"pearl","name":"trân châu trắng","price":5000},{"id":"boba_brown","name":"trân châu đường đen","price":6000}]},"prep_time_sec":180,"available":true,"sort_order":11,"story_telling":"Ô Long từ vườn trà Bảo Lộc cách quán 80km — Lâm Đồng special edition"},
  {"sku":"DR012","name":"Trà sữa trân châu đường đen","category":"beverage","subcategory":"milk_tea","role":"hero","price_m":38000,"price_l":45000,"cost_nl":13800,"cost_packaging":2700,"cogs_percent":0.43,"base_id":"base_01","recipe_id":"R012","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%"],"ice":["full","less"]},"prep_time_sec":180,"available":true,"sort_order":12},
  {"sku":"DR013","name":"Trà sữa nhài Chặng 2","category":"beverage","subcategory":"milk_tea","role":"hero","price_m":35000,"price_l":40000,"cost_nl":11000,"cost_packaging":2700,"cogs_percent":0.39,"base_id":"base_03","recipe_id":"R013","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less","none"]},"prep_time_sec":180,"available":true,"sort_order":13},
  {"sku":"DR014","name":"Trà đào cam sả","category":"beverage","subcategory":"fruit_tea","role":"hero","price_m":32000,"price_l":38000,"cost_nl":10800,"cost_packaging":2700,"cogs_percent":0.42,"base_id":"base_01","recipe_id":"R014","allergens":[],"customizations":{"sugar":["100%","70%","50%","30%"],"ice":["full","less"]},"prep_time_sec":180,"available":true,"sort_order":14},
  {"sku":"DR015","name":"Trà sen vàng","category":"beverage","subcategory":"fruit_tea","role":"hero","price_m":35000,"price_l":42000,"cost_nl":12200,"cost_packaging":2700,"cogs_percent":0.43,"base_id":"base_02","recipe_id":"R015","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%"],"ice":["full","less"]},"prep_time_sec":240,"available":true,"sort_order":15},
  {"sku":"DR016","name":"Trà vải / Trà thơm","category":"beverage","subcategory":"fruit_tea","role":"seasonal","price_m":32000,"price_l":38000,"cost_nl":10500,"cost_packaging":2700,"cogs_percent":0.41,"base_id":"base_03","recipe_id":"R016","allergens":[],"customizations":{"sugar":["100%","70%","50%"],"ice":["full","less"]},"prep_time_sec":150,"available":true,"sort_order":16},
  {"sku":"DR017","name":"Trà chanh giã tay","category":"beverage","subcategory":"fruit_tea","role":"leader","price_m":22000,"price_l":27000,"cost_nl":6000,"cost_packaging":2700,"cogs_percent":0.40,"base_id":"base_01","recipe_id":"R017","allergens":[],"customizations":{"sugar":["100%","70%","50%"],"ice":["full","less"]},"prep_time_sec":180,"available":true,"sort_order":17},
  {"sku":"DR018","name":"Freeze trà xanh đá xay","category":"beverage","subcategory":"blended","role":"hero","price_m":42000,"price_l":48000,"cost_nl":13000,"cost_packaging":2700,"cogs_percent":0.37,"recipe_id":"R018","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%"],"ice":["blended"]},"prep_time_sec":240,"available":true,"sort_order":18},
  {"sku":"DR019","name":"Cookies & Cream đá xay","category":"beverage","subcategory":"blended","role":"hero","price_m":42000,"price_l":48000,"cost_nl":13500,"cost_packaging":2700,"cogs_percent":0.39,"recipe_id":"R019","allergens":["milk","gluten"],"customizations":{"sugar":["100%","70%"],"ice":["blended"]},"prep_time_sec":240,"available":true,"sort_order":19},
  {"sku":"DR020","name":"Matcha đá xay","category":"beverage","subcategory":"blended","role":"signature","price_m":45000,"price_l":52000,"cost_nl":13500,"cost_packaging":2700,"cogs_percent":0.36,"recipe_id":"R020","allergens":["milk"],"customizations":{"sugar":["100%","70%","50%"],"ice":["blended"]},"prep_time_sec":240,"available":true,"sort_order":20},
  {"sku":"DR021","name":"Hojicha Latte","name_jp":"ほうじ茶ラテ","category":"beverage","subcategory":"kissaten","role":"signature","price_m":48000,"price_l":55000,"cost_nl":11500,"cost_packaging":2700,"cogs_percent":0.30,"recipe_id":"R021","allergens":["milk"],"customizations":{"sugar":["0%","30%","70%"],"ice":["none","iced"],"temp":["hot","iced"]},"prep_time_sec":240,"available":true,"sort_order":21,"story_telling":"Vị trà sao vàng của Kyoto, ngọt khói nhẹ — không đắng như matcha"},
  {"sku":"DR022","name":"Matcha Latte","name_jp":"抹茶ラテ","category":"beverage","subcategory":"kissaten","role":"signature","price_m":52000,"price_l":60000,"cost_nl":14500,"cost_packaging":2700,"cogs_percent":0.33,"recipe_id":"R022","allergens":["milk"],"customizations":{"sugar":["0%","30%","70%"],"ice":["none","iced"],"temp":["hot","iced"]},"prep_time_sec":300,"available":true,"sort_order":22,"story_telling":"Uji matcha — vùng trồng matcha cổ truyền Kyoto"},
  {"sku":"DR023","name":"Yuzu Honey Tea","name_jp":"柚子蜂蜜茶","category":"beverage","subcategory":"kissaten","role":"seasonal","price_m":45000,"price_l":52000,"cost_nl":14000,"cost_packaging":2700,"cogs_percent":0.37,"recipe_id":"R023","allergens":[],"customizations":{"sugar":["100%","70%"],"ice":["full","less","none"],"temp":["hot","iced"]},"prep_time_sec":120,"available":true,"sort_order":23,"story_telling":"Yuzu — quả citrus đặc trưng Nhật, vị thanh nhẹ"},
  {"sku":"BK001","name":"Bánh croissant bơ Pháp","category":"pastry","subcategory":"pastry","role":"pairing","price_m":28000,"cost_nl":12000,"cost_packaging":800,"cogs_percent":0.46,"recipe_id":"R024","allergens":["milk","gluten","egg"],"available":true,"sort_order":24},
  {"sku":"BK002","name":"Tiramisu","category":"pastry","subcategory":"pastry","role":"pairing","price_m":42000,"cost_nl":18000,"cost_packaging":1200,"cogs_percent":0.46,"recipe_id":"R025","allergens":["milk","gluten","egg"],"available":true,"sort_order":25},
  {"sku":"BK003","name":"Bánh mì pate Hà Nội","category":"pastry","subcategory":"pastry","role":"breakfast","price_m":25000,"cost_nl":10000,"cost_packaging":800,"cogs_percent":0.43,"recipe_id":"R026","allergens":["gluten","egg"],"available":true,"sort_order":26},
  {"sku":"BK004","name":"Wagashi (theo mùa)","name_jp":"和菓子","category":"pastry","subcategory":"kissaten","role":"signature","price_m":35000,"cost_nl":14000,"cost_packaging":1200,"cogs_percent":0.43,"recipe_id":"R027","allergens":["gluten"],"available":true,"sort_order":27,"story_telling":"Wagashi — bánh ngọt truyền thống Nhật theo mùa"}
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
