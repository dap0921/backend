import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    amount: {
      type: Number,
      required: true,
      min: 0
    },

    category: {
      type: String,
      required: true,
      enum: [
        'Food',
        'Transport',
        'Shopping',
        'Bills',
        'Education',
        'Health',
        'Entertainment',
        'Other'
      ]
    },

    date: {
      type: Date,
      required: true,
      default: Date.now
    },

    paymentMethod: {
      type: String,
      enum: [
        'Cash',
        'UPI',
        'Credit Card',
        'Debit Card',
        'Net Banking',
        'Other'
      ],
      default: 'Cash'
    },

    description: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'expenses'
  }
);

const expenseData = mongoose.model('Expense', expenseSchema);

export default expenseData;

