import json

STANDARD_TOPPINGS = [
    {"id": "thach_them", "name": "Thạch thêm", "price": 5000},
    {"id": "tran_chau_them", "name": "Trân châu thêm", "price": 5000},
    {"id": "banh_flan_them", "name": "Bánh flan thêm", "price": 7000}
]

items = []

def add_item(sku, name, subcat, role, price_m, price_l=None, sugar=None, ice=None, toppings=True, sort_order=1):
    sugar_opts = sugar or ["100%", "70%", "50%", "30%", "0%"]
    ice_opts = ice or ["full", "less", "none"]
    topping_opts = STANDARD_TOPPINGS if toppings else []
    
    customizations = {
        "sugar": sugar_opts,
        "ice": ice_opts
    }
    if topping_opts:
        customizations["toppings"] = topping_opts
    else:
        customizations["toppings"] = []
        
    items.append({
        "sku": sku,
        "name": name,
        "category": "beverage",
        "subcategory": subcat,
        "role": role,
        "price_m": price_m,
        "price_l": price_l,
        "cost_nl": int(price_m * 0.3),
        "cost_packaging": 2500,
        "cogs_percent": 0.35,
        "base_id": "base_01",
        "recipe_id": "R_" + sku,
        "recipe_json": {},
        "allergens": [],
        "customizations": customizations,
        "prep_time_sec": 180,
        "available": True,
        "sort_order": sort_order
    })

# 1. Cà phê (subcat: coffee) — NO TOPPINGS
add_item("DR001", "Cf mitsu", "coffee", "signature", 25000, toppings=False, sort_order=1)
add_item("DR002", "Cf sữa", "coffee", "leader", 20000, toppings=False, sort_order=2)
add_item("DR003", "Cf đen", "coffee", "leader", 18000, sugar=["0%"], toppings=False, sort_order=3)
add_item("DR004", "Cf bơ đậu phộng", "coffee", "trend", 25000, toppings=False, sort_order=4)
add_item("DR005", "Cf muối", "coffee", "trend", 25000, toppings=False, sort_order=5)
add_item("DR006", "Cf caramel muối hồng", "coffee", "signature", 25000, toppings=False, sort_order=6)
add_item("DR007", "Cf dalgona", "coffee", "trend", 25000, toppings=False, sort_order=7)
add_item("DR008", "Cf chocolate", "coffee", "standard", 25000, toppings=False, sort_order=8)
add_item("DR009", "Cf kem dẻo buôn mê", "coffee", "signature", 25000, toppings=False, sort_order=9)
add_item("DR010", "Bạc sỉu", "coffee", "hero", 20000, toppings=False, sort_order=10)
add_item("DR011", "Phindi hạnh nhân", "coffee", "signature", 25000, toppings=False, sort_order=11)
add_item("DR012", "Ca cao sữa", "coffee", "standard", 20000, toppings=False, sort_order=12)
add_item("DR013", "Ca cao muối", "coffee", "trend", 25000, toppings=False, sort_order=13)

# 2. Đồ uống nóng (subcat: hot_drinks)
add_item("DR020", "Trà gừng mật ong", "hot_drinks", "standard", 20000, ice=["none"], toppings=True, sort_order=20)
add_item("DR021", "Trà gừng đường nâu", "hot_drinks", "standard", 25000, ice=["none"], toppings=True, sort_order=21)
add_item("DR022", "Trà thảo mộc", "hot_drinks", "signature", 25000, ice=["none"], toppings=True, sort_order=22)
add_item("DR023", "Hoa hồng táo đỏ", "hot_drinks", "signature", 25000, ice=["none"], toppings=True, sort_order=23)
add_item("DR024", "Thanh yên bá tước", "hot_drinks", "signature", 25000, ice=["none"], toppings=True, sort_order=24)
add_item("DR025", "Trà đào cam quế", "hot_drinks", "trend", 25000, ice=["none"], toppings=True, sort_order=25)
add_item("DR026", "Ca cao quế", "hot_drinks", "standard", 25000, ice=["none"], toppings=True, sort_order=26)
add_item("DR027", "Matcha batā", "hot_drinks", "signature", 25000, ice=["none"], toppings=True, sort_order=27)

