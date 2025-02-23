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
  "/update-user-info",
  [
    body("phone_number")
      .isMobilePhone("any")
      .withMessage("Valid phone number is required"),
    body("field_name").notEmpty().withMessage("Field name is required"),
    body("field_value").exists().withMessage("Field value is required"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    console.log("[update-user-field] Received request:", {
      phone_number: req.body.phone_number,
      field_name: req.body.field_name,
      field_value: req.body.field_value,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("[update-user-field] Validation errors:", errors.array());
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const { phone_number, field_name, field_value } = req.body;

      // Check if field_name is not a protected field
      const protectedFields = new Set([
        "id",
        "phone_number",
        "created_at",
        "updated_at",
      ]);
      if (protectedFields.has(field_name)) {
        res.status(400).json({ error: "Cannot update protected field" });
        return;
      }

      // First, check if user exists
      let { data: user, error: fetchError } = await supabase
        .from("users")
        .select("*")
        .eq("phone_number", phone_number)
        .maybeSingle();

      if (fetchError) {
        console.error("[update-user-field] Error checking user:", fetchError);
        res.status(500).json({ error: "Error checking user" });
        return;
      }

      if (!user) {
        console.log("[update-user-field] User not found:", { phone_number });
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Update the specified field
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ [field_name]: field_value })
        .eq("phone_number", phone_number)
        .select()
        .single();

      if (updateError) {
        console.error("[update-user-field] Error updating user:", updateError);
        res.status(500).json({ error: "Error updating user" });
        return;
      }

      // Return user data with completion status, excluding system fields
      const excludedFields = new Set([
        "id",
        "phone_number",
        "created_at",
        "updated_at",
      ]);
      const userFields = Object.entries(updatedUser).reduce(
        (acc, [key, value]) => {
          if (!excludedFields.has(key)) {
            acc[key] = {
              value: value,
              is_completed: value !== null && value !== "",
            };
          }
          return acc;
        },
        {} as Record<string, { value: any; is_completed: boolean }>
      );

      console.log("[update-user-field] Successfully updated user:", {
        userId: updatedUser.id,
        updatedField: field_name,
      });

      res.json({
        user_id: updatedUser.id,
        fields: userFields,
      });
    } catch (error) {
      console.error("[update-user-field] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
