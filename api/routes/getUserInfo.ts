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
      const { phone_number } = req.body;
      console.log(
        "[get-user-info] Querying user with phone number:",
        phone_number
      );

      let { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("phone_number", phone_number)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        // Only treat non-PGRST116 errors as real errors
        console.error("[get-user-info] Supabase error:", error);
        res.status(500).json({ error: "Error fetching user data" });
        return;
      }

      // If user doesn't exist, create a new one with just the phone number
      if (!user) {
        console.log(
          "[get-user-info] Creating new user for number:",
          phone_number
        );
        const { data: newUser, error: createError } = await supabase
          .from("users")
          .insert([{ phone_number: phone_number }])
          .select()
          .single();

        if (createError) {
          console.error(
            "[get-user-info] Error creating new user:",
            createError
          );
          res.status(500).json({ error: "Error creating new user" });
          return;
        }

        user = newUser;
      }

      // Return user data with completion status, excluding system fields
      const excludedFields = new Set([
        "id",
        "phone_number",
        "created_at",
        "updated_at",
      ]);
      const userFields = Object.entries(user).reduce((acc, [key, value]) => {
        if (!excludedFields.has(key)) {
          acc[key] = {
            value: value,
            is_completed: value !== null,
          };
        }
        return acc;
      }, {} as Record<string, { value: any; is_completed: boolean }>);

      console.log(
        "[get-user-info] Returning user data with completion status:",
        {
          userId: user.id,
        }
      );

      res.json({
        user_id: user.id,
        fields: userFields,
      });
    } catch (error) {
      console.error("[get-user-info] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
