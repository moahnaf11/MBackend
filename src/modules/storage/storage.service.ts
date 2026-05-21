import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type CreatePresignedUploadInput = {
  folder: string;
  ownerId: string;
  contentType: string;
  sizeBytes: number;
};

type PresignedUpload = {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresInSeconds: number;
  method: "PUT";
  headers: {
    "Content-Type": string;
  };
};

@Injectable()
export class StorageService {
  private readonly maxAvatarBytes = 2 * 1024 * 1024;
  private readonly uploadUrlTtlSeconds = 5 * 60;
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>("S3_BUCKET");
    this.publicBaseUrl = this.config.getOrThrow<string>("S3_PUBLIC_BASE_URL").replace(/\/$/, "");
    this.client = new S3Client({
      region: this.config.get<string>("S3_REGION") ?? "auto",
      endpoint: this.config.get<string>("S3_ENDPOINT"),
      forcePathStyle: this.config.get<string>("S3_FORCE_PATH_STYLE") === "true",
      credentials: {
        accessKeyId: this.config.getOrThrow<string>("S3_ACCESS_KEY_ID"),
        secretAccessKey: this.config.getOrThrow<string>("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  async createPresignedImageUpload(input: CreatePresignedUploadInput): Promise<PresignedUpload> {
    const extension = IMAGE_EXTENSIONS[input.contentType];

    if (!extension) {
      throw new BadRequestException("Avatar must be a JPEG, PNG, or WebP image.");
    }

    if (input.sizeBytes <= 0 || input.sizeBytes > this.maxAvatarBytes) {
      throw new BadRequestException("Avatar image must be 2MB or smaller.");
    }

    const objectKey = `${input.folder}/${input.ownerId}/${randomUUID()}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadUrlTtlSeconds,
    });

    return {
      uploadUrl,
      objectKey,
      publicUrl: this.getPublicUrl(objectKey),
      expiresInSeconds: this.uploadUrlTtlSeconds,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
      },
    };
  }

  assertObjectKeyBelongsToOwner(objectKey: string, folder: string, ownerId: string): void {
    const expectedPrefix = `${folder}/${ownerId}/`;

    if (!objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException("Invalid avatar object key.");
    }
  }

  getPublicUrl(objectKey: string): string {
    return `${this.publicBaseUrl}/${objectKey}`;
  }

  async assertObjectExists(objectKey: string): Promise<void> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
    } catch (error) {
      if (this.isObjectMissingError(error)) {
        throw new BadRequestException("Uploaded avatar object was not found.");
      }

      throw new ServiceUnavailableException("Storage provider is currently unavailable.");
    }
  }

  async deleteObjectByPublicUrl(publicUrl: string): Promise<void> {
    const objectKey = this.getObjectKeyFromPublicUrl(publicUrl);

    if (!objectKey) return;

    await this.deleteObject(objectKey);
  }

  private async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  private getObjectKeyFromPublicUrl(publicUrl: string): string | null {
    if (!publicUrl.startsWith(`${this.publicBaseUrl}/`)) {
      return null;
    }

    return decodeURIComponent(publicUrl.slice(this.publicBaseUrl.length + 1));
  }

  private isObjectMissingError(error: unknown): boolean {
    if (!(error instanceof S3ServiceException)) {
      return false;
    }

    return (
      error.name === "NotFound" ||
      error.name === "NoSuchKey" ||
      error.$metadata.httpStatusCode === 404
    );
  }
}
