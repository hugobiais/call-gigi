import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

import express from "express";
import getUserInfoRouter from "./routes/getUserInfo";
import updateUserInfoRouter from "./routes/updateUserInfo";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/", getUserInfoRouter);
app.use("/", updateUserInfoRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

export default app;
