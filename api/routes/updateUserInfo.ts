import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_ANON_KEY ||
  !process.env.OPENAI_API_KEY
) {
  throw new Error("Missing environment variables");
}

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

router.post(
  "/update-user-info",
  [
    body("event")
      .equals("call_ended")
      .withMessage("Only call_ended events are supported"),
    body("call.from_number")
      .isMobilePhone("any")
      .withMessage("Valid phone number is required"),
    body("call.retell_llm_dynamic_variables").exists(),
    body("call.transcript").exists(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    console.log("[post-call-user-update] Received request:", {
      event: req.body.event,
      from_number: req.body.call.from_number,
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("[post-call-user-update] Validation errors:", errors.array());
      res.status(400).json({ errors: errors.array() });
      return;
    }

    try {
      const {
        call: { from_number, retell_llm_dynamic_variables, transcript },
      } = req.body;

      // Ask OpenAI to analyze the call and determine user profile updates
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "user",
            strict: true,
            schema: {
              type: "object",
              properties: {
                first_name: {
                  type: "string",
                  description: "The user's first name.",
                },
                year_of_birth: {
                  type: "number",
                  description: "The year the user was born.",
                },
                job_or_education: {
                  type: "string",
                  description: "The user's job or education status.",
                },
                relationship_type: {
                  type: "string",
                  description: "The type of relationship the user is seeking.",
                },
                dealbreakers: {
                  type: "array",
                  description: "A list of dealbreakers the user has.",
                  items: {
                    type: "string",
                  },
                },
                greenflags: {
                  type: "array",
                  description: "A list of green flags that the user looks for.",
                  items: {
                    type: "string",
                  },
                },
                dating_preferences: {
                  type: "object",
                  description:
                    "User's dating preferences represented as a JSON object.",
                  properties: {
                    preferences: {
                      type: "array",
                      description: "List of user preferences.",
                      items: {
                        type: "object",
                        properties: {
                          preference_key: {
                            type: "string",
                            description: "Key for the preference.",
                          },
                          preference_value: {
                            type: "string",
                            description: "Value for the preference.",
                          },
                        },
                        required: ["preference_key", "preference_value"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["preferences"],
                  additionalProperties: false,
                },
                time_since_single: {
                  type: "string",
                  description:
                    "Time elapsed since the user was last in a relationship.",
                },
              },
              required: [
                "first_name",
                "year_of_birth",
                "job_or_education",
                "relationship_type",
                "dealbreakers",
                "greenflags",
                "dating_preferences",
                "time_since_single",
              ],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that analyzes call transcripts to extract user information. Return only factual information that was explicitly mentioned in the transcript or dynamic variables.",
          },
          {
            role: "user",
            content: `Analyze this call data and extract user profile information:
              
              Dynamic Variables:
              ${JSON.stringify(retell_llm_dynamic_variables, null, 2)}

              Transcript:
              ${transcript}

              Return the user's informations following the response format.`,
          },
        ],
      });

      const content = completion.choices[0].message.content;
      if (!content) throw new Error("No content received from OpenAI");

      const userUpdate = JSON.parse(content);

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(userUpdate)
        .eq("phone_number", from_number)
        .select()
        .single();

      if (updateError) {
        console.error(
          "[post-call-user-update] Error updating user:",
          updateError
        );
        res.status(500).json({ error: "Error updating user" });
        return;
      }

      console.log("[post-call-user-update] Successfully updated user:", {
        userId: updatedUser.id,
        userUpdate: userUpdate,
      });

      res.json({
        user_id: updatedUser.id,
        user_update: userUpdate,
      });
    } catch (error) {
      console.error("[post-call-user-update] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
