import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

router.post(
  "/get-user-info",
  [
    body("phone_number")
      .isMobilePhone("any")
      .withMessage("Valid phone_number is required"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    console.log("[get-user-info] Received request:", {
      phone_number: req.body.phone_number,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("[get-user-info] Validation errors:", errors.array());
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const { from_number } = req.body;
      console.log(
        "[get-user-info] Querying user with phone number:",
        from_number
      );

      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("phone_number", from_number)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        // Only treat non-PGRST116 errors as real errors
        console.error("[get-user-info] Supabase error:", error);
        res.status(500).json({ error: "Error fetching user data" });
        return;
      }

      if (!user) {
        console.log("[get-user-info] User not found for number:", from_number);
        res.status(404).json({ error: "User not found" });

        return;
      }

      console.log("[get-user-info] Successfully retrieved user data:", {
        userId: user.id,
      });
      res.json({ user });
    } catch (error) {
      console.error("[get-user-info] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
