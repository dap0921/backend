import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: true,
      index: true
    },

    month: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01
    }
  },
  {
    timestamps: true,
    collection: 'budgets'
  }
);

// One budget per user per month.
budgetSchema.index(
  { userId: 1, month: 1 },
  { unique: true }
);

const budgetData = mongoose.model('Budget', budgetSchema);

export default budgetData;