/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_CONTACT_PHONE?: string;
  readonly VITE_CONTACT_WHATSAPP?: string;
  readonly VITE_CONTACT_EMAIL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
declare module '*.md?raw' { const content: string; export default content; }
