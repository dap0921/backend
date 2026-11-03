import mongoose from 'mongoose';

// ==========================================
// SPLIT SCHEMA
// ==========================================

const splitSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: [true, 'User ID is required.']
    },

    amountOwed: {
      type: Number,
      required: [true, 'Amount owed is required.'],
      min: [0.01, 'Amount owed must be greater than zero.'],
      validate: {
        validator: Number.isFinite,
        message: 'Amount owed must be a valid number.'
      }
    },

    settledAmount: {
      type: Number,
      default: 0,
      min: [0, 'Settled amount cannot be negative.'],
      validate: [
        {
          validator: Number.isFinite,
          message: 'Settled amount must be a valid number.'
        },
        {
          validator: function (value) {
            return value <= this.amountOwed;
          },
          message: 'Settled amount cannot exceed the amount owed.'
        }
      ]
    }
  },
  { _id: false }
);

// ==========================================
// SHARED EXPENSE SCHEMA
// ==========================================

const sharedExpenseSchema = new mongoose.Schema(
  {
    paymentAttempts: {
      type: [
        new mongoose.Schema(
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'userData',
              required: true
            },
            orderId: {
              type: String,
              required: true
            },
            amountPaise: {
              type: Number,
              required: true,
              min: 100
            },
            razorpayAccountId: {
              type: String,
              required: true
            },
            transferId: {
              type: String,
              required: true
            },
            paymentId: {
              type: String,
              default: null
            },
            status: {
              type: String,
              enum: ['created', 'verified'],
              default: 'created'
            },
            expiresAt: {
              type: Date,
              required: true
            }
          },
          { timestamps: true }
        )
      ],
      default: []
    },

    title: {
      type: String,
      required: [true, 'Expense title is required.'],
      trim: true,
      validate: {
        validator: function (value) {
          return typeof value === 'string' && value.trim().length > 0;
        },
        message: 'Expense title cannot be empty.'
      },
      maxlength: [100, 'Expense title cannot exceed 100 characters.']
    },

    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required.'],
      min: [0.01, 'Total amount must be greater than zero.'],
      validate: {
        validator: Number.isFinite,
        message: 'Total amount must be a valid number.'
      }
    },

    category: {
      type: String,
      enum: {
        values: [
          'Food',
          'Transport',
          'Shopping',
          'Bills',
          'Education',
          'Health',
          'Entertainment',
          'Other'
        ],
        message: 'Please select a valid expense category.'
      },
      default: 'Other',
      required: true
    },

    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: [true, 'Payer information is required.']
    },

    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SharedGroup',
      default: null
    },

    splits: {
      type: [splitSchema],
      required: [true, 'Expense splits are required.'],
      validate: {
        validator: function (splits) {
          return Array.isArray(splits) && splits.length > 0;
        },
        message: 'At least one expense split is required.'
      }
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'userData',
      required: [true, 'Creator information is required.']
    },

    date: {
      type: Date,
      default: Date.now,
      required: [true, 'Expense date is required.'],
      validate: {
        validator: function (value) {
          return value instanceof Date && !Number.isNaN(value.getTime());
        },
        message: 'Please provide a valid expense date.'
      }
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Notes cannot exceed 500 characters.']
    }
  },
  {
    timestamps: true,
    collection: 'sharedExpenses'
  }
);

// ==========================================
// CUSTOM JAVASCRIPT VALIDATIONS
// ==========================================

sharedExpenseSchema.pre('validate', function () {
  if (!Array.isArray(this.splits) || this.splits.length === 0) {
    return;
  }

  // Check for duplicate users in expense splits.
  const userIds = this.splits
    .filter(split => split.userId)
    .map(split => split.userId.toString());

  if (new Set(userIds).size !== userIds.length) {
    this.invalidate(
      'splits',
      'A user cannot appear more than once in expense splits.'
    );
  }

  // Check that all split amounts equal the total expense.
  if (
    Number.isFinite(this.totalAmount) &&
    this.splits.every(split => Number.isFinite(split.amountOwed))
  ) {
    const splitTotal = this.splits.reduce(
      (total, split) => total + split.amountOwed,
      0
    );

    const totalInPaise = Math.round(this.totalAmount * 100);
    const splitInPaise = Math.round(splitTotal * 100);

    if (totalInPaise !== splitInPaise) {
      this.invalidate(
        'splits',
        'The sum of all expense splits must equal the total expense amount.'
      );
    }
  }
});

// ==========================================
// EXPORT MODEL
// ==========================================

const sharedExpense = mongoose.model(
  'SharedExpense',
  sharedExpenseSchema
);

export default sharedExpense;