import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
// import Retell from "retell-sdk";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (
  !process.env.SUPABASE_URL ||
  !process.env.SUPABASE_ANON_KEY
  // !process.env.RETELL_API_KEY
) {
  throw new Error("Missing environment variables");
}

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// const client = new Retell({
//   apiKey: process.env.RETELL_API_KEY,
// });

// Keep track of processed webhook events to prevent duplicates
const processedEvents = new Set<string>();

router.post(
  "/match-users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Verify this is a Supabase webhook
      // const webhookSecret = req.headers["x-supabase-webhook-secret"];
      // if (webhookSecret !== process.env.SUPABASE_WEBHOOK_SECRET) {
      //   res.status(401).json({ error: "Unauthorized" });
      //   return;
      // }

      const { record, old_record } = req.body;

      // Check if this is an update to greenflags_vector_embedding
      if (
        !record?.greenflags_vector_embedding ||
        JSON.stringify(record.greenflags_vector_embedding) ===
          JSON.stringify(old_record?.greenflags_vector_embedding)
      ) {
        res.json({ message: "No relevant changes" });
        return;
      }

      // Generate a unique event ID
      const eventId = `${record.id}-${Date.now()}`;
      if (processedEvents.has(eventId)) {
        res.json({ message: "Event already processed" });
        return;
      }
      processedEvents.add(eventId);

      // Find similar users
      const { data: similarUsers, error: matchError } = await supabase.rpc(
        "match_users_by_greenflags",
        {
          query_embedding: record.greenflags_vector_embedding,
          match_threshold: 0.7,
          match_count: 2
        }
      );

      if (matchError) {
        console.error("[match-users] Error matching users:", matchError);
        res.status(500).json({ error: "Error matching users" });
        return;
      }

      if (!similarUsers?.length) {
        res.json({ message: "No matches found" });
        return;
      }

      // Find the first match that isn't the current user
      const matchedUser = similarUsers.find((user: { phone_number: string }) => user.phone_number !== record.phone_number);
      
      if (!matchedUser) {
        res.json({ message: "No valid matches found" });
        return;
      }

      console.log("[match-users] Matched user:", matchedUser);

      // Store the match in the matches table using phone numbers
      const { data: matchData, error: insertError } = await supabase
        .from('greenflags_embedding_matches')
        .insert({
          user1_phone: record.phone_number,
          user2_phone: matchedUser.phone_number,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[match-users] Error storing match:", insertError);
        res.status(500).json({ error: "Error storing match" });
        return;
      }

      res.json({ 
        message: "Match created successfully", 
        match: matchData 
      });

      // // Trigger a call between the matched users
      // const phoneCallResponse = await client.call.createPhoneCall({
      //   from_number: process.env.RETELL_OUTBOUND_PHONE_NUMBER!,
      //   to_number: matchedUser.phone_number, // WARNING: Not possible because if using a number purchased from Retell, only US numbers are supported as destination.
      // });

      // console.log(phoneCallResponse.agent_id);
    } catch (error) {
      console.error("[match-users] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
