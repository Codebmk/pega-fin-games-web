import { createClient } from "@supabase/supabase-js";
import { ulid } from "ulid";
import { config } from "../config.js";

const supabaseUrl = config.supabase.url;
const supabaseKey = config.supabase.secretKey;
const supabaseBucket = config.supabase.bucket;

if (!supabaseUrl || !supabaseKey || !supabaseBucket) {
  // eslint-disable-next-line no-console
  console.warn("Supabase storage is not fully configured.");
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

export async function uploadKycImage(params: {
  userId: string;
  side: "front" | "back";
  data: Buffer;
  contentType: string;
}) {
  if (!supabase || !supabaseBucket) {
    throw new Error("Supabase storage not configured");
  }

  const key = `kyc/${params.userId}/${params.side}-${ulid()}`;

  const { error } = await supabase.storage
    .from(supabaseBucket)
    .upload(key, params.data, {
      contentType: params.contentType,
      upsert: false
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(key);

  return data.publicUrl;
}
