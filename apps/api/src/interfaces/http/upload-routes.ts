import { createWriteStream, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { basename, extname, join, resolve } from "node:path";

import type { FastifyInstance } from "fastify";

import { ValidationError } from "../../domain/errors.js";

interface UploadRouteDependencies {
  uploadsRoot: string;
}

export function registerUploadRoutes(
  server: FastifyInstance,
  dependencies: UploadRouteDependencies,
) {
  server.post("/api/uploads", async (request, reply) => {
    const file = await request.file();

    if (!file) {
      throw new ValidationError("Attach an archive file to upload");
    }

    if (!isAllowedArchiveName(file.filename)) {
      throw new ValidationError("Only .zip, .tar, .tgz, and .tar.gz files are supported");
    }

    const uploadDirectory = resolve(dependencies.uploadsRoot, randomUUID());
    mkdirSync(uploadDirectory, { recursive: true });

    const fileName = basename(file.filename);
    const filePath = join(uploadDirectory, fileName);

    await pipeline(file.file, createWriteStream(filePath));

    return reply.code(201).send({
      upload: {
        path: filePath,
        fileName,
      },
    });
  });
}

function isAllowedArchiveName(fileName: string) {
  const extension = extname(fileName);

  return (
    extension === ".zip" ||
    extension === ".tar" ||
    extension === ".tgz" ||
    fileName.endsWith(".tar.gz")
  );
}