# 3. Latte (subcat: latte)
add_item("DR030", "Matcha mitsu", "latte", "signature", 40000, toppings=True, sort_order=30)
add_item("DR031", "Matcha croissant", "latte", "signature", 40000, toppings=True, sort_order=31)
add_item("DR032", "Matcha latte", "latte", "hero", 28000, price_l=32000, toppings=True, sort_order=32)
add_item("DR033", "Matcha latte muối", "latte", "trend", 32000, price_l=35000, toppings=True, sort_order=33)
add_item("DR034", "Matcha coco", "latte", "standard", 28000, price_l=32000, toppings=True, sort_order=34)
add_item("DR035", "Matcha đậu đỏ", "latte", "standard", 30000, price_l=35000, toppings=True, sort_order=35)
add_item("DR036", "Matcha caramel muối hồng", "latte", "signature", 35000, toppings=True, sort_order=36)
add_item("DR037", "Matcha butterfly coco", "latte", "trend", 35000, toppings=True, sort_order=37)
add_item("DR038", "Matcha coldwhish", "latte", "standard", 28000, price_l=32000, toppings=True, sort_order=38)
add_item("DR039", "Cloudy matcha", "latte", "trend", 28000, price_l=32000, toppings=True, sort_order=39)
add_item("DR040", "Houjicha latte", "latte", "hero", 30000, price_l=35000, toppings=True, sort_order=40)
add_item("DR041", "Ca cao croissant", "latte", "signature", 40000, toppings=True, sort_order=41)
add_item("DR042", "Ca cao latte", "latte", "standard", 28000, price_l=32000, toppings=True, sort_order=42)
add_item("DR043", "Ca cao latte muối", "latte", "trend", 32000, price_l=35000, toppings=True, sort_order=43)
add_item("DR044", "Ca cao bạc hà", "latte", "standard", 28000, price_l=32000, toppings=True, sort_order=44)
add_item("DR045", "Ca cao oreo kem dẻo", "latte", "trend", 32000, price_l=35000, toppings=True, sort_order=45)
add_item("DR046", "Ca cao caramel sữa dừa", "latte", "trend", 32000, price_l=35000, toppings=True, sort_order=46)

# 4. Các loại trà (subcat: fruit_tea)
add_item("DR050", "Trà mitsu", "fruit_tea", "signature", 32000, price_l=35000, toppings=True, sort_order=50)
add_item("DR051", "Trà sen vàng", "fruit_tea", "hero", 32000, price_l=35000, toppings=True, sort_order=51)
add_item("DR052", "Trà gạo sen sữa", "fruit_tea", "signature", 32000, price_l=35000, toppings=True, sort_order=52)
add_item("DR053", "Trà quấn quýt", "fruit_tea", "trend", 32000, price_l=35000, toppings=True, sort_order=53)
add_item("DR054", "Trà dưa lưới", "fruit_tea", "standard", 32000, price_l=35000, toppings=True, sort_order=54)
add_item("DR055", "Trà cam hoa nhài", "fruit_tea", "standard", 32000, price_l=35000, toppings=True, sort_order=55)
add_item("DR056", "Trà vải hoa hồng", "fruit_tea", "standard", 32000, price_l=35000, toppings=True, sort_order=56)
add_item("DR057", "Trà ổi hồng", "fruit_tea", "standard", 32000, price_l=35000, toppings=True, sort_order=57)
add_item("DR058", "Trà thơm hạt đác", "fruit_tea", "trend", 32000, price_l=35000, toppings=True, sort_order=58)
add_item("DR059", "Trà đào", "fruit_tea", "hero", 32000, price_l=35000, toppings=True, sort_order=59)

# 5. Trà sữa (subcat: milk_tea)
add_item("DR060", "Trà sữa mitsu", "milk_tea", "signature", 28000, price_l=32000, toppings=True, sort_order=60)
add_item("DR061", "Trà sữa truyền thống", "milk_tea", "leader", 28000, price_l=32000, toppings=True, sort_order=61)
add_item("DR062", "Trà sữa đậu đỏ", "milk_tea", "standard", 32000, price_l=37000, toppings=True, sort_order=62)
add_item("DR063", "Trà sữa gạo rang", "milk_tea", "signature", 28000, price_l=32000, toppings=True, sort_order=63)
add_item("DR064", "Trà sữa milo", "milk_tea", "standard", 32000, price_l=37000, toppings=True, sort_order=64)
add_item("DR065", "Trà sữa phomai mặn", "milk_tea", "trend", 28000, price_l=32000, toppings=True, sort_order=65)
add_item("DR066", "Trà sữa kem tiramisu", "milk_tea", "signature", 30000, price_l=35000, toppings=True, sort_order=66)
add_item("DR067", "Trà sữa olong", "milk_tea", "hero", 28000, price_l=32000, toppings=True, sort_order=67)
add_item("DR068", "Trà sữa đại hồng bào", "milk_tea", "signature", 28000, price_l=32000, toppings=True, sort_order=68)
add_item("DR069", "Hồng trà shan tuyết", "milk_tea", "signature", 28000, price_l=32000, toppings=True, sort_order=69)
add_item("DR070", "Hồng trà mật hương", "milk_tea", "signature", 28000, price_l=32000, toppings=True, sort_order=70)

