
import Expense from '../model/expense.js';
import Budget from '../model/budget.js';

const CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Bills',
  'Education',
  'Health',
  'Entertainment',
  'Other',
];

const PAYMENT_METHODS = [
  'Cash',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Net Banking',
  'Other',
];

// Get the logged-in user's ID.
// Your auth middleware must attach the user to req.user.
const getUserId = (req) =>
  req.user?._id || req.user?.id || req.userId || null;

const getMonthRange = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { start, end };
};

const getErrorMessage = (error) =>
  error?.message || 'An unexpected server error occurred.';

// POST /expenses
export const addExpense = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to add an expense.',
      });
    }

    const {
      title,
      amount,
      category,
      date,
      paymentMethod,
      description,
    } = req.body;

    const numericAmount = Number(amount);

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Expense title is required.',
      });
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than zero.',
      });
    }

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid category.',
      });
    }

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid payment method.',
      });
    }

    const expenseDate = date ? new Date(date) : new Date();

    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid expense date.',
      });
    }

    const expense = await Expense.create({
      user: userId,
      userId,
      title: title.trim(),
      amount: numericAmount,
      category,
      date: expenseDate,
      paymentMethod,
      description: description || '',
    });

    return res.status(201).json({
      success: true,
      message: 'Expense added successfully.',
      data: expense,
    });
  } catch (error) {
    console.error('Add expense error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to add expense.',
    });
  }
};

// GET /expenses
export const getExpenses = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view expenses.',
      });
    }

    // Match either common user field, depending on the existing schema.
    const expenses = await Expense.find({
      $or: [{ user: userId }, { userId }],
    }).sort({ date: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error('Get expenses error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve expenses.',
    });
  }
};

// GET /expenses/summary
export const getExpenseSummary = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view your summary.',
      });
    }

    const { start, end } = getMonthRange();

    const expenses = await Expense.find({
      $or: [{ user: userId }, { userId }],
      date: { $gte: start, $lt: end },
    }).lean();

    const totalSpent = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const categoryTotals = {};

    for (const expense of expenses) {
      const category = expense.category || 'Other';

      categoryTotals[category] =
        (categoryTotals[category] || 0) +
        Number(expense.amount || 0);
    }

    const topCategory = Object.entries(categoryTotals).sort(
      (a, b) => b[1] - a[1]
    )[0];

    return res.status(200).json({
      success: true,
      data: {
        totalSpent,
        expenseCount: expenses.length,
        averageExpense:
          expenses.length > 0 ? totalSpent / expenses.length : 0,
        categoryTotals,
        topCategory: topCategory
          ? { name: topCategory[0], amount: topCategory[1] }
          : null,
      },
    });
  } catch (error) {
    console.error('Get expense summary error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve expense summary.',
    });
  }
};

// GET /budget or GET /budget/monthly
export const getMonthlyBudget = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to view your budget.',
      });
    }

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const budget = await Budget.findOne({
      $or: [{ user: userId }, { userId }],
      month,
      year,
    }).lean();

    if (!budget) {
      return res.status(200).json({
        success: true,
        data: {
          budget: 0,
          monthlyBudget: 0,
          spent: 0,
          remaining: 0,
        },
      });
    }

    const budgetAmount = Number(
      budget.monthlyBudget ?? budget.budget ?? budget.amount ?? 0
    );

    const { start, end } = getMonthRange(now);

    const expenses = await Expense.find({
      $or: [{ user: userId }, { userId }],
      date: { $gte: start, $lt: end },
    }).lean();

    const spent = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    return res.status(200).json({
      success: true,
      data: {
        ...budget,
        budget: budgetAmount,
        monthlyBudget: budgetAmount,
        spent,
        remaining: budgetAmount - spent,
      },
    });
  } catch (error) {
    console.error('Get monthly budget error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve monthly budget.',
    });
  }
};

// PUT /expenses/:id
export const updateExpense = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to update an expense.',
      });
    }

    const updates = {};
    const allowedFields = [
      'title',
      'amount',
      'category',
      'date',
      'paymentMethod',
      'description',
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (updates.title !== undefined) {
      if (!String(updates.title).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Expense title cannot be empty.',
        });
      }

      updates.title = String(updates.title).trim();
    }

    if (updates.amount !== undefined) {
      updates.amount = Number(updates.amount);

      if (!Number.isFinite(updates.amount) || updates.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than zero.',
        });
      }
    }

    if (
      updates.category !== undefined &&
      !CATEGORIES.includes(updates.category)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense category.',
      });
    }

    if (
      updates.paymentMethod !== undefined &&
      !PAYMENT_METHODS.includes(updates.paymentMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method.',
      });
    }

    if (updates.date !== undefined) {
      updates.date = new Date(updates.date);

      if (Number.isNaN(updates.date.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expense date.',
        });
      }
    }

    const expense = await Expense.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ user: userId }, { userId }],
      },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Expense updated successfully.',
      data: expense,
    });
  } catch (error) {
    console.error('Update expense error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to update expense.',
    });
  }
};

// DELETE /expenses/:id
export const deleteExpense = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to delete an expense.',
      });
    }

    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      $or: [{ user: userId }, { userId }],
    });

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Expense deleted successfully.',
      data: expense,
    });
  } catch (error) {
    console.error('Delete expense error:', getErrorMessage(error));

    return res.status(500).json({
      success: false,
      message: 'Failed to delete expense.',
    });
  }
};
// Get a single expense by ID
export const getSingleExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found',
      });
    }

    res.status(200).json({
      success: true,
      data: expense,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve expense',
      error: error.message,
    });
  }
};