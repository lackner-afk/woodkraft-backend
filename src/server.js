const dotenv = require('dotenv');
const dotenvResult = dotenv.config();

if (dotenvResult.error) {
  console.error('Error loading .env:', dotenvResult.error);
  process.exit(1);
}

console.log('Loaded .env:', dotenvResult.parsed);
console.log('STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET || 'Undefined');
console.log('STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Set' : 'Undefined');
console.log('MONGO_URI:', process.env.MONGO_URI ? 'Set' : 'Undefined');
console.log('PORT:', process.env.PORT || 'Undefined');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'Undefined');

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.MONGO_URI) {
  console.error('Error: Required environment variables are missing');
  process.exit(1);
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');

const app = express();

// Middleware für Webhook (nur für /api/payment/webhook)
app.use('/api/payment/webhook', express.raw({ type: 'application/json', limit: '10mb' }));

// Allgemeine Middleware für andere Routen
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payment', paymentRoutes);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