# 6. Sữa chua & Coldbrew (subcat: yogurt & coldbrew)
add_item("DR080", "Sữa chua mitsu", "yogurt", "signature", 35000, toppings=True, sort_order=80)
add_item("DR081", "Sữa chua dâu sấy", "yogurt", "standard", 30000, toppings=True, sort_order=81)
add_item("DR082", "Sữa chua việt quất", "yogurt", "standard", 30000, toppings=True, sort_order=82)
add_item("DR083", "Sữa chua ca cao", "yogurt", "standard", 30000, toppings=True, sort_order=83)
add_item("DR084", "Sữa chua xoài sấy", "yogurt", "standard", 30000, toppings=True, sort_order=84)
add_item("DR085", "Sữa chua đào sấy", "yogurt", "standard", 30000, toppings=True, sort_order=85)
add_item("DR086", "Sữa chua chanh dây sấy", "yogurt", "standard", 30000, toppings=True, sort_order=86)
add_item("DR087", "Sữa chua matcha", "yogurt", "standard", 28000, toppings=True, sort_order=87)
add_item("DR088", "Sữa chua đanh đá", "yogurt", "standard", 25000, toppings=True, sort_order=88)

# Coldbrew — NO TOPPINGS!
add_item("DR090", "Coldbrew chanh vàng", "coldbrew", "hero", 30000, toppings=False, sort_order=90)
add_item("DR091", "Coldbrew mơ muội", "coldbrew", "signature", 30000, toppings=False, sort_order=91)
add_item("DR092", "Coldbrew đào", "coldbrew", "standard", 30000, toppings=False, sort_order=92)
add_item("DR093", "Coldbrew bưởi hồng", "coldbrew", "standard", 30000, toppings=False, sort_order=93)
add_item("DR094", "Coldbrew yuzu", "coldbrew", "trend", 30000, toppings=False, sort_order=94)

# Pastry items set available = False
items.append({
    "sku": "BK001", "name": "Bánh croissant bơ Pháp", "category": "pastry", "subcategory": "pastry", "role": "pairing",
    "price_m": 28000, "price_l": None, "cost_nl": 12000, "cost_packaging": 1200, "cogs_percent": 0.43, "base_id": "base_09",
    "recipe_id": "R024", "recipe_json": {}, "allergens": ["milk", "gluten"], "customizations": {}, "prep_time_sec": 60,
    "available": False, "sort_order": 100
})
items.append({
    "sku": "BK002", "name": "Tiramisu", "category": "pastry", "subcategory": "pastry", "role": "pairing",
    "price_m": 42000, "price_l": None, "cost_nl": 18000, "cost_packaging": 1200, "cogs_percent": 0.46, "base_id": "base_09",
    "recipe_id": "R025", "recipe_json": {}, "allergens": ["milk", "gluten", "egg"], "customizations": {}, "prep_time_sec": 60,
    "available": False, "sort_order": 101
})
items.append({
    "sku": "BK003", "name": "Bánh mì pate Hà Nội", "category": "pastry", "subcategory": "pastry", "role": "breakfast",
    "price_m": 25000, "price_l": None, "cost_nl": 10000, "cost_packaging": 800, "cogs_percent": 0.43, "base_id": "base_09",
    "recipe_id": "R026", "recipe_json": {}, "allergens": ["gluten", "egg"], "customizations": {}, "prep_time_sec": 120,
    "available": False, "sort_order": 102
})

with open("seed/menu_items.json", "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)

print(f"Generated {len(items)} items into seed/menu_items.json")
