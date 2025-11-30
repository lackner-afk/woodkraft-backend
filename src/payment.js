const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const Product = require('../models/Product');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.post('/create-payment-intent', async (req, res) => {
  try {
    const { orderId } = req.body;
    console.log('Creating payment intent for order:', orderId);

    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Order not found:', orderId);
      return res.status(404).json({ message: 'Order not found' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.total * 100),
      currency: 'eur',
      metadata: { orderId },
      payment_method_types: ['card', 'sepa_debit'], // Removed apple_pay and google_pay
    });

    order.paymentIntentId = paymentIntent.id;
    await order.save();

    console.log('Payment intent created:', paymentIntent.id, 'Method types:', paymentIntent.payment_method_types);
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Error creating payment intent:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('Inside webhook handler: STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET || 'Undefined');
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Webhook received (raw body):', req.body.toString('utf8'));

  if (!webhookSecret) {
    console.error('Webhook error: STRIPE_WEBHOOK_SECRET is not defined');
    return res.status(400).json({ message: 'STRIPE_WEBHOOK_SECRET is not defined' });
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log('Webhook event:', event.type);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      console.log('PaymentIntent:', paymentIntent.id, 'Payment method:', paymentIntent.payment_method_types);

      const order = await Order.findOne({ paymentIntentId: paymentIntent.id }).populate('items.product');
      if (order) {
        console.log('Order found:', order._id, 'Current status:', order.status);

        if (!order.stockUpdated) {
          for (const item of order.items) {
            const product = await Product.findById(item.product);
            if (!product) {
              console.log(`Product not found: ${item.product}`);
              continue;
            }
            if (product.stock < item.quantity) {
              console.log(`Insufficient stock for ${product.name}: ${product.stock} available, ${item.quantity} requested`);
              continue;
            }
            product.stock -= item.quantity;
            console.log(`Reduced stock for ${product.name}: ${product.stock + item.quantity} -> ${product.stock}`);
            await product.save();
          }

          order.stockUpdated = true;
          order.status = 'completed';
          await order.save();
          console.log('Order updated to completed and stock updated:', order._id);

          const orderDetails = order.items
            .map((item) => `${item.product.name} (x${item.quantity}): ${(item.product.price * item.quantity).toFixed(2)} €`)
            .join('\n');
          const address = `${order.shippingAddress.name}\n${order.shippingAddress.street}\n${order.shippingAddress.postalCode} ${order.shippingAddress.city}\n${order.shippingAddress.country}`;

          const customerMailOptions = {
            from: process.env.EMAIL_USER,
            to: order.customerEmail,
            subject: `Bestellbestätigung #${order._id}`,
            html: `
              <h2>Vielen Dank für Ihre Bestellung!</h2>
              <p>Ihre Bestellung mit der Nummer <strong>#${order._id}</strong> wurde erfolgreich aufgegeben.</p>
              <h3>Bestellübersicht</h3>
              <pre>${orderDetails}</pre>
              <p><strong>Gesamt: ${order.total.toFixed(2)} €</strong></p>
              <h3>Lieferadresse</h3>
              <pre>${address}</pre>
              <p>Zahlungsstatus: Bezahlt (PaymentIntent: ${paymentIntent.id})</p>
              <p>Wir werden Sie informieren, sobald Ihre Bestellung versandt wird.</p>
              <p>Mit freundlichen Grüßen,<br>Woodkraft Team</p>
            `,
          };

          const officeMailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.OFFICE_EMAIL,
            subject: `Neue Bestellung #${order._id}`,
            html: `
              <h2>Neue Bestellung eingegangen</h2>
              <p>Bestellnummer: <strong>#${order._id}</strong></p>
              <p>Kunde: ${order.shippingAddress.name} (${order.customerEmail})</p>
              <h3>Bestellübersicht</h3>
              <pre>${orderDetails}</pre>
              <p><strong>Gesamt: ${order.total.toFixed(2)} €</strong></p>
              <h3>Lieferadresse</h3>
              <pre>${address}</pre>
              <p>Zahlungsstatus: Bezahlt (PaymentIntent: ${paymentIntent.id})</p>
            `,
          };

          await transporter.sendMail(customerMailOptions);
          console.log('Bestätigungs-E-Mail an Kunden gesendet:', order.customerEmail);
          await transporter.sendMail(officeMailOptions);
          console.log('Benachrichtigungs-E-Mail ans Büro gesendet:', process.env.OFFICE_EMAIL);
        } else {
          console.log('Stock already updated for order:', order._id);
        }
      } else {
        console.log('Order not found for paymentIntent:', paymentIntent.id);
        const allOrders = await Order.find({ paymentIntentId: { $exists: true } });
        console.log('All orders with paymentIntentId:', allOrders.map(o => ({ id: o._id, paymentIntentId: o.paymentIntentId })));
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
