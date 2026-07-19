import { supabase } from "./supabase";
import { ProductImage } from "@/types/productImage";
import { Product } from "@/types/product";
import { generateUUID } from "./utils";

const BUCKET = "product-images";

/** Thumbnail = lowest sort_order from a joined `images` list, falling back
 * to the legacy image_url column (pre-migration products, or a fetch that
 * didn't embed images) so nothing regresses to a blank thumbnail. There is
 * no separate "cover" flag - reordering is the only way to change this. */
export function coverImageUrl(product: Pick<Product, "images" | "image_url">): string | undefined {
  const sorted = product.images ? [...product.images].sort((a, b) => a.sort_order - b.sort_order) : [];
  return sorted[0]?.image_url || product.image_url || undefined;
}

/** Recognizes the common Google Drive share-link shapes and rewrites them
 * to the direct-view form ("uc?export=view&id=...") that works in an
 * <img> tag - a plain "view" link only renders inside Drive's own UI.
 * Non-Drive URLs pass through untouched. */
export function convertGoogleDriveUrl(url: string): string {
  const trimmed = url.trim();
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?export=view&id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) return `https://drive.google.com/uc?export=view&id=${match[1]}`;
  }

  return trimmed;
}

export async function getProductImages(productId: string): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching product images:", error);
    return [];
  }

  return data as ProductImage[];
}

async function nextSortOrder(productId: string): Promise<number> {
  const existing = await getProductImages(productId);
  return existing.length === 0 ? 0 : Math.max(...existing.map((i) => i.sort_order)) + 1;
}

export async function addProductImageUrls(productId: string, urls: string[]) {
  const cleanUrls = urls.map((u) => convertGoogleDriveUrl(u)).filter(Boolean);
  if (cleanUrls.length === 0) return { data: [], error: null };

  const start = await nextSortOrder(productId);
  const rows = cleanUrls.map((image_url, i) => ({
    product_id: productId,
    image_url,
    sort_order: start + i,
  }));

  const { data, error } = await supabase.from("product_images").insert(rows).select();

  if (error) {
    console.error("Error adding product image URLs:", error);
    return { data: null, error };
  }

  return { data: data as ProductImage[], error: null };
}

export async function uploadProductImageFiles(productId: string, files: File[]) {
  const start = await nextSortOrder(productId);
  const uploaded: ProductImage[] = [];
  let firstError: Error | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${productId}/${generateUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
    if (uploadError) {
      console.error("Error uploading product image:", uploadError);
      firstError = uploadError;
      continue;
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const { data, error } = await supabase
      .from("product_images")
      .insert({ product_id: productId, image_url: urlData.publicUrl, sort_order: start + i })
      .select()
      .single();

    if (error) {
      console.error("Error saving uploaded image row:", error);
      firstError = error;
      continue;
    }

    uploaded.push(data as ProductImage);
  }

  return { data: uploaded, error: firstError };
}

/** Best-effort: only removes the underlying file when it's hosted in our
 * own bucket - external/Drive URLs just lose their DB row. */
async function deleteStorageObjectForUrl(imageUrl: string) {
  const marker = `/object/public/${BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) return;

  const path = imageUrl.slice(index + marker.length);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error("Error deleting storage object:", error);
}

export async function deleteProductImage(image: ProductImage) {
  await deleteStorageObjectForUrl(image.image_url);

  const { error } = await supabase.from("product_images").delete().eq("id", image.id);
  if (error) console.error("Error deleting product image:", error);

  return error;
}

/** Persists a full reorder in one go - sort_order becomes each image's
 * index in the array passed in (already reordered client-side by drag &
 * drop). This is also how the thumbnail changes: there's no separate
 * "set cover" action, dragging an image to the front is the only way. */
export async function setImageOrder(images: ProductImage[]) {
  const results = await Promise.all(
    images.map((image, index) =>
      image.sort_order === index
        ? Promise.resolve(null)
        : supabase.from("product_images").update({ sort_order: index }).eq("id", image.id)
    )
  );

  const failed = results.find((r) => r && r.error);
  if (failed?.error) {
    console.error("Error saving image order:", failed.error);
    return failed.error;
  }

  return null;
}
