<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/72bfc329-ecfe-4608-af32-3dc1bffeddcb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env` to your Gemini API key
3. Run the app:
   `npm run dev`

## Supabase Integration

This project is linked with Supabase for data storage and asset hosting:
* **Database**: Tables created and managed via the `supabase_schema.sql` schema.
* **Storage**: Public bucket named `app-files` is used for user avatars and lesson audio files.

