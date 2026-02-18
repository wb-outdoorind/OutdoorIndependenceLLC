import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SignedUrlArgs = {
  bucket: string;
  path: string;
  expiresIn?: number;
};

const DEFAULT_EXPIRES_IN_SECONDS = 60 * 30;

async function createServerSupabaseForStorage() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // no-op in Server Components where setting cookies can throw
          }
        },
      },
    }
  );
}

async function getSignedUrl({ bucket, path, expiresIn }: SignedUrlArgs) {
  if (!bucket?.trim()) {
    throw new Error("Bucket is required for signed URL generation.");
  }

  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    throw new Error("Path is required for signed URL generation.");
  }

  const supabase = await createServerSupabaseForStorage();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(normalizedPath, expiresIn ?? DEFAULT_EXPIRES_IN_SECONDS);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || "Failed to create signed URL.");
  }

  return data.signedUrl;
}

export async function getSignedContentUrl(args: SignedUrlArgs) {
  return getSignedUrl(args);
}

export async function getSignedThumbUrl(args: SignedUrlArgs) {
  return getSignedUrl(args);
}
