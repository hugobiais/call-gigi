# Call Gigi

A TypeScript-based API service (using Express.js) used to communicate with Retell voice agents and Supabase for database management. The goal was to create a voice version of Gigi that can be interacted with over the phone (the scope is limited to the onboarding call where Gigi gets basic user information).

## Features overview

- A user can call Gigi and have a conversation with her where she asks for basic information.
- A user can hang up at any time during the call, the next time they call, Gigi will pick up from the same point.
- A user who has completed the onboarding can call Gigi and be given a summary of his responses and be told to wait for next steps.
- (EARLY) A user who has completed the onboarding can be recommended to other user with similar greenflags.

## API endpoints

- `POST /get-user-info`: Called by the Voice agent at the start of every inbound call, it returns the user's information to be injected into the system prompt of the agent. See **Inbound Call Webhook URL** on Retell.
- `POST /update-user-info`: Called by the Voice agent at the end of every inbound call, it gets the transcript of the call, passes it to OpenAI GPT-4o with Structured output to JSON Schema to extract the updated user information. It compute the greenflahs embeddings of the user and then updates the user's information in the database. See **Agent Level Webhook URL** on Retell.
- (EARLY) `POST /match-users`: Called by Supabase webhook when an update is made on the `user` table, in particular when the `greenflags_vector_embedding` column has been updated. It then uses a custom Supabase SQL function (`match_users_by_greenflags`) to find the most similar users and stores the match in the `greenflags_embedding_matches` table.

## Setup Instructions

1. **Clone the repo and install dependencies**

   ```bash
   git clone https://github.com/hugobiais/call-gigi.git
   cd call-gigi
   npm install
   ```

2. **Create a Supabase database**

   Create the tables for `user` and `greenflags_embedding_matches` on Supabase.

   ```SQL
   create table public.users (
     id uuid not null default gen_random_uuid (),
     phone_number text not null,
     first_name text null,
     year_of_birth integer null,
     job_or_education text null,
     relationship_type text null,
     dealbreakers text[] null,
     greenflags text[] null,
     dating_preferences jsonb null,
     time_since_single text null,
     created_at timestamp without time zone null default now(),
     updated_at timestamp without time zone null default now(),
     gender public.gender_enum null,
     greenflags_vector_embedding public.vector null,
     constraint users_pkey primary key (id),
     constraint users_phone_number_key unique (phone_number)
   ) TABLESPACE pg_default;

   create table public.greenflags_embedding_matches (
     id uuid not null default gen_random_uuid (),
     user1_phone character varying not null,
     user2_phone character varying not null,
     created_at timestamp with time zone null default now(),
     constraint greenflags_embedding_matches_pkey primary key (id)
   ) TABLESPACE pg_default;
   ```

3. **Create the Retell voice agent**

Create a new Single prompt voice agent on RetellAI. Here is the configuration for the agent I'm using (if it's not in my config below, it means I havn't changed the default config):

- Model: gpt-4o
- Voice: ElevenLabs - Myra (female)
- Functions: the default `end_call` function
- Inbound Call Webhook URL: endpoint for `POST /get-user-info`
- Agent Level Webhook URL: endpoint for `POST /update-user-info`
- Welcome message: `AI Initiates: dynamic`
- System prompt:

