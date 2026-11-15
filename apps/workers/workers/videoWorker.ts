import fs from "fs";
import { eq } from "drizzle-orm";

import { db, withTransaction } from "@karakeep/db";
import { AssetTypes, bookmarkLinks } from "@karakeep/db/schema";
import {
  addLogFields,
  ASSET_TYPES,
  newAssetId,
  QuotaService,
  saveAssetFromFile,
  silentDeleteAsset,
  StorageQuotaError,
  VideoWorkerQueue,
  ZVideoRequest,
  zvideoRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import { resolveShouldCaptureVideo } from "@karakeep/shared/utils/bookmarkUtils";

import type { VideoDownloader } from "./video/common";
import { workerStatsCounter } from "../metrics";
import { selectRunProxies } from "../network";
import { withWorkerEventLog, withWorkerTracing } from "../workerTracing";
import { getBookmarkDetails, updateAsset } from "../workerUtils";
import { deleteVideoFile } from "./video/common";
import { localVideoDownloader } from "./video/localVideoDownloader";
import { remoteVideoDownloader } from "./video/remoteVideoDownloader";

const videoDownloader: VideoDownloader = serverConfig.sandbox.url
  ? remoteVideoDownloader
  : localVideoDownloader;

type VideoDownloadStatus = "pending" | "downloading" | "success" | "failure";

/**
 * Records the video download lifecycle on the link so the UI can show progress.
 * `null` clears the indicator (e.g. the URL turned out not to be a video).
 */
async function setVideoDownloadStatus(
  bookmarkId: string,
  status: VideoDownloadStatus | null,
) {
  await db
    .update(bookmarkLinks)
    .set({ videoDownloadStatus: status })
    .where(eq(bookmarkLinks.id, bookmarkId));
}

export class VideoWorker {
  static async build() {
    logger.info("Starting video worker ...");

    return (await getQueueClient())!.createRunner<ZVideoRequest>(
      VideoWorkerQueue,
      {
        run: withWorkerTracing(
          "videoWorker.run",
          withWorkerEventLog("videoWorker.run", runWorker),
        ),
        onComplete: async (job) => {
          workerStatsCounter.labels("video", "completed").inc();
          const jobId = job.id;
          logger.info(
            `[VideoCrawler][${jobId}] Video Download Completed successfully`,
          );
          return Promise.resolve();
        },
        onError: async (job) => {
          workerStatsCounter.labels("video", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter.labels("video", "failed_permanent").inc();
          }
          const jobId = job.id;
          logger.error(
            `[VideoCrawler][${jobId}] Video Download job failed: ${job.error}`,
          );
          return Promise.resolve();
        },
      },
      {
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.crawler.downloadVideoTimeout,
        concurrency: 1,
        validator: zvideoRequestSchema,
      },
    );
  }
}

async function runWorker(job: DequeuedJob<ZVideoRequest>) {
  const jobId = job.id;
  const { bookmarkId, onDemand } = job.data;
  addLogFields<"videoWorker.run">({ "bookmark.id": bookmarkId });

  const {
    url,
    userId,
    captureVideo,
    videoAssetId: oldVideoAssetId,
  } = await getBookmarkDetails(bookmarkId);

  // On-demand requests come from the user explicitly asking for this video, so
  // only the server-wide on-demand switch applies. Crawl-triggered downloads
  // honour the bookmark's own captureVideo override over the server default.
  const downloadEnabled = onDemand
    ? serverConfig.crawler.downloadVideoOnDemand
    : resolveShouldCaptureVideo(
        captureVideo,
        serverConfig.crawler.downloadVideo,
      );
  if (!downloadEnabled) {
    logger.info(
      `[VideoCrawler][${jobId}] Skipping video download from "${url}", because it is disabled.`,
    );
    await setVideoDownloadStatus(bookmarkId, null);
    return;
  }

  await setVideoDownloadStatus(bookmarkId, "downloading");

  const videoAssetId = newAssetId();
  const result = await videoDownloader.download({
    jobId,
    url,
    runProxy: selectRunProxies(),
    assetId: videoAssetId,
    abortSignal: job.abortSignal,
  });
  if (result.status === "skipped") {
    logger.info(
      `[VideoCrawler][${jobId}] Skipping video download from "${url}": ${result.reason}`,
    );
    await setVideoDownloadStatus(bookmarkId, null);
    return;
  }
  if (result.status === "failed") {
    logger.error(
      `[VideoCrawler][${jobId}] Failed to download a video from "${url}": ${result.reason}`,
    );
    await setVideoDownloadStatus(bookmarkId, "failure");
    return;
  }
  const assetPath = result.path;

  // Get file size and check quota before saving
  const stats = await fs.promises.stat(assetPath);
  const fileSize = stats.size;

  try {
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      userId,
      fileSize,
    );

    await saveAssetFromFile({
      userId,
      assetId: videoAssetId,
      assetPath,
      metadata: { contentType: ASSET_TYPES.VIDEO_MP4 },
      quotaApproved,
    });

    await withTransaction(db, async (txn) => {
      await updateAsset(
        oldVideoAssetId,
        {
          id: videoAssetId,
          bookmarkId,
          userId,
          assetType: AssetTypes.LINK_VIDEO,
          contentType: ASSET_TYPES.VIDEO_MP4,
          size: fileSize,
        },
        txn,
      );
    });
    await silentDeleteAsset(userId, oldVideoAssetId);
    await setVideoDownloadStatus(bookmarkId, "success");

    logger.info(
      `[VideoCrawler][${jobId}] Finished downloading video from "${url}" and adding it to the database`,
    );
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      logger.warn(
        `[VideoCrawler][${jobId}] Skipping video storage due to quota exceeded: ${error.message}`,
      );
      await deleteVideoFile(jobId, videoAssetId);
      await setVideoDownloadStatus(bookmarkId, "failure");
      return;
    }
    await setVideoDownloadStatus(bookmarkId, "failure");
    throw error;
  }
}
