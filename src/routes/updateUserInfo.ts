import { Router, Request, Response } from "express";
import { body } from "express-validator";
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

const processedCallIds = new Set<string>();

router.post(
  "/update-user-info",
  [
    body("event")
      .equals("call_ended")
      .withMessage("Only call_ended events are supported"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Only process call_ended events
      if (req.body.event !== "call_ended") {
        res.status(400).json({ error: "Only call_ended events are supported" });
        return;
      }

      const callId = req.body.call?.call_id;

      if (!callId) {
        res.status(400).json({ error: "Missing call_id" });
        return;
      }

      // Check for duplicate call_id immediately
      if (processedCallIds.has(callId)) {
        console.log(
          `[post-call-user-update] Skipping duplicate call_id: ${callId}`
        );
        res.json({ message: "Call already processed" });
        return;
      }

      // Mark this call as processed immediately
      processedCallIds.add(callId);

      console.log("[post-call-user-update] Received request:", req.body);

      const {
        call: {
          from_number = "+12137771234",
          retell_llm_dynamic_variables = req.body.call
            ?.retell_llm_dynamic_variables || {},
          transcript = req.body.call?.transcript || "",
        } = {}, // Default empty object in case call is undefined
      } = req.body;

      // Only proceed with OpenAI and database updates if we have the required data
      if (!from_number || !transcript) {
        console.log(
          "[post-call-user-update] Skipping update - missing required data"
        );
        res.json({ message: "Skipping update - missing required data" });
        return;
      }

      // Only proceed if the user has fields that need updating (where values are null or empty)
      const user = await supabase
        .from("users")
        .select("*")
        .eq("phone_number", from_number)
        .single();

      if (user.data) {
        const missingFields = Object.keys(user.data).filter((field) => {
          const value = user.data[field];
          return value === null || value === "";
        });

        if (missingFields.length === 0) {
          console.log(
            "[post-call-user-update] Skipping update - no missing fields"
          );
          res.json({ message: "Skipping update - no missing fields" });
          return;
        }
      }

      // Ask OpenAI to analyze the call and determine user profile updates
      console.log(
        "[post-call-user-update] Analyzing call transcript with OpenAI"
      );
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
                  type: ["string", "null"],
                  description: "The user's first name.",
                },
                gender: {
                  type: ["string", "null"],
                  description: "The user's gender.",
                  enum: ["male", "female", "other", null],
                },
                year_of_birth: {
                  type: ["number", "null"],
                  description: "The year the user was born.",
                },
                job_or_education: {
                  type: ["string", "null"],
                  description: "The user's job or education status.",
                },
                relationship_type: {
                  type: ["string", "null"],
                  description:
                    "The type of relationship the user is seeking. (casual, long-term, still figuring it out)",
                },
                dealbreakers: {
                  type: ["array", "null"],
                  description: "A list of dealbreakers the user has.",
                  items: {
                    type: "string",
                  },
                },
                greenflags: {
                  type: ["array", "null"],
                  description: "A list of green flags that the user looks for.",
                  items: {
                    type: "string",
                  },
                },
                dating_preferences: {
                  type: ["object", "null"],
                  description:
                    "User's dating preferences represented as a JSON object.",
                  properties: {
                    minAge: {
                      type: ["number", "null"],
                      description: "Minimum age preference for dating",
                    },
                    maxAge: {
                      type: ["number", "null"],
                      description: "Maximum age preference for dating",
                    },
                    gender: {
                      type: ["string", "null"],
                      description: "Preferred gender for dating",
                      enum: ["male", "female", "other", null],
                    },
                  },
                  required: ["minAge", "maxAge", "gender"],
                  additionalProperties: false,
                },
                time_since_single: {
                  type: ["string", "null"],
                  description:
                    "Time elapsed since the user was last in a relationship.",
                },
              },
              required: [
                "first_name",
                "gender",
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

      // Generate embeddings for greenflags if they exist
      let greenflags_vector_embedding = null;
      if (userUpdate.greenflags && userUpdate.greenflags.length > 0) {
        try {
          // Initialize the embedding pipeline only when needed
          const { pipeline } = await import('@xenova/transformers');
          const generateEmbedding = await pipeline(
            "feature-extraction",
            "Supabase/gte-small"
          );

          // Combine all greenflags into a single string
          const greenflagsText = userUpdate.greenflags.join(" ");

          // Generate embedding
          const output = await generateEmbedding(greenflagsText, {
            pooling: "mean",
            normalize: true,
          });

          // Convert to array
          greenflags_vector_embedding = Array.from(output.data);
        } catch (embeddingError) {
          console.error(
            "[post-call-user-update] Error generating embedding:",
            embeddingError
          );
          // Continue with the update even if embedding fails
        }
      }

      // Add the embedding to the update
      const updateData = {
        ...userUpdate,
        greenflags_vector_embedding,
      };

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(updateData)
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
        userUpdate: updateData,
      });

      res.json({
        user_id: updatedUser.id,
        user_update: updateData,
      });
    } catch (error) {
      // On error, remove the call_id from processed set to allow retry
      const callId = req.body.call?.call_id;
      if (callId) {
        processedCallIds.delete(callId);
      }

      console.error("[post-call-user-update] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
