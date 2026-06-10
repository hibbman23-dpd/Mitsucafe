# Event Schema (Canonical v1.1)
> Tách từ CLAUDE.md §2. Index: ../../CLAUDE.md · Đọc khi sửa doPost / validateOrderPayload / payload webhook.

```json
{
  "event_id":     "EVT-YYYYMMDD-XXXXXX",
  "event_type":   "ORDER_CREATED",
  "timestamp":    "ISO 8601 +07:00",
  "schema_ver":   "1.1",

  "order_id":     "ORD-YYYYMMDD-XXXX",
  "channel":      "web|qr|zalo|facebook|instagram|tiktok|phone",
  "utm_source":   "qr|web|zalo|fb|ig|tiktok|phone",
  "location_id":  "LH01",
  "table_id":     "TABLE_XX | null",
  "staff_id":     "SXXX | null",
  "customer_id":  "0xxxxxxxxx",

  "items": [{
    "sku":        "DRXXX | BKXXX",
    "name":       "Tên món",
    "qty":        1,
    "price":      35000,
    "on_promo":   false,
    "promo_price": null,
    "modifiers":  { "sugar": "50%", "ice": "full|less|none" },
    "recipe_id":  "RXXX"
  }],

  "status":        "NEW",
  "confirmed_at":  null,
  "making_at":     null,
  "ready_at":      null,
  "delivering_at": null,
  "delivered_at":  null,

  "payment": {
    "method":  "vietqr|momo|zalopay|cash",
    "total":   70000,
    "status":  "PENDING|PAID|FAILED"
  },

  "label_printed_at": null,
  "invoice_url":      null,
  "printed_at":       null,

  "metadata": {
    "delivery_type": "dine_in|pickup|delivery",
    "business_line": "kissaten|bakery|retail|catering",
    "category_type": "beverage|pastry|retail|subscription",
    "notes":         ""
  }
}
```
