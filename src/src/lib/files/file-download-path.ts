export function getSessionDownloadPath(fileId: string): string {
  return `/api/files/${fileId}/download`;
}
