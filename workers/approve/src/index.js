// Cloudflare Worker: approve
// Hỗ trợ duyệt quyết định từ Telegram + Dead-man switch giám sát Mac Mini

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Route 1: Telegram Webhook (không cần Bearer Auth nhưng verify telegram secret token)
    if (path === '/tg' && request.method === 'POST') {
      const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (env.TG_WEBHOOK_SECRET && secretHeader !== env.TG_WEBHOOK_SECRET) {
        return new Response('Unauthorized Webhook Secret', { status: 403 });
      }
      return await handleTelegramWebhook(request, env);
    }
    
    // Bearer token authentication cho các route khác
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized Bearer Auth Required', { status: 401 });
    }
    const token = authHeader.substring(7);
    if (token !== env.OPS_KEY) {
      return new Response('Forbidden: Invalid Key', { status: 403 });
    }
    
    // Route 2: GET /pull?shop=
    if (path === '/pull' && request.method === 'GET') {
      const shop = url.searchParams.get('shop') || 'mitsu-lamha';
      return await handlePull(shop, env);
    }
    
    // Route 3: POST /ack?shop=
    if (path === '/ack' && request.method === 'POST') {
      const shop = url.searchParams.get('shop') || 'mitsu-lamha';
      return await handleAck(request, shop, env);
    }
    
    // Route 4: GET /ping?job=&shop=
    if (path === '/ping' && request.method === 'GET') {
      const job = url.searchParams.get('job');
      const shop = url.searchParams.get('shop') || 'mitsu-lamha';
      if (!job) return new Response('Missing job parameter', { status: 400 });
      
      await env.KV.put(`hb:${shop}:${job}`, Date.now().toString());
      return new Response('OK', { status: 200 });
    }
    
    return new Response('Not Found', { status: 404 });
  },
  
  // Route 5: Cron Job (Dead-man switch)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkDeadManSwitch(env));
  }
};

// Xử lý Telegram Webhook
async function handleTelegramWebhook(request, env) {
  try {
    const body = await request.json();
    
    // Chỉ xử lý callback_query (nút nhấn inline)
    if (!body.callback_query) {
      return new Response('OK', { status: 200 });
    }
    
    const callbackQuery = body.callback_query;
    const data = callbackQuery.data; // Định dạng "ok:<id>" hoặc "no:<id>"
    const message = callbackQuery.message;
    const chatId = message.chat.id;
    const messageId = message.message_id;
    
    const parts = data.split(':');
    if (parts.length < 2) {
      return new Response('Invalid callback data format', { status: 400 });
    }
    
    const verdict = parts[0]; // "ok" hoặc "no"
    const id = parts[1];
    const shop = 'mitsu-lamha'; // Mặc định hoặc parse từ metadata
    
    // 1) Lưu verdict vào KV
    const verdictData = {
      id,
      verdict,
      ts: Date.now(),
      delivered_ts: null
    };
    await env.KV.put(`verdict:${shop}:${id}`, JSON.stringify(verdictData));
    
    // 2) Trả lời telegram callback query để ẩn trạng thái loading trên nút
    const answerBody = {
      callback_query_id: callbackQuery.id,
      text: verdict === 'ok' ? 'Đã duyệt đồng ý ✓' : 'Đã từ chối ✗'
    };
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answerBody)
    });
    
    // 3) Cập nhật tin nhắn gốc để thông báo kết quả duyệt
    const statusText = verdict === 'ok' ? '👍 ĐÃ DUYỆT ĐỒNG Ý' : '👎 ĐÃ TỪ CHỐI';
    const updatedText = `${message.text}\n\n<b>Kết quả:</b> ${statusText} (vào lúc ${new Date().toLocaleTimeString('vi-VN')})`;
    
    const editBody = {
      chat_id: chatId,
      message_id: messageId,
      text: updatedText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] } // Xóa các nút bấm để tránh bấm lại
    };
    
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editBody)
    });
    
    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

// Xử lý Pull verdicts (Không xóa KV - 2 pha)
async function handlePull(shop, env) {
  const prefix = `verdict:${shop}:`;
  const list = await env.KV.list({ prefix });
  const results = [];
  
  for (const key of list.keys) {
    const valStr = await env.KV.get(key.name);
    if (valStr) {
      const data = JSON.parse(valStr);
      // Ghi nhận thời gian pull nhưng giữ nguyên key
      if (!data.delivered_ts) {
        data.delivered_ts = Date.now();
        await env.KV.put(key.name, JSON.stringify(data));
      }
      results.push(data);
    }
  }
  
  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Xử lý Acknowledge (Xóa KV sau khi Mac Mini lưu đĩa thành công)
async function handleAck(request, shop, env) {
  try {
    const body = await request.json();
    const ids = body.ids || [];
    
    for (const id of ids) {
      await env.KV.delete(`verdict:${shop}:${id}`);
    }
    
    return new Response(JSON.stringify({ success: true, count: ids.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

// Kiểm tra Dead-man switch
async function checkDeadManSwitch(env) {
  const shop = 'mitsu-lamha';
  const prefix = `hb:${shop}:`;
  const list = await env.KV.list({ prefix });
  
  const expectedHours = {
    sheets_pull: 26,
    freshness: 26,
    insight_batch: 26,
    pull_approvals: 3,
    weekly: 8 * 24
  };
  
  const now = Date.now();
  const currentHourVN = (new Date(now + 7 * 3600000)).getUTCHours(); // Múi giờ Việt Nam GMT+7
  
  // Gom các heartbeat thực tế trong KV
  const heartbeats = {};
  for (const key of list.keys) {
    const jobName = key.name.split(':')[2];
    const tsStr = await env.KV.get(key.name);
    if (tsStr) {
      heartbeats[jobName] = parseInt(tsStr, 10);
    }
  }
  
  let alerts = [];
  for (const [job, expectedH] of Object.entries(expectedHours)) {
    // Đối với pull_approvals, chỉ báo động nếu nằm trong khung giờ làm việc 08:00 - 21:00 VN
    if (job === 'pull_approvals' && (currentHourVN < 8 || currentHourVN > 21)) {
      continue;
    }
    
    const lastHb = heartbeats[job];
    if (!lastHb) {
      alerts.push(`Job <code>${job}</code> chưa bao giờ chạy!`);
      continue;
    }
    
    const elapsedH = (now - lastHb) / 3600000;
    if (elapsedH > expectedH) {
      alerts.push(`Job <code>${job}</code> trễ ${elapsedH.toFixed(1)}h (ngưỡng ${expectedH}h)`);
    }
  }
  
  if (alerts.length > 0) {
    const text = `🚨 <b>[Mac Mini Cảnh báo im lặng]</b>\n\n` + alerts.join('\n');
    const tgUrl = `https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`;
    await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TG_CHAT,
        text: text,
        parse_mode: 'HTML'
      })
    });
  }
}
