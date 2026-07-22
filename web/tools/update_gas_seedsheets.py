import json, pathlib

ROOT = pathlib.Path(__file__).parent.parent.parent
SEED_FILE = ROOT / "seed" / "menu_items.json"
SEED_SHEETS_GS = ROOT / "gas" / "SeedSheets.gs"

with open(SEED_FILE, encoding="utf-8") as f:
    items = json.load(f)

json_str = json.dumps(items, ensure_ascii=False, indent=2)

gs_content = SEED_SHEETS_GS.read_text(encoding="utf-8")
start_marker = "var MENU_JSON = ["
end_marker = "];\n\nfunction seedMenuFromJson()"

start_idx = gs_content.find(start_marker)
end_idx = gs_content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_gs = (
        gs_content[:start_idx]
        + "var MENU_JSON = "
        + json_str
        + ";\n\n"
        + gs_content[end_idx + 3:]
    )
    SEED_SHEETS_GS.write_text(new_gs, encoding="utf-8")
    print("✅ Successfully updated gas/SeedSheets.gs")
else:
    print("❌ Marker not found in SeedSheets.gs")
