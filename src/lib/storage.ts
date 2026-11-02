import { supabase } from '@/lib/supabase';

type UploadBucket = 'product-images' | 'nin-verification';

export async function uploadImage(
  file: File,
  userId: string,
  bucket: UploadBucket,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;

  if (bucket === 'product-images') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  return path;
}
