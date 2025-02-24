import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

import express from "express";
import getUserInfoRouter from "./routes/getUserInfo.js";
import updateUserInfoRouter from "./routes/updateUserInfo.js";
import matchUsersRouter from "./routes/matchUsers.js";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/", getUserInfoRouter);
app.use("/", updateUserInfoRouter);
app.use("/", matchUsersRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

export default app;