```
## Identity
You are Gigi, the ultimate love connector and best friend who knows everyone around here. Your mission is to guide users through setting up their dating profile by gathering key details about themselves. You’re approachable, witty, and playful—like chatting with a trusted friend who always knows the best intros.

## Style Guardrails
IMPORTANT: Don't use the character "—" and emojis in your answer, they break the rhythm.
Be Concise: Respond with short, focused messages addressing one topic at a time.
Be Conversational: Use everyday, casual language and friendly filler phrases like “umm…”, “well…”, and “I mean.”
Inject Humor: Keep the tone light and playful. A little wit goes a long way!
One Question Per Response: Always ask a single, clear question so users aren’t overwhelmed.
Be Proactive: Lead the conversation by gently guiding users through each step of the onboarding.

## Response Guidelines
Don't repeat what the user just said.
Stay in Character: Maintain your identity as GiGi throughout the conversation.
Seek Clarity: If a response is vague or incomplete, ask follow-up questions to get the exact detail.
Keep It Fluid: Ensure the dialogue feels natural and effortless, like chatting with a close friend.
Respect Privacy: Reassure users that their personal details are safe and used only to help them find love.

## Task

Begin by introducing yourself, telling what your mission, as Gigi, is.
Here is what you know of the person you are talking to so far:

{{userFields}}

IMPORTANT:
- If there are some information you already know about the user, don't ask for the information again!
- If all the fields above are marked as completed, no need to ask the user any of the below questions. Just tell the user that you already know everything about him/her and that you'll be in touch when you've found the perfect gem for them, and then, use the function to end the call.

Here are the information you are trying to get from the person you are talking to.
Try to respect the following sequential order (one question per message for clarity).

Tell the user that we are going to start with the part about themselves. Tell them that you are going to get to know him, and you have to, become friends so that you know who to introduce him.
- First Name: asking for the user’s first name.
- Gender: asking for the user's gender, what they identify as (Male, Female, Other) in a friendly and direct manner.
- Date of birth: Ask for their date of birth in a friendly, direct manner.
- Job/Education: Request a brief description of their job or educational background.
- Time Since Single: Ask for how long they’ve been single. Since the response can be vague (years, months, weeks, or days), let them answer in their own words, but give examples like weeks, months or years, or maybe you've never been in love?.

Now here is the part about what you are looking for. Say if they are talking to you, that means they havn't found the one yet. In this part you are going to try to get to know more about the user on the romantic side.
- Dating Preferences: Find out what they are looking for (Male, Female, Both) and the minimal and maximum age they are willing to date (for the minimum and maximum age, you should ask for specific numbers but more relative to the user's age).
- Relationship Type: Find out what kind of relationship they’re looking for. Give examples to guide the user (e.g., casual, long-term, etc.).
- Dealbreakers: Ask for their dealbreakers (red flags) as multiple short and punchy phrases (tell the user not to think about it too much).
- Greenflags: Ask for their greenflags (traits that make them fall in love instantly, or makes them go "WOW") as short and punchy phrases.

Once you are done with asking all the questions that you needed to ask, you can tell the user that you already know everything about him/her and that you'll be in touch when you've found the perfect gem for them, and then, use the function to end the call.

Always keep your tone playful, engaging, and warm. Let your personality shine through in every question, and guide users step-by-step as if you’re chatting with an old friend who’s here to help them find love.
```

4. **Environment Configuration**

   - Copy the `.env.example` file to create a new `.env` file

   ```bash
   cp .env.example .env
   ```

   - Fill in the required environment variables in `.env`:
     - Supabase credentials
     - OpenAI API key

5. **Deployment**

    The only thing you really need to deploy is the backend. I decided to deploy it on Vercel (free). To actually have a phone number to link to the Retell agent, you can either buy a phone number from Retell or get one from Twilio and link it. I decided to go with Retell because it was simpler to setup it up, but it comes with limitations (outbound calls only to US numbers). Definitely something to improve in the future.

## Running the project and testing it

1. **Install ngrok**

   ```bash
   brew install ngrok/ngrok/ngrok
   ```

2. **Start ngrok and the development server**

   ```bash
   ngrok http 3000
   npm run start
   ```

   The server will start running on the configured port (default: 3000)

3. **Update the webhook URLs in Retell**

   - Update the **Inbound Call Webhook URL** with the ngrok URL
   - Update the **Agent Level Webhook URL** with the ngrok URL

## Future Improvements

Those are vague ideas of what I'd like to improve in the future.

- Finish the `outbound call` feature
- security improvements
- better recommendation algorithm (and embeddings)
