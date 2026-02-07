export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  const body = req.body;
  const message = body.message;
  const callback = body.callback_query;

  const BOT_TOKEN = process.env.BOT_TOKEN;
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  async function sendMessage(chatId, text, keyboard = null) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: keyboard,
      }),
    });
  }

  async function setState(chatId, data) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "\u200E",
        reply_markup: { remove_keyboard: true },
      }),
    });
    global.states = global.states || {};
    global.states[chatId] = data;
  }

  global.states = global.states || {};

  // ---------- CALLBACK BUTTON ----------
  if (callback) {
    const chatId = callback.message.chat.id;

    if (callback.data === "start_summary") {
      global.states[chatId] = { step: 1 };
      await sendMessage(chatId, "✍️ لطفاً متن *خطبه اول (مذهبی)* را ارسال کنید:", {
        force_reply: true,
      });
    }

    return res.status(200).send("OK");
  }

  if (!message || !message.text) {
    return res.status(200).send("OK");
  }

  const chatId = message.chat.id;
  const text = message.text;

  // ---------- START ----------
  if (text === "/start") {
    await sendMessage(
      chatId,
      "سلام 🌱\n\nبرای شروع خلاصه‌سازی خطبه نماز جمعه، روی دکمه زیر بزنید:",
      {
        inline_keyboard: [[{ text: "📌 خلاصه‌سازی خطبه نماز جمعه", callback_data: "start_summary" }]],
      }
    );
    return res.status(200).send("OK");
  }

  const state = global.states[chatId];

  // ---------- STEP 1 ----------
  if (state?.step === 1) {
    state.khutbah1 = text;
    state.step = 2;
    await sendMessage(chatId, "✅ دریافت شد.\n\n✍️ حالا *متن خطبه دوم (سیاسی)* را ارسال کنید:");
    return res.status(200).send("OK");
  }

  // ---------- STEP 2 ----------
  if (state?.step === 2) {
    state.khutbah2 = text;

    await sendMessage(chatId, "⏳ در حال خلاصه‌سازی خطبه‌ها، لطفاً صبر کنید...");

    const prompt = `
شما یک دستیار متخصص در خلاصه‌سازی و تحلیل محتوای خطبه‌های نماز جمعه هستید. من متن دو خطبه را به شما می‌دهم. وظیفه شما این است که یک خروجی دقیقاً با فرمت JSON و طبق دستورالعمل‌های زیر تولید کنید.

**متن خطبه اول:**
${state.khutbah1}

**متن خطبه دوم:**
${state.khutbah2}

خروجی باید **فقط و فقط** یک آبجکت JSON معتبر باشد و هیچ متن اضافی دیگری نداشته باشد.
`;

    const schema = {
      type: "OBJECT",
      properties: {
        impactfulTitle: { type: "STRING" },
        khutbah1: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            summary: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  heading: { type: "STRING" },
                  explanation: { type: "STRING" },
                },
                required: ["heading", "explanation"],
              },
            },
          },
          required: ["title", "summary"],
        },
        khutbah2: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            summary: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  heading: { type: "STRING" },
                  explanation: { type: "STRING" },
                },
                required: ["heading", "explanation"],
              },
            },
          },
          required: ["title", "summary"],
        },
        overallSummary: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            text: { type: "STRING" },
          },
          required: ["title", "text"],
        },
      },
      required: ["impactfulTitle", "khutbah1", "khutbah2", "overallSummary"],
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
          },
        }),
      }
    );

    const result = await response.json();
    const data = JSON.parse(result.candidates[0].content.parts[0].text);

    let output = `🟢 *${data.impactfulTitle}*\n\n`;

    output += `📌 *${data.khutbah1.title}*\n`;
    data.khutbah1.summary.forEach(i => {
      output += `▪️ *${i.heading}*\n${i.explanation}\n\n`;
    });

    output += `📌 *${data.khutbah2.title}*\n`;
    data.khutbah2.summary.forEach(i => {
      output += `▪️ *${i.heading}*\n${i.explanation}\n\n`;
    });

    output += `🧾 *${data.overallSummary.title}*\n${data.overallSummary.text}`;

    await sendMessage(chatId, output, {
      inline_keyboard: [[{ text: "🔁 خلاصه‌سازی دوباره", callback_data: "start_summary" }]],
      parse_mode: "Markdown",
    });

    delete global.states[chatId];
    return res.status(200).send("OK");
  }

  res.status(200).send("OK");
}

