
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import express from "express";
import cors from "cors";
import "dotenv/config";

import connectDb from "./config/db.js";

import userRouter from "./route/userRoute.js";
import expenseRouter from "./route/expenseRoute.js";
import adminRouter from "./route/adminRoute.js";
import budgetRouter from "./route/budgetRoute.js";
import chatRouter from "./route/chatRoute.js";
import sharedExpenseRouter from './route/sharedExpenseRoute.js';
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Backend health check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Expense Tracker Backend is running successfully",
  });
});

// Existing application routes
app.use(userRouter);
app.use(expenseRouter);
app.use(budgetRouter);
app.use(sharedExpenseRouter);

// Chatbot route
app.use(chatRouter);

app.use(adminRouter);

// Start server after database connection
const PORT = process.env.PORT || 5000;

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Expense Tracker Backend is running on port ${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "Server not started because MongoDB connection failed:",
      error.message
    );
    process.exitCode = 1;
  });

export default app;
