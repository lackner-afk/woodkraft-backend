const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 1 },
    },
  ],
  total: { type: Number, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'completed', 'cancelled'] },
  paymentIntentId: { type: String },
  shippingAddress: {
    name: { type: String, required: true },
    street: { type: String, required: true },
    postalCode: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    email: { type: String, required: true },
  },
  customerEmail: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Order', orderSchema);
