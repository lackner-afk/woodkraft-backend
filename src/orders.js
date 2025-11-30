const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const mongoose = require('mongoose');

// Create order
router.post('/', async (req, res) => {
  try {
    const { items, shippingAddress, customerEmail } = req.body;
    console.log('Received order request:', req.body);

    // Validierung
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items array is required and must not be empty' });
    }

    for (const item of items) {
      if (!item.product) {
        return res.status(400).json({ message: 'Each item must have a product ID' });
      }
      if (!mongoose.isValidObjectId(item.product)) {
        return res.status(400).json({ message: `Invalid product ID: ${item.product}` });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ message: 'Each item must have a valid quantity' });
      }
    }

    // Validierung der Adresse
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return res.status(400).json({ message: 'Shipping address is required' });
    }
    const { name, street, postalCode, city, country, email } = shippingAddress;
    if (!name || !street || !postalCode || !city || !country || !email) {
      return res.status(400).json({ message: 'All shipping address fields are required' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ message: 'Invalid email address' });
    }

    if (!customerEmail || !/\S+@\S+\.\S+/.test(customerEmail)) {
      return res.status(400).json({ message: 'Valid customer email is required' });
    }

    // Finde Produkte
    const productIds = items.map(item => item.product);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: 'One or more product IDs are invalid' });
    }

    // Berechne Total und validiere Stock
    let total = 0;
    const orderItems = items.map(item => {
      const product = products.find(p => p._id.toString() === item.product);
      if (item.quantity > product.stock) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      total += product.price * item.quantity;
      return { product: item.product, quantity: item.quantity };
    });

    // Erstelle Bestellung
    const order = new Order({
      items: orderItems,
      total,
      status: 'pending',
      shippingAddress,
      customerEmail,
    });

    const newOrder = await order.save();
    console.log('Order created:', newOrder._id);
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(400).json({ message: err.message });
  }
});

// Update order status and paymentIntentId
router.patch('/:id', async (req, res) => {
  try {
    const { status, paymentIntentId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (status) order.status = status;
    if (paymentIntentId) order.paymentIntentId = paymentIntentId;

    await order.save();
    console.log('Order updated:', order._id);
    res.json(order);
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
