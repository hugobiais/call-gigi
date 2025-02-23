import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

import express from "express";
import userInfoRouter from "./routes/getUserInfo";
import userInfoRetellRouter from "./routes/getUserInfoRetell";
import onboardingRouter from "./routes/updateUserInfo";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/", userInfoRouter);
app.use("/", userInfoRetellRouter);
app.use("/", onboardingRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
});

export default app;
