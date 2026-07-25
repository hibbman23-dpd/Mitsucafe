"""bill_engine.py — order-line editing, kitchen-cancellation detection, split/merge.

Pure helpers over OrderStore. No Flask. The print server's routes call these and
then drive PrintSpool for any tickets/bills that result.
"""

import json

_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _line_key(it):
    """Identity of a line for qty aggregation: SKU/name PLUS its modifiers, so two
    lines of the same drink with different size/ice/sugar/toppings are distinct
    (a size swap must register as a drop of the old variant)."""
    base = it.get("sku") or it.get("name") or ""
    mods = it.get("modifiers") or {}
    return base + "|" + json.dumps(mods, sort_keys=True, ensure_ascii=False)


def diff_removed_kitchen_lines(old_items, new_items):
    """Lines whose quantity dropped between old and new (removed or reduced).

    Returns [{name, sku, removed_qty}] — the basis for a kitchen cancellation ticket.
    Added lines and quantity increases are ignored.
    """
    new_qty = {}
    for it in new_items or []:
        new_qty[_line_key(it)] = new_qty.get(_line_key(it), 0) + int(it.get("qty", 1))
    removed = []
    seen_old = {}
    for it in old_items or []:
        seen_old[_line_key(it)] = seen_old.get(_line_key(it), 0) + int(it.get("qty", 1))
    for key, oldq in seen_old.items():
        drop = oldq - new_qty.get(key, 0)
        if drop > 0:
            sample = next((i for i in old_items if _line_key(i) == key), {})
            removed.append({"name": sample.get("name", ""), "sku": sample.get("sku", ""),
                            "modifiers": sample.get("modifiers", {}), "removed_qty": drop})
    return removed


def apply_items_edit(store, order_id, new_items, expected_version):
    """Persist edited line items and report which kitchen lines were cancelled/reduced."""
    current = store.get(order_id)
    if current is None:
        raise KeyError(order_id)
    cancelled = diff_removed_kitchen_lines(current["items"], new_items)
    updated = store.set_items(order_id, new_items, expected_version)
    return {"order": updated, "cancelled_lines": cancelled}


def _qty_map(items):
    """Build a map {_line_key: total_qty} from a list of items."""
    m = {}
    for it in items or []:
        m[_line_key(it)] = m.get(_line_key(it), 0) + int(it.get("qty", 1))
    return m


def split_order(store, order_id, partitions, expected_version):
    """Fork an order's line items into sub-orders <id>-A, <id>-B, ...

    Every origin line quantity (modifier-aware) must be fully accounted for across
    partitions. Version check + inserts + origin->SPLIT happen atomically in the store.
    """
    if not partitions:
        raise ValueError("partitions required")
    if len(partitions) > len(_LETTERS):
        raise ValueError("too many partitions (max 26)")
    origin = store.get(order_id)
    if origin is None:
        raise KeyError(order_id)
    origin_qty = _qty_map(origin["items"])
    part_qty = {}
    for part in partitions:
        for key, q in _qty_map(part).items():
            part_qty[key] = part_qty.get(key, 0) + q
    if part_qty != origin_qty:
        raise ValueError(f"partitions do not sum to origin: {part_qty} != {origin_qty}")
    suborders = []
    for i, part in enumerate(partitions):
        suborders.append({
            "order_id": f"{order_id}-{_LETTERS[i]}",
            "parent_order_id": order_id,
            "short_code": f"{origin.get('short_code','')}{_LETTERS[i]}",
            "delivery_type": origin.get("delivery_type", "dine_in"),
            "table_id": origin.get("table_id", ""),
            "source": origin.get("source", "staff"),
            "items": part,
        })
    return store.split_atomic(order_id, suborders, expected_version)


def merge_bill(store, order_ids):
    """Tag whole orders with one shared bill_group_id for a single combined bill."""
    if len(order_ids) < 2:
        raise ValueError("merge needs >= 2 orders")
    group_id = "BG-" + order_ids[0]
    orders = store.set_bill_group(order_ids, group_id)
    return {"group_id": group_id, "orders": orders}
