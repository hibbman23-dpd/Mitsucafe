// menu-data.js — Auto-generated từ seed/menu_items.json
// Đừng sửa tay. Dùng: python3 web/tools/gen_menu_data.py
// Cập nhật: 2026-06-17 · 27 món

const CATEGORIES = [
  {
    "id": "phin_coffee",
    "label": "Cà phê phin",
    "emoji": "☕"
  },
  {
    "id": "machine_coffee",
    "label": "Espresso",
    "emoji": "🫗"
  },
  {
    "id": "milk_tea",
    "label": "Trà sữa",
    "emoji": "🧋"
  },
  {
    "id": "fruit_tea",
    "label": "Trà trái cây",
    "emoji": "🍑"
  },
  {
    "id": "blended",
    "label": "Đá xay",
    "emoji": "🧊"
  },
  {
    "id": "kissaten",
    "label": "Kissaten",
    "emoji": "🍵"
  },
  {
    "id": "pastry",
    "label": "Bánh",
    "emoji": "🥐"
  }
];

const MENU_DATA = [
  {
  "sku": "DR001",
  "name": "Cà phê đen đá",
  "name_jp": "ベトナム式ブラックコーヒー",
  "subcategory": "phin_coffee",
  "bee_group": "kin",
  "role": "leader",
  "price_m": 22000,
  "price_l": 27000,
  "customizations": {
    "sugar": [
      "0%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 1,
  "story": "Arabica Lâm Hà — hạt từ chính vùng đất quanh quán"
},
  {
  "sku": "DR002",
  "name": "Cà phê sữa đá phin",
  "name_jp": "コンデンスミルク・コーヒー",
  "subcategory": "phin_coffee",
  "bee_group": "kin",
  "role": "leader",
  "price_m": 25000,
  "price_l": 30000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 2
},
  {
  "sku": "DR003",
  "name": "Bạc xỉu",
  "name_jp": null,
  "subcategory": "phin_coffee",
  "bee_group": "kin",
  "role": "hero",
  "price_m": 28000,
  "price_l": 33000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 3
},
  {
  "sku": "DR004",
  "name": "Cà phê dừa",
  "name_jp": null,
  "subcategory": "phin_coffee",
  "bee_group": "so",
  "role": "hero",
  "price_m": 32000,
  "price_l": 38000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "blended"
    ]
  },
  "allergens": [
    "milk",
    "coconut"
  ],
  "available": true,
  "sort_order": 4
},
  {
  "sku": "DR005",
  "name": "Cà phê muối",
  "name_jp": null,
  "subcategory": "phin_coffee",
  "bee_group": "so",
  "role": "trend",
  "price_m": 30000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 5
},
  {
  "sku": "DR006",
  "name": "Cà phê kem trứng (Egg Coffee)",
  "name_jp": null,
  "subcategory": "phin_coffee",
  "bee_group": "so",
  "role": "signature",
  "price_m": 35000,
  "price_l": 42000,
  "customizations": {
    "sugar": [
      "100%",
      "70%"
    ],
    "ice": [
      "none"
    ],
    "temp": [
      "hot"
    ]
  },
  "allergens": [
    "egg",
    "milk"
  ],
  "available": true,
  "sort_order": 6,
  "story": "Egg coffee Hà Nội — đánh tay 3 phút mỗi ly"
},
  {
  "sku": "DR007",
  "name": "Americano",
  "name_jp": null,
  "subcategory": "machine_coffee",
  "bee_group": "ritsu",
  "role": "leader",
  "price_m": 35000,
  "price_l": 40000,
  "customizations": {
    "sugar": [
      "0%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 7
},
  {
  "sku": "DR008",
  "name": "Latte",
  "name_jp": null,
  "subcategory": "machine_coffee",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 42000,
  "price_l": 48000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "70%"
    ],
    "ice": [
      "none",
      "less"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 8
},
  {
  "sku": "DR009",
  "name": "Cappuccino / Caramel Macchiato",
  "name_jp": null,
  "subcategory": "machine_coffee",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 45000,
  "price_l": 52000,
  "customizations": {
    "sugar": [
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "none",
      "less",
      "full"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 9
},
  {
  "sku": "DR010",
  "name": "Trà sữa truyền thống",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "kin",
  "role": "hero",
  "price_m": 32000,
  "price_l": 38000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": [
      {
        "id": "pearl",
        "name": "trân châu trắng",
        "price": 5000
      },
      {
        "id": "boba_brown",
        "name": "trân châu đường đen",
        "price": 6000
      },
      {
        "id": "coconut_jelly",
        "name": "thạch dừa",
        "price": 5000
      },
      {
        "id": "lotus_seed",
        "name": "hạt sen",
        "price": 8000
      }
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 10
},
  {
  "sku": "DR011",
  "name": "Trà sữa Ô Long Lâm Đồng",
  "name_jp": "ラムドン烏龍ミルクティー",
  "subcategory": "milk_tea",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 38000,
  "price_l": 45000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": [
      {
        "id": "pearl",
        "name": "trân châu trắng",
        "price": 5000
      },
      {
        "id": "boba_brown",
        "name": "trân châu đường đen",
        "price": 6000
      }
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 11,
  "story": "Ô Long từ vườn trà Bảo Lộc cách quán 80km — Lâm Đồng special edition"
},
  {
  "sku": "DR012",
  "name": "Trà sữa trân châu đường đen",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "kin",
  "role": "hero",
  "price_m": 38000,
  "price_l": 45000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 12
},
  {
  "sku": "DR013",
  "name": "Trà sữa nhài Chặng 2",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "kin",
  "role": "hero",
  "price_m": 35000,
  "price_l": 40000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 13
},
  {
  "sku": "DR014",
  "name": "Trà đào cam sả",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 32000,
  "price_l": 38000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%",
      "30%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 14
},
  {
  "sku": "DR015",
  "name": "Trà sen vàng",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 35000,
  "price_l": 42000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 15
},
  {
  "sku": "DR016",
  "name": "Trà vải / Trà thơm",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "seasonal",
  "price_m": 32000,
  "price_l": 38000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 16
},
  {
  "sku": "DR017",
  "name": "Trà chanh giã tay",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "leader",
  "price_m": 22000,
  "price_l": 27000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "full",
      "less"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 17
},
  {
  "sku": "DR018",
  "name": "Freeze trà xanh đá xay",
  "name_jp": null,
  "subcategory": "blended",
  "bee_group": "so",
  "role": "hero",
  "price_m": 42000,
  "price_l": 48000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "blended"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 18
},
  {
  "sku": "DR019",
  "name": "Cookies & Cream đá xay",
  "name_jp": null,
  "subcategory": "blended",
  "bee_group": "so",
  "role": "hero",
  "price_m": 42000,
  "price_l": 48000,
  "customizations": {
    "sugar": [
      "100%",
      "70%"
    ],
    "ice": [
      "blended"
    ]
  },
  "allergens": [
    "milk",
    "gluten"
  ],
  "available": true,
  "sort_order": 19
},
  {
  "sku": "DR020",
  "name": "Matcha đá xay",
  "name_jp": null,
  "subcategory": "blended",
  "bee_group": "so",
  "role": "signature",
  "price_m": 45000,
  "price_l": 52000,
  "customizations": {
    "sugar": [
      "100%",
      "70%",
      "50%"
    ],
    "ice": [
      "blended"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 20
},
  {
  "sku": "DR021",
  "name": "Hojicha Latte",
  "name_jp": "ほうじ茶ラテ",
  "subcategory": "kissaten",
  "bee_group": "so",
  "role": "signature",
  "price_m": 48000,
  "price_l": 55000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "70%"
    ],
    "ice": [
      "none",
      "iced"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 21,
  "story": "Vị trà sao vàng của Kyoto, ngọt khói nhẹ — không đắng như matcha"
},
  {
  "sku": "DR022",
  "name": "Matcha Latte",
  "name_jp": "抹茶ラテ",
  "subcategory": "kissaten",
  "bee_group": "so",
  "role": "signature",
  "price_m": 52000,
  "price_l": 60000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "70%"
    ],
    "ice": [
      "none",
      "iced"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [
    "milk"
  ],
  "available": true,
  "sort_order": 22,
  "story": "Uji matcha — vùng trồng matcha cổ truyền Kyoto"
},
  {
  "sku": "DR023",
  "name": "Yuzu Honey Tea",
  "name_jp": "柚子蜂蜜茶",
  "subcategory": "kissaten",
  "bee_group": "so",
  "role": "seasonal",
  "price_m": 45000,
  "price_l": 52000,
  "customizations": {
    "sugar": [
      "100%",
      "70%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "temp": [
      "hot",
      "iced"
    ]
  },
  "allergens": [],
  "available": true,
  "sort_order": 23,
  "story": "Yuzu — quả citrus đặc trưng Nhật, vị thanh nhẹ"
},
  {
  "sku": "BK001",
  "name": "Bánh croissant bơ Pháp",
  "name_jp": null,
  "subcategory": "pastry",
  "bee_group": "kashi",
  "role": "pairing",
  "price_m": 28000,
  "price_l": null,
  "customizations": {},
  "allergens": [
    "milk",
    "gluten",
    "egg"
  ],
  "available": true,
  "sort_order": 24
},
  {
  "sku": "BK002",
  "name": "Tiramisu",
  "name_jp": null,
  "subcategory": "pastry",
  "bee_group": "kashi",
  "role": "pairing",
  "price_m": 42000,
  "price_l": null,
  "customizations": {},
  "allergens": [
    "milk",
    "gluten",
    "egg"
  ],
  "available": true,
  "sort_order": 25
},
  {
  "sku": "BK003",
  "name": "Bánh mì pate Hà Nội",
  "name_jp": null,
  "subcategory": "pastry",
  "bee_group": "kashi",
  "role": "breakfast",
  "price_m": 25000,
  "price_l": null,
  "customizations": {},
  "allergens": [
    "gluten",
    "egg"
  ],
  "available": true,
  "sort_order": 26
},
  {
  "sku": "BK004",
  "name": "Wagashi (theo mùa)",
  "name_jp": "和菓子",
  "subcategory": "kissaten",
  "bee_group": "so",
  "role": "signature",
  "price_m": 35000,
  "price_l": null,
  "customizations": {},
  "allergens": [
    "gluten"
  ],
  "available": true,
  "sort_order": 27,
  "story": "Wagashi — bánh ngọt truyền thống Nhật theo mùa"
}
];
