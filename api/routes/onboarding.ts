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
  "/add-to-onboarding",
  [
    body("phone")
      .isMobilePhone("any")
      .withMessage("Valid phone number is required"),
    body("onboardingField")
      .notEmpty()
      .withMessage("Onboarding field is required"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    console.log("[add-to-onboarding] Received request:", {
      phone: req.body.phone,
      onboardingField: req.body.onboardingField,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("[add-to-onboarding] Validation errors:", errors.array());
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const { phone, onboardingField } = req.body;
      console.log("[add-to-onboarding] Checking if user exists:", { phone });

      // First, check if user exists
      const { data: existingUser, error: fetchError } = await supabase
        .from("users")
        .select("id, onboarding")
        .eq("phone", phone)
        .single();

      if (fetchError) {
        console.error("[add-to-onboarding] Error checking user existence:", fetchError);
        res.status(500).json({ error: "Error checking user existence" });
        return;
      }

      if (!existingUser) {
        console.log("[add-to-onboarding] Creating new user:", { phone });
        // Create new user if doesn't exist
        const { data: newUser, error: createError } = await supabase
          .from("users")
          .insert([
            {
              phone,
              onboarding: [onboardingField],
            },
          ])
          .select()
          .single();

        if (createError) {
          console.error("[add-to-onboarding] Error creating new user:", createError);
          res.status(500).json({ error: "Error creating new user" });
          return;
        }

        console.log("[add-to-onboarding] Successfully created new user:", { userId: newUser.id });
        res.json({ user: newUser });
        return;
      }

      console.log("[add-to-onboarding] Updating existing user:", {
        userId: existingUser.id,
        currentOnboarding: existingUser.onboarding,
        newField: onboardingField,
      });

      // Update existing user's onboarding array
      const updatedOnboarding = [
        ...(existingUser.onboarding || []),
        onboardingField,
      ];

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({ onboarding: updatedOnboarding })
        .eq("id", existingUser.id)
        .select()
        .single();

      if (updateError) {
        console.error("[add-to-onboarding] Error updating user:", updateError);
        res.status(500).json({ error: "Error updating user onboarding" });
        return;
      }

      console.log("[add-to-onboarding] Successfully updated user:", {
        userId: updatedUser.id,
        newOnboarding: updatedUser.onboarding,
      });
      res.json({ user: updatedUser });
    } catch (error) {
      console.error("[add-to-onboarding] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
