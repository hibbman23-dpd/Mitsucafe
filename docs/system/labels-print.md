# Cup Labels + Hardware & Print Server
> Split from CLAUDE.md §4 + §5. Index: ../../CLAUDE.md · Read when touching ESC/POS, Xprinter, Flask print server.

## Hardware

### Mac Mini M4 (Current)
```
Role: Print server + GAS webhook proxy · 24/7
Required setup:
  System Settings → Energy → Prevent sleep: ON
  System Settings → General → Login Items → print_server.py: ON
  System Settings → Software Update → Auto update: OFF (prevent unexpected reboots)
  Wake for network access: ON
```

### Raspberry Pi 3+ (Future)
```
Role: Replace Mac Mini · compact, < 5W, never self-updates
OS: Raspberry Pi OS (Debian)
Setup: pip install python-escpos flask
Boot < 15 sec · Cost ~1.2M VND
Advantages: No crash-from-update · Headless · Low power draw
```

### Local Print Server (runs on Mac Mini or RPi)
```python
# print_server.py — Flask server that receives print commands from GAS
from flask import Flask, request
import socket

app = Flask(__name__)
PRINTER_IP   = "192.168.1.xxx"  # Xprinter IP on LAN
PRINTER_PORT = 9100              # RAW TCP port

@app.route('/print', methods=['POST'])
def print_label():
    data = request.data
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((PRINTER_IP, PRINTER_PORT))
    sock.send(data)
    sock.close()
    return 'OK', 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

# If POS-58L is connected via USB directly:
# from escpos.printer import Usb
# printer = Usb(0x0FE6, 0x811E)
```

## Cup Label — Order Label System

**Trigger**: `updateOrderStatus(order_id, "CONFIRMED")` → automatically calls `printOrderLabels()`.
**Rule**: Each item in the order gets its own cup label. qty=2 → print 2 identical labels.

### Xprinter POS-58L (Primary)
```
Width: 58mm thermal sticker roll
Connection: USB or Bluetooth to Mac Mini/RPi
Use: Fast print, queues multiple orders back-to-back

Cup label preview 58mm:
┌──────────────────────────┐
│ ORD-0089      Bàn 03     │
│ ────────────────────────  │
│ Bạc xỉu × 1              │
│  Đường: 50% · Đá: ít     │
│  ít ngọt                 │
│ 14:32 · S002             │
└──────────────────────────┘
```

### Xprinter XP-365B (Secondary)
```
Width: 20–80mm die-cut label (optimal: 40×30mm)
Connection: USB
Use: Takeaway orders, many modifiers, needs QR code for order_id

Cup label preview 40×30mm:
┌───────────────────────────┐
│ [QR: ORD-0089]  14:32     │
│ Cappuccino × 2            │
│ Đường: 30% · Đá: none    │
│ TAKEAWAY · S002           │
└───────────────────────────┘
```

### GAS functions
```javascript
function printOrderLabels(order) {
  order.items.forEach(item => {
    for (let i = 0; i < item.qty; i++) {
      const esc = buildLabelEscPos(order, item);
      sendToPrinter(esc);
    }
  });
  updateField(order.order_id, 'label_printed_at', new Date().toISOString());
}

function buildLabelEscPos(order, item) {
  const ESC = '\x1B', GS = '\x1D';
  let d = ESC + '@';                        // Init
  d += ESC + 'a\x01';                      // Center
  d += `ORD-${order.order_id}  ${order.table_id || order.channel}\n`;
  d += ESC + 'a\x00';                      // Left
  d += ('─').repeat(28) + '\n';
  d += `${item.name} x1\n`;
  if (item.modifiers) {
    d += '  ' + Object.entries(item.modifiers)
      .map(([k,v]) => `${k}: ${v}`).join(' · ') + '\n';
  }
  if (order.metadata.notes) d += `  ${order.metadata.notes}\n`;
  d += `${formatTime(order.timestamp)} · ${order.staff_id || ''}\n`;
  d += GS + 'V\x42\x00';                  // Full cut
  return d;
}

function sendToPrinter(escposData) {
  const ip   = getConfig('LABEL_PRINTER_IP');
  const port = getConfig('PRINT_SERVER_PORT') || '5000';
  UrlFetchApp.fetch(`http://${ip}:${port}/print`, {
    method: 'POST',
    contentType: 'application/octet-stream',
    payload: Utilities.newBlob(escposData).getBytes(),
  });
}
```
