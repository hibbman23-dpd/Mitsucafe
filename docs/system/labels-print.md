# Tem dán ly + Phần cứng & Print Server
> Tách từ CLAUDE.md §4 + §5. Index: ../../CLAUDE.md · Đọc khi đụng ESC/POS, Xprinter, Flask print server.

## Hardware

### Mac Mini M4 (Hiện tại)
```
Role: Print server + GAS webhook proxy · 24/7
Bắt buộc setup:
  System Settings → Energy → Prevent sleep: ON
  System Settings → General → Login Items → print_server.py: ON
  System Settings → Software Update → Auto update: OFF (tránh reboot tự động)
  Wake for network access: ON
```

### Raspberry Pi 3+ (Tương lai)
```
Role: Thay Mac Mini · nhỏ gọn, < 5W, không bao giờ tự update
OS: Raspberry Pi OS (Debian)
Setup: pip install python-escpos flask
Boot < 15 giây · Giá ~1.2M
Ưu điểm: Không crash vì update · Headless · Tiêu thụ điện thấp
```

### Local Print Server (chạy trên Mac Mini hoặc RPi)
```python
# print_server.py — Flask server nhận lệnh in từ GAS
from flask import Flask, request
import socket

app = Flask(__name__)
PRINTER_IP   = "192.168.1.xxx"  # IP Xprinter trên LAN
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

# Hoặc nếu POS-58L cắm USB trực tiếp:
# from escpos.printer import Usb
# printer = Usb(0x0FE6, 0x811E)
```

## Tem dán ly — Order Label System

**Trigger**: `updateOrderStatus(order_id, "CONFIRMED")` → tự gọi `printOrderLabels()`.
**Rule**: Mỗi item trong đơn = 1 tem riêng. qty=2 → in 2 tem giống nhau.

### Xprinter POS-58L (Primary)
```
Khổ: 58mm thermal sticker roll
Kết nối: USB hoặc Bluetooth vào Mac Mini/RPi
Use: In nhanh, queue nhiều đơn liên tiếp

Preview tem 58mm:
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
Khổ: 20–80mm die-cut label (tối ưu: 40×30mm)
Kết nối: USB
Use: Đơn takeaway, nhiều modifier, cần QR code order_id

Preview tem 40×30mm:
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
