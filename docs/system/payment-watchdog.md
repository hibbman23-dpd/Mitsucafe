# Watchdog — Alert when banking app on payment phone goes offline

> Listener runs on a **dedicated Android phone** (MacroDroid reads Vietcombank OTT notifications → webhook `bank_notification`). NOT combined with the signage display.
> This watchdog detects when the phone kills the app / loses connectivity and **sends a Telegram alert to the owner**, so bank-transfer orders don't silently stop being auto-matched.

## Mechanism

```
[Phone] MacroDroid macro "every 10 minutes" → GET ?action=payment_heartbeat&token=<TOKEN>
        │                                              │
        │                                   GAS: recordPaymentHeartbeat()
        │                                   → CONFIG.PAYMENT_LISTENER_LAST_SEEN = now
        ▼
[GAS trigger 15 min] checkPaymentListenerWatchdog()
   if (time 6:00–23:00) and (silent > 25 min) and (not yet alerted)
   → Telegram "⚠️ điện thoại có thể đã tắt app…"  + set ALERTED flag
   when phone pings again → "✅ hoạt động lại" + clear flag
```

Code: `gas/Payment.gs` (recordPaymentHeartbeat · checkPaymentListenerWatchdog · installPaymentWatchdogTrigger · getPaymentListenerStatus). Route: `gas/Code.gs` action `payment_heartbeat`.
Parameters (edit at the top of the WATCHDOG block in Payment.gs): `PAYMENT_HEARTBEAT_SILENCE_MIN=25`, hours `6–23`.

## Setup (one-time)

### 1. Deploy GAS
```
cd gas && clasp push
```
Apps Script editor → Deploy → Manage deployments → Edit → New version.

### 2. Install watchdog trigger
Apps Script editor → select function `installPaymentWatchdogTrigger` → Run (grant permissions if prompted). Creates a 15-minute trigger. Verify in the Triggers tab (clock icon): `checkPaymentListenerWatchdog` every 15 minutes.

### 3. Heartbeat macro on phone (MacroDroid)
On the phone running the listener:
- **Trigger:** Regular Interval → every **10 minutes**.
- **Action:** HTTP Request (GET) →
  `https://<GAS_URL>/exec?action=payment_heartbeat&token=<REPORT_API_TOKEN>`
  (TOKEN = value of `CONFIG.REPORT_API_TOKEN`).
- Save and enable the macro.

> This is the SECOND macro, independent from the existing bank-notification reader macro.

### 4. Prevent MacroDroid from being killed by Android (important)
On the phone: Settings → Battery → MacroDroid = **Unrestricted**; enable MacroDroid **persistent notification**; whitelist from all task-killers. (Apply the same config to the bank-notification reader macro.)

## Testing

- Manual call: `curl "https://<GAS_URL>/exec?action=payment_heartbeat&token=<TOKEN>"` → `{"ok":true}`; CONFIG shows updated `PAYMENT_LISTENER_LAST_SEEN`.
- Simulate lost signal (during open hours): temporarily set `PAYMENT_HEARTBEAT_SILENCE_MIN` to `0`, run `checkPaymentListenerWatchdog` manually in the editor → must receive Telegram alert. Restore to `25` after testing.
- Send one ping → the next watchdog or heartbeat run must send "✅ hoạt động lại".

## Notes
- 15-minute trigger complies with the "no trigger < 15 minutes" rule (CLAUDE.md §4).
- Outside 6:00–23:00 the watchdog is silent (phone may be off when shop is closed) → no false alerts at night.
- Future upgrade to remove the phone entirely: switch `bank_notification` source to a cloud webhook (SePay/Casso) — this watchdog would then be unnecessary.
