/**
 * Cloudinary image upload service.
 * Uses unsigned upload with the configured preset.
 */

const CLOUDINARY_CLOUD_NAME = "dzzihzfkk";
const CLOUDINARY_UPLOAD_PRESET = "olasandbselectronics";
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/**
 * Uploads a single image file to Cloudinary.
 * @param file - The image File to upload
 * @returns The secure_url string from Cloudinary
 * @throws Error with Cloudinary's message if upload fails
 */
export const uploadImage = async (file: File): Promise<string> => {
  if (!file) throw new Error("No file provided for upload.");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(CLOUDINARY_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    const msg = errorData.error?.message || `Upload failed (HTTP ${response.status})`;
    console.error("Cloudinary upload error:", errorData);
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data.secure_url) throw new Error("Cloudinary returned no URL.");
  return data.secure_url;
};

/**
 * Uploads multiple image files to Cloudinary.
 * Returns only the successfully uploaded URLs.
 */
export const uploadImages = async (files: File[]): Promise<string[]> => {
  const results: string[] = [];
  for (const file of files) {
    try {
      const url = await uploadImage(file);
      results.push(url);
    } catch (err: any) {
      console.error(`Failed to upload ${file.name}:`, err.message);
      throw err; // re-throw so caller can show toast
    }
  }
  return results;
};
