import budgetData from '../model/budget.js';
import expenseData from '../model/expense.js';
import mongoose from 'mongoose';

// ======================================================
// GET MONTHLY BUDGET AND SPENDING
// ======================================================
export const getMonthlyBudget = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: 'Invalid user ID'
      });
    }

    const now = new Date();

    const month =
      typeof req.query.month === 'string' &&
      /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
        ? req.query.month
        : `${now.getFullYear()}-${String(
            now.getMonth() + 1
          ).padStart(2, '0')}`;

    const [year, monthNumber] = month.split('-').map(Number);

    const startDate = new Date(year, monthNumber - 1, 1);
    const endDate = new Date(year, monthNumber, 1);

    const [budget, result] = await Promise.all([
      budgetData.findOne({ userId, month }),

      expenseData.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            date: {
              $gte: startDate,
              $lt: endDate
            }
          }
        },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: '$amount' },
            totalTransactions: { $sum: 1 }
          }
        }
      ])
    ]);

    const spending = result[0] || {
      totalSpent: 0,
      totalTransactions: 0
    };

    const budgetAmount = budget ? budget.amount : 0;
    const totalSpent = spending.totalSpent;

    res.status(200).json({
      message: 'Monthly budget retrieved successfully',
      data: {
        month,
        budget: budgetAmount,
        totalSpent,
        remaining: budgetAmount - totalSpent,
        percentageUsed:
          budgetAmount > 0
            ? Number(
                ((totalSpent / budgetAmount) * 100).toFixed(2)
              )
            : 0,
        totalTransactions: spending.totalTransactions,
        budgetSet: Boolean(budget),
        exceeded: budgetAmount > 0 && totalSpent > budgetAmount
      }
    });
  } catch (error) {
    console.error('Get monthly budget error:', error);

    res.status(500).json({
      message: 'Failed to retrieve monthly budget'
    });
  }
};

// ======================================================
// CREATE OR UPDATE MONTHLY BUDGET
// ======================================================
export const setMonthlyBudget = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month, amount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        message: 'Invalid user ID'
      });
    }

    if (
      typeof month !== 'string' ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ) {
      return res.status(400).json({
        message: 'Month must be in YYYY-MM format'
      });
    }

    const budgetAmount = Number(amount);

    if (
      amount === undefined ||
      amount === null ||
      amount === '' ||
      !Number.isFinite(budgetAmount) ||
      budgetAmount <= 0
    ) {
      return res.status(400).json({
        message: 'Budget amount must be greater than zero'
      });
    }

    const budget = await budgetData.findOneAndUpdate(
      { userId, month },
      { $set: { amount: budgetAmount } },
      {
  new: true,
  upsert: true,
  runValidators: true,
  setDefaultsOnInsert: true
}
    );

    res.status(200).json({
      message: 'Monthly budget saved successfully',
      data: budget
    });
  } catch (error) {
    console.error('Set monthly budget error:', error);

    // Handles simultaneous requests that may conflict with
    // the unique userId + month index.
    if (error.code === 11000) {
      return res.status(409).json({
        message: 'A budget for this month already exists. Please try again.'
      });
    }

    res.status(500).json({
      message: 'Failed to save monthly budget'
    });
  }
};