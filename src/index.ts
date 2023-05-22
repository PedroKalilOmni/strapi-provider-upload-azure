import {ReadStream} from 'fs-extra';
import utils from '@strapi/utils';
import { BlockBlobClient } from "@azure/storage-blob";

const azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
const azureContainerName = process.env.AZURE_CONTAINER_NAME
if (azureConnectionString === undefined || azureContainerName === undefined) {
  throw new Error("Azure connection string and container name must not be undefined")
}

interface File {
  name: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  formats?: Record<string, unknown>;
  hash: string;
  ext?: string;
  mime: string;
  size: number;
  url: string;
  previewUrl?: string;
  path?: string;
  provider?: string;
  provider_metadata?: Record<string, unknown>;
  stream?: ReadStream;
  buffer?: Buffer;
}

const { PayloadTooLargeError } = utils.errors;
const { kbytesToBytes, bytesToHumanReadable } = utils.file;

interface InitOptions {
  sizeLimit?: number;
}

interface CheckFileSizeOptions {
  sizeLimit?: number;
}

export = {
  init({ sizeLimit: providerOptionsSizeLimit }: InitOptions = {}) {
    // TODO V5: remove providerOptions sizeLimit
    if (providerOptionsSizeLimit) {
      process.emitWarning(
        '[deprecated] In future versions, "sizeLimit" argument will be ignored from upload.config.providerOptions. Move it to upload.config'
      );
    }

    return {
      checkFileSize(file: File, options: CheckFileSizeOptions) {
        const { sizeLimit } = options ?? {};

        // TODO V5: remove providerOptions sizeLimit
        if (providerOptionsSizeLimit) {
          if (kbytesToBytes(file.size) > providerOptionsSizeLimit)
            throw new PayloadTooLargeError(
              `${file.name} exceeds size limit of ${bytesToHumanReadable(
                providerOptionsSizeLimit
              )}.`
            );
        } else if (sizeLimit) {
          if (kbytesToBytes(file.size) > sizeLimit)
            throw new PayloadTooLargeError(
              `${file.name} exceeds size limit of ${bytesToHumanReadable(sizeLimit)}.`
            );
        }
      },
      uploadStream(file: File): Promise<void> {
        const { stream } = file;
        if (stream === undefined) {
          return Promise.reject(new Error("Missing file stream"))
        }

        return new Promise(async (resolve, reject) => {
          const blobName = `${file.hash}${file.ext}`
          const blobService = new BlockBlobClient(azureConnectionString,azureContainerName,blobName)
          try {
            const result = await blobService.uploadStream(stream)
            file.url = blobService.url
            resolve();
          } catch (err) {
            return reject(err);
          }
        });
      },
      upload(file: File): Promise<void> {
        const { buffer } = file;
        if (buffer === undefined) {
          return Promise.reject(new Error("Missing file buffer"))
        }

        return new Promise(async (resolve, reject) => {
          const blobName = `${file.hash}${file.ext}`
          const blobService = new BlockBlobClient(azureConnectionString,azureContainerName,blobName)
          try {
            const result = await blobService.uploadData(buffer)
            file.url = blobService.url
            resolve()
          } catch (err) {
            return reject(err)
          }
        });
      },
      delete(file: File): Promise<string | void> {
        return new Promise(async (resolve, reject) => {
          const blobName = `${file.hash}${file.ext}`
          const blobService = new BlockBlobClient(azureConnectionString,azureContainerName,blobName)
          try {
            const result = await blobService.delete()
            resolve()
          } catch (err) {
            return reject(err)
          }
        });
      },
    };
  },
};
