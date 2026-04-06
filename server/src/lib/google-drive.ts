import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";

export class GoogleDriveService {
  private drive: drive_v3.Drive;

  constructor(accessToken: string) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: "v3", auth });
  }

  async createFolder(name: string, parentId?: string): Promise<string> {
    const fileMetadata: drive_v3.Schema$File = {
      name,
      mimeType: "application/vnd.google-apps.folder",
    };
    if (parentId) {
      fileMetadata.parents = [parentId];
    }

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      fields: "id",
    });

    if (!response.data.id) {
      throw new Error("Failed to create folder: no ID returned");
    }
    return response.data.id;
  }

  async uploadFile(
    fileName: string,
    mimeType: string,
    fileBuffer: Buffer,
    folderId: string
  ): Promise<{ id: string; name: string; mimeType: string }> {
    const fileMetadata: drive_v3.Schema$File = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: Readable.from(fileBuffer),
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name, mimeType",
    });

    if (!response.data.id) {
      throw new Error("Failed to upload file: no ID returned");
    }

    return {
      id: response.data.id,
      name: response.data.name || fileName,
      mimeType: response.data.mimeType || mimeType,
    };
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  async getFile(fileId: string): Promise<{
    metadata: drive_v3.Schema$File;
    content: Buffer;
  }> {
    const [metadataResponse, contentResponse] = await Promise.all([
      this.drive.files.get({
        fileId,
        fields: "id, name, mimeType, size, createdTime, modifiedTime",
      }),
      this.drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      ),
    ]);

    return {
      metadata: metadataResponse.data,
      content: Buffer.from(contentResponse.data as ArrayBuffer),
    };
  }

  async listFiles(
    folderId: string
  ): Promise<drive_v3.Schema$File[]> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, size, createdTime, modifiedTime)",
      orderBy: "createdTime desc",
    });

    return response.data.files || [];
  }
}
