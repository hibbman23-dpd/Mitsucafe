// menu-data.js — Auto-generated từ seed/menu_items.json
// Đừng sửa tay. Dùng: python3 web/tools/gen_menu_data.py
// Cập nhật: 2026-08-06 · 74 món

const CATEGORIES = [
  {
    "id": "coffee",
    "label": "Cà phê",
    "emoji": "☕"
  },
  {
    "id": "hot_drinks",
    "label": "Đồ uống nóng",
    "emoji": "🍵"
  },
  {
    "id": "latte",
    "label": "Latte",
    "emoji": "🥛"
  },
  {
    "id": "fruit_tea",
    "label": "Các loại trà",
    "emoji": "🍑"
  },
  {
    "id": "milk_tea",
    "label": "Trà sữa",
    "emoji": "🧋"
  },
  {
    "id": "yogurt",
    "label": "Sữa chua",
    "emoji": "🥣"
  },
  {
    "id": "coldbrew",
    "label": "Coldbrew",
    "emoji": "🧊"
  }
];

// Món tạm hết — order.js dùng để hiện banner thông báo trên trang đặt online.
const MENU_UNAVAILABLE = [];

const MENU_DATA = [
  {
  "sku": "DR001",
  "name": "CF MITSU",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 1
},
  {
  "sku": "DR002",
  "name": "CF SỮA",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "leader",
  "price_m": 20000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 2
},
  {
  "sku": "DR003",
  "name": "CF ĐEN",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "leader",
  "price_m": 18000,
  "price_l": null,
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
  "allergens": [],
  "available": true,
  "sort_order": 3
},
  {
  "sku": "DR004",
  "name": "CF BƠ ĐẬU PHỘNG",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "trend",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 4
},
  {
  "sku": "DR005",
  "name": "CF MUỐI",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "trend",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 5
},
  {
  "sku": "DR006",
  "name": "CF CARAMEL MUỐI HỒNG",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 6
},
  {
  "sku": "DR007",
  "name": "CF DALGONA",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "trend",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 7
},
  {
  "sku": "DR008",
  "name": "CF CHOCOLATE",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 8
},
  {
  "sku": "DR009",
  "name": "CF KEM DẺO BUÔN MÊ",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 9
},
  {
  "sku": "DR010",
  "name": "BẠC SỈU",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "hero",
  "price_m": 20000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 10
},
  {
  "sku": "DR011",
  "name": "PHINDI HẠNH NHÂN",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 11
},
  {
  "sku": "DR012",
  "name": "CA CAO SỮA",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 20000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 12
},
  {
  "sku": "DR013",
  "name": "CA CAO MUỐI",
  "name_jp": null,
  "subcategory": "coffee",
  "bee_group": "kin",
  "role": "trend",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 13
},
  {
  "sku": "DR020",
  "name": "TRÀ GỪNG MẬT ONG",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 20000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 20
},
  {
  "sku": "DR021",
  "name": "TRÀ GỪNG ĐƯỜNG NÂU",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 21
},
  {
  "sku": "DR022",
  "name": "TRÀ THẢO MỘC",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 22
},
  {
  "sku": "DR023",
  "name": "HOA HỒNG TÁO ĐỎ",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 23
},
  {
  "sku": "DR024",
  "name": "THANH YÊN BÁ TƯỚC",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 24
},
  {
  "sku": "DR025",
  "name": "TRÀ ĐÀO CAM QUẾ",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "trend",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 25
},
  {
  "sku": "DR026",
  "name": "CA CAO QUẾ",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 26
},
  {
  "sku": "DR027",
  "name": "MATCHA BATĀ",
  "name_jp": null,
  "subcategory": "hot_drinks",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 27
},
  {
  "sku": "DR030",
  "name": "MATCHA MITSU",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "signature",
  "price_m": 35000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 30
},
  {
  "sku": "DR031",
  "name": "MATCHA CROISSANT",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "signature",
  "price_m": 40000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 31
},
  {
  "sku": "DR032",
  "name": "MATCHA LATTE",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "hero",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 32
},
  {
  "sku": "DR033",
  "name": "MATCHA LATTE MUỐI",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 33
},
  {
  "sku": "DR034",
  "name": "MATCHA COCO",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "standard",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 34
},
  {
  "sku": "DR035",
  "name": "MATCHA ĐẬU ĐỎ",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "standard",
  "price_m": 30000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 35
},
  {
  "sku": "DR036",
  "name": "MATCHA CARAMEL MUỐI HỒNG",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "signature",
  "price_m": 35000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 36
},
  {
  "sku": "DR037",
  "name": "MATCHA BUTTERFLY COCO",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 35000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 37
},
  {
  "sku": "DR038",
  "name": "MATCHA COLDWHISH",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "standard",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 38
},
  {
  "sku": "DR039",
  "name": "CLOUDY MATCHA",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 39
},
  {
  "sku": "DR040",
  "name": "HOUJICHA LATTE",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "hero",
  "price_m": 30000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 40
},
  {
  "sku": "DR041",
  "name": "CA CAO CROISSANT",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "signature",
  "price_m": 40000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 41
},
  {
  "sku": "DR042",
  "name": "CA CAO LATTE",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "standard",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 42
},
  {
  "sku": "DR043",
  "name": "CA CAO LATTE MUỐI",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 43
},
  {
  "sku": "DR044",
  "name": "CA CAO BẠC HÀ",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "standard",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 44
},
  {
  "sku": "DR045",
  "name": "CA CAO OREO KEM DẺO",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 45
},
  {
  "sku": "DR046",
  "name": "CA CAO CARAMEL SỮA DỪA",
  "name_jp": null,
  "subcategory": "latte",
  "bee_group": "so",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 46
},
  {
  "sku": "DR050",
  "name": "TRÀ MITSU",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 50
},
  {
  "sku": "DR051",
  "name": "TRÀ SEN VÀNG",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 51
},
  {
  "sku": "DR052",
  "name": "TRÀ GẠO SEN SỮA",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 52
},
  {
  "sku": "DR053",
  "name": "TRÀ QUẤN QUÝT",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 53
},
  {
  "sku": "DR054",
  "name": "TRÀ DƯA LƯỚI",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 54
},
  {
  "sku": "DR055",
  "name": "TRÀ CAM HOA NHÀI",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 55
},
  {
  "sku": "DR056",
  "name": "TRÀ VẢI HOA HỒNG",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 56
},
  {
  "sku": "DR057",
  "name": "TRÀ ỔI HỒNG",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 57
},
  {
  "sku": "DR058",
  "name": "TRÀ THƠM HẠT ĐÁC",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "trend",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 58
},
  {
  "sku": "DR059",
  "name": "TRÀ ĐÀO",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 59
},
  {
  "sku": "DR095",
  "name": "TRÀ CHANH DÂY",
  "name_jp": null,
  "subcategory": "fruit_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 32000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 59.5
},
  {
  "sku": "DR060",
  "name": "TRÀ SỮA MITSU",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 60
},
  {
  "sku": "DR061",
  "name": "TRÀ SỮA TRUYỀN THỐNG",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "leader",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 61
},
  {
  "sku": "DR062",
  "name": "TRÀ SỮA ĐẬU ĐỎ",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 37000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 62
},
  {
  "sku": "DR063",
  "name": "TRÀ SỮA GẠO RANG",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 63
},
  {
  "sku": "DR064",
  "name": "TRÀ SỮA MILO",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "standard",
  "price_m": 32000,
  "price_l": 37000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 64
},
  {
  "sku": "DR065",
  "name": "TRÀ SỮA PHOMAI MẶN",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "trend",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 65
},
  {
  "sku": "DR066",
  "name": "TRÀ SỮA KEM TIRAMISU",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 30000,
  "price_l": 35000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 66
},
  {
  "sku": "DR067",
  "name": "TRÀ SỮA OLONG",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "hero",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 67
},
  {
  "sku": "DR068",
  "name": "TRÀ SỮA ĐẠI HỒNG BÀO",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 68
},
  {
  "sku": "DR069",
  "name": "HỒNG TRÀ SHAN TUYẾT",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 69
},
  {
  "sku": "DR070",
  "name": "HỒNG TRÀ MẬT HƯƠNG",
  "name_jp": null,
  "subcategory": "milk_tea",
  "bee_group": "ritsu",
  "role": "signature",
  "price_m": 28000,
  "price_l": 32000,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 70
},
  {
  "sku": "DR080",
  "name": "SỮA CHUA MITSU",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "signature",
  "price_m": 35000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 80
},
  {
  "sku": "DR081",
  "name": "SỮA CHUA DÂU SẤY",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 81
},
  {
  "sku": "DR082",
  "name": "SỮA CHUA VIỆT QUẤT",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 82
},
  {
  "sku": "DR083",
  "name": "SỮA CHUA CA CAO",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 83
},
  {
  "sku": "DR084",
  "name": "SỮA CHUA XOÀI SẤY",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 84
},
  {
  "sku": "DR085",
  "name": "SỮA CHUA ĐÀO SẤY",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 85
},
  {
  "sku": "DR086",
  "name": "SỮA CHUA CHANH DÂY SẤY",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 86
},
  {
  "sku": "DR087",
  "name": "SỮA CHUA MATCHA",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 28000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 87
},
  {
  "sku": "DR088",
  "name": "SỮA CHUA ĐANH ĐÁ",
  "name_jp": null,
  "subcategory": "yogurt",
  "bee_group": "kin",
  "role": "standard",
  "price_m": 25000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
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
  "allergens": [],
  "available": true,
  "sort_order": 88
},
  {
  "sku": "DR090",
  "name": "COLDBREW CHANH VÀNG",
  "name_jp": null,
  "subcategory": "coldbrew",
  "bee_group": "so",
  "role": "hero",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 90
},
  {
  "sku": "DR091",
  "name": "COLDBREW MƠ MUỘI",
  "name_jp": null,
  "subcategory": "coldbrew",
  "bee_group": "so",
  "role": "signature",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 91
},
  {
  "sku": "DR092",
  "name": "COLDBREW ĐÀO",
  "name_jp": null,
  "subcategory": "coldbrew",
  "bee_group": "so",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 92
},
  {
  "sku": "DR093",
  "name": "COLDBREW BƯỞI HỒNG",
  "name_jp": null,
  "subcategory": "coldbrew",
  "bee_group": "so",
  "role": "standard",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 93
},
  {
  "sku": "DR094",
  "name": "COLDBREW YUZU",
  "name_jp": null,
  "subcategory": "coldbrew",
  "bee_group": "so",
  "role": "trend",
  "price_m": 30000,
  "price_l": null,
  "customizations": {
    "sugar": [
      "0%",
      "30%",
      "50%",
      "70%",
      "100%"
    ],
    "ice": [
      "full",
      "less",
      "none"
    ],
    "toppings": []
  },
  "allergens": [],
  "available": true,
  "sort_order": 94
}
];
