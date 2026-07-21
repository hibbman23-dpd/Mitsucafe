# Google Sheets Schema
> Tách từ CLAUDE.md §3. Index: ../../CLAUDE.md · Đọc khi đụng cột Sheets hoặc CONFIG keys.

## Tab: ORDERS (append-only)
```
order_id | event_id | timestamp | channel | utm_source | location_id |
table_id | staff_id | customer_id | items_json | subtotal | total |
status | confirmed_at | making_at | ready_at | delivering_at | delivered_at |
payment_method | payment_status | label_printed_at | invoice_url | printed_at | notes
```

## Tab: MENU
```
sku | name | category (beverage|pastry|retail) | price | cost |
on_promo | promo_price | promo_start | promo_end |
available | recipe_id | image_url | sort_order
```

## Tab: INVENTORY
```
ingredient_id | name | unit | current_stock | min_stock |
cost_per_unit | supplier | last_updated
```

## Tab: CUSTOMERS
```
customer_id | name | phone | zalo_id | first_order | last_order |
total_orders | total_spent |
stamp_count | stamp_total_ever | free_drinks_earned | free_drinks_used |
notes
```
> `stamp_count` reset về 0 sau mỗi lần đổi free drink.
> `stamp_total_ever` không bao giờ reset — dùng để tính free_drinks_earned.
> `stamp_count` chỉ cộng khi category_type = "beverage".

## Tab: STAFF
```
staff_id | name | role | pin | active | hourly_rate | shift_start | shift_end
```

## Tab: PROMOTIONS (Campaign-based — không phải daily)
```
campaign_id | name | type (flash|discount|bogo|happy_hour) |
discount_value | discount_type (pct|fixed) |
schedule_type (one_time|weekly|daily) |
start_date | end_date |
start_time | end_time |
days_of_week (Mon,Fri,Sat hoặc * = mọi ngày) |
target_skus (null = tất cả beverage) |
currently_running | zalo_sent | telegram_sent | slides_updated | is_active
```

## Tab: CONFIG
```
TELEGRAM_BOT_TOKEN    | xxx
TELEGRAM_CHAT_ID      | xxx
ZALO_OA_TOKEN         | xxx
VIETQR_ACCOUNT        | xxx
VIETQR_BANK_CODE      | VCB|TCB|...
VIETQR_ACCT_NAME      | xxx
LOCATION_ID           | LH01
PROMO_SLIDES_ID       | xxx
INVOICE_TEMPLATE_ID   | xxx
LABEL_PRINTER_IP      | 192.168.1.xxx  (IP local của máy in)
LABEL_PRINTER_PORT    | 9100           (RAW TCP port)
LABEL_PRINTER_MODEL   | POS-58L        (POS-58L hoặc XP-365B)
PRINT_SERVER_PORT     | 5000           (Port Flask server trên Mac Mini)
STAMP_PER_CUP         | 1
STAMPS_FOR_FREE       | 10
STORE_NAME            | Mitsu Café     (tên in trên hoá đơn — đổi nếu còn "Kaeru Kàphê")
REPORT_API_TOKEN      | xxx            (token endpoint KDS/Mac Mini poller — xem SECURITY_DEPLOY.md)
BANK_WEBHOOK_SECRET   | xxx            (tuỳ chọn — bật fail-closed cho webhook bank_notification; khớp field "secret" của MacroDroid)
HEALER_QUEUE_TOKEN    | xxx            (self-healing v2 — token hẹp riêng cho user macOS _healer, chỉ gọi được healer_pull/healer_update, fail-closed nếu chưa set)
HEALER_WEBHOOK_SECRET | xxx            (self-healing v2 — secret_token cho Telegram webhook duyệt/bỏ fix, khác REPORT_API_TOKEN/HEALER_QUEUE_TOKEN)
```
