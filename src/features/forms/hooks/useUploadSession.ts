import { createUploadSession, deleteSubmissionFile, finalizeUpload, getSignedPreview } from "@/lib/uploads.functions";

/**
 * Hook helper untuk upload workflow signed URL:
 * createUploadSession → PUT signed URL → finalizeUpload.
 */
export function useUploadSession() {
  async function uploadFile({
    file,
    submissionId,
    fieldKode,
  }: {
    file: File;
    submissionId: string;
    fieldKode: string;
  }): Promise<string> {
    const sess = (await createUploadSession({
      data: { submissionId, fieldKode, filename: file.name, mime: file.type, sizeBytes: file.size },
    })) as { signedUrl: string; path: string };
    const up = await fetch(sess.signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!up.ok) throw new Error("Upload gagal");
    await finalizeUpload({
      data: { submissionId, fieldKode, storagePath: sess.path, mime: file.type, sizeBytes: file.size },
    });
    return sess.path;
  }

  async function previewFile(fileId: string, ttlSeconds = 300) {
    const r = (await getSignedPreview({ data: { fileId, ttlSeconds } })) as { url: string };
    window.open(r.url, "_blank", "noopener");
  }

  async function removeFile(fileId: string) {
    await deleteSubmissionFile({ data: { fileId } });
  }

  return { uploadFile, previewFile, removeFile };
}
