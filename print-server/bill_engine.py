"""bill_engine.py — order-line editing, kitchen-cancellation detection, split/merge.

Pure helpers over OrderStore. No Flask. The print server's routes call these and
then drive PrintSpool for any tickets/bills that result.
"""

import json


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
