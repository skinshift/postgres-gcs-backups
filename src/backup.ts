import { exec } from "child_process";
import { Storage, UploadOptions } from "@google-cloud/storage";
import { unlink } from "fs";
import { spawn } from "child_process";
import { createWriteStream } from "fs";

import { env } from "./env";

const uploadToGCS = async ({ name, path }: { name: string; path: string }) => {
  console.log("Uploading backup to GCS...");

  const bucketName = env.GCS_BUCKET;

  const uploadOptions: UploadOptions = {
    destination: name,
  };

  const storage = new Storage({
    projectId: env.GOOGLE_PROJECT_ID,
    credentials: JSON.parse(env.SERVICE_ACCOUNT_JSON),
  });

  await storage.bucket(bucketName).upload(path, uploadOptions);

  console.log("Backup uploaded to GCS...");
};

const dumpToFile = async (path: string) => {
  console.log("Dumping DB to file...");

  return new Promise((resolve, reject) => {
    const dumpProcess = spawn("pg_dump", [`${env.BACKUP_DATABASE_URL}`, "-F", "t"]);

    const gzipProcess = spawn("gzip");

    const writeStream = createWriteStream(path);

    dumpProcess.stdout.pipe(gzipProcess.stdin);
    gzipProcess.stdout.pipe(writeStream);

    dumpProcess.stderr.on("data", (data) => {
      console.error(`pg_dump error: ${data}`);
      reject(new Error(`pg_dump failed: ${data}`));
    });

    gzipProcess.stderr.on("data", (data) => {
      console.error(`gzip error: ${data}`);
      reject(new Error(`gzip failed: ${data}`));
    });

    writeStream.on("finish", () => {
      console.log("DB dumped to file...");
      resolve(undefined);
    });

    writeStream.on("error", (error) => {
      console.error(`File write error: ${error}`);
      reject(error);
    });
  });
};


const deleteFile = async (path: string) => {
  console.log("Deleting file...");
  await new Promise((resolve, reject) => {
    unlink(path, (err) => {
      reject({ error: JSON.stringify(err) });
      return;
    });
    resolve(undefined);
  });
};

export const backup = async () => {
  console.log("Initiating DB backup...");

  let date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, "-");
  const filename = `${env.BACKUP_PREFIX}backup-${timestamp}.tar.gz`;
  const filepath = `/tmp/${filename}`;

  await dumpToFile(filepath);
  await uploadToGCS({ name: filename, path: filepath });
  await deleteFile(filepath);

  console.log("DB backup complete...");
};
