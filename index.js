require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const { Telegraf } = require('telegraf');

const app = express();
app.use(bodyParser.json());

// Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// /start command
bot.start(ctx => {
  ctx.reply('Welcome — tap Subscribe to open payment page.', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Subscribe',
            web_app: { url: process.env.WEBAPP_URL + '/' }
          }
        ]
      ]
    }
  });
});
// Launch bot
bot.launch().then(() => console.log('Bot started'));

// Create Kora charge
app.post('/create-charge', async (req, res) => {
  try {
    const { userId, amount, email } = req.body;

    const resp = await axios.post(
      'https://api.korahq.com/v1/charges',
      {
        amount,
        currency: 'NGN',
        description: 'Subscription for ${userId}',
        metadata: { userId, email }
      },
      {
        headers: { Authorization: Bearer ${process.env.KORA_SECRET_KEY} }
      }
    );

    return res.json({
      checkout_url: resp.data.data.checkout_url,
      data: resp.data.data
    });

  } catch (err) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ error: 'Charge failed' });
  }
});

// Verify Kora signature
function verifyKoraSignature(req) {
  const sig = req.header('x-korapay-signature') || '';
  const dataStr = req.body && req.body.data ? JSON.stringify(req.body.data) : '';
  const hash = crypto
    .createHmac('sha256', process.env.KORA_SECRET_KEY)
    .update(dataStr)
    .digest('hex');

  return hash === sig;
}

// Webhook
app.post('/kora-webhook', async (req, res) => {
  try {
    if (!verifyKoraSignature(req)) return res.status(400).send('Invalid signature');

    const event = req.body.data;
    const type = event.type;

    if (type === 'charge.success') {
      const userId = event.metadata.userId;

      const invite = await bot.telegram.createChatInviteLink(
        process.env.VIP_GROUP_ID,
        { member_limit: 1, expire_date: Math.floor((Date.now() + 10*60*1000)/1000) }
      );

      await bot.telegram.sendMessage(
        userId,
        Payment confirmed 🎉\nHere is your VIP access:\n${invite.invite_link}
      );
    }

    res.json({ received: true });

  } catch (err) {
    console.error(err);
    res.status(500).send('Webhook error');
  }
});

app.get('/', (req, res) => res.send('Running'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on ' + PORT));