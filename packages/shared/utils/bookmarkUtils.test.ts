import { describe, expect, it, test } from "vitest";

import type { ZBookmark } from "../types/bookmarks";
import { BookmarkTypes } from "../types/bookmarks";
import {
  getBookmarkDisplayTitle,
  getBookmarkRefreshInterval,
  getTextDisplayTitle,
  isBookmarkStillDownloadingVideo,
  isBookmarkStillLoading,
  resolveShouldCaptureVideo,
} from "./bookmarkUtils";

function makeLinkBookmark(overrides: {
  crawlStatus?: "pending" | "success" | "failure";
  crawledAt?: Date | null;
  videoDownloadStatus?:
    | "pending"
    | "downloading"
    | "success"
    | "failure"
    | null;
  taggingStatus?: "pending" | "success" | "failure";
  summarizationStatus?: "pending" | "success" | "failure";
}): ZBookmark {
  return {
    id: "bm1",
    createdAt: new Date(),
    modifiedAt: null,
    title: null,
    archived: false,
    favourited: false,
    captureVideo: null,
    taggingStatus: overrides.taggingStatus ?? "success",
    summarizationStatus: overrides.summarizationStatus ?? "success",
    embeddingStatus: "success",
    note: null,
    summary: null,
    userId: "u1",
    tags: [],
    assets: [],
    content: {
      type: BookmarkTypes.LINK,
      url: "https://example.com",
      crawlStatus: overrides.crawlStatus ?? "success",
      crawledAt: overrides.crawledAt ?? new Date(),
      videoDownloadStatus: overrides.videoDownloadStatus ?? null,
    },
  } as ZBookmark;
}

describe("resolveShouldCaptureVideo", () => {
  test("force-on overrides a disabled server default", () => {
    expect(resolveShouldCaptureVideo(true, false)).toBe(true);
  });

  test("force-off overrides an enabled server default", () => {
    expect(resolveShouldCaptureVideo(false, true)).toBe(false);
  });

  test("null inherits the enabled server default", () => {
    expect(resolveShouldCaptureVideo(null, true)).toBe(true);
  });

  test("null inherits the disabled server default", () => {
    expect(resolveShouldCaptureVideo(null, false)).toBe(false);
  });

  test("undefined inherits the server default", () => {
    expect(resolveShouldCaptureVideo(undefined, true)).toBe(true);
  });
});

describe("isBookmarkStillDownloadingVideo", () => {
  test("true while pending", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "pending" }),
      ),
    ).toBe(true);
  });

  test("true while downloading", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "downloading" }),
      ),
    ).toBe(true);
  });

  test("false when finished, failed, or never attempted", () => {
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "success" }),
      ),
    ).toBe(false);
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: "failure" }),
      ),
    ).toBe(false);
    expect(
      isBookmarkStillDownloadingVideo(
        makeLinkBookmark({ videoDownloadStatus: null }),
      ),
    ).toBe(false);
  });
});

describe("isBookmarkStillLoading includes video downloads", () => {
  test("still loading while a video is downloading even if everything else is done", () => {
    const bookmark = makeLinkBookmark({
      crawlStatus: "success",
      taggingStatus: "success",
      summarizationStatus: "success",
      videoDownloadStatus: "downloading",
    });
    expect(isBookmarkStillLoading(bookmark)).toBe(true);
  });

  test("not loading once the video download has finished", () => {
    const bookmark = makeLinkBookmark({
      crawlStatus: "success",
      taggingStatus: "success",
      summarizationStatus: "success",
      videoDownloadStatus: "success",
    });
    expect(isBookmarkStillLoading(bookmark)).toBe(false);
  });
});

describe("getTextDisplayTitle", () => {
  it("uses the first non-empty line", () => {
    expect(getTextDisplayTitle("\n\n  \nFirst line\nSecond line")).toBe(
      "First line",
    );
  });

  it.each([
    ["# Heading", "Heading"],
    ["### Sub heading", "Sub heading"],
    ["> quoted", "quoted"],
    ["- item", "item"],
    ["* item", "item"],
    ["1. item", "item"],
    ["- [ ] todo", "todo"],
    ["- [x] done", "done"],
    ["**bold** and *italic*", "bold and italic"],
    ["__bold__ and _italic_", "bold and italic"],
    ["some `code` here", "some code here"],
    ["~~gone~~ kept", "gone kept"],
    ["[a link](https://example.com) here", "a link here"],
    ["![alt text](https://example.com/a.png)", "alt text"],
  ])("strips markers from %s", (input, expected) => {
    expect(getTextDisplayTitle(input)).toBe(expected);
  });

  it("leaves underscores and asterisks inside words alone", () => {
    expect(getTextDisplayTitle("snake_case_name and 2*3*4")).toBe(
      "snake_case_name and 2*3*4",
    );
  });

  it("skips fences and horizontal rules", () => {
    expect(getTextDisplayTitle("```ts\nconst a = 1;\n```")).toBe(
      "const a = 1;",
    );
    expect(getTextDisplayTitle("---\nAfter the rule")).toBe("After the rule");
  });

  it("truncates long lines with an ellipsis", () => {
    expect(getTextDisplayTitle("a".repeat(200), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("returns null when there's no text", () => {
    expect(getTextDisplayTitle("")).toBeNull();
    expect(getTextDisplayTitle("  \n\n---\n")).toBeNull();
  });
});

describe("getBookmarkDisplayTitle", () => {
  const withContent = (content: unknown, title: string | null = null) =>
    ({ title, content }) as unknown as ZBookmark;

  it("prefers the bookmark's own title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "Mine"),
      ),
    ).toBe("Mine");
  });

  it("names an untitled note after its first line", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.TEXT,
          text: "# UX review g6qqdx\nThe rest of it",
        }),
      ),
    ).toBe("UX review g6qqdx");
  });

  it("treats a blank title as no title", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "First line" }, "   "),
      ),
    ).toBe("First line");
    expect(
      getBookmarkDisplayTitle(
        withContent(
          { type: BookmarkTypes.LINK, url: "https://example.com" },
          "   ",
        ),
      ),
    ).toBe("https://example.com");
  });

  it("is null for a note with no text in it", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.TEXT, text: "" }),
      ),
    ).toBeNull();
  });

  it("falls back on a link's own title, then its URL", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({
          type: BookmarkTypes.LINK,
          title: "Crawled title",
          url: "https://example.com",
        }),
      ),
    ).toBe("Crawled title");
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.LINK, url: "https://example.com" }),
      ),
    ).toBe("https://example.com");
  });

  it("falls back on an asset's file name", () => {
    expect(
      getBookmarkDisplayTitle(
        withContent({ type: BookmarkTypes.ASSET, fileName: "scan.pdf" }),
      ),
    ).toBe("scan.pdf");
  });
});

describe("getBookmarkRefreshInterval", () => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const link = (opts: {
    createdAt: Date;
    modifiedAt: Date | null;
    crawlStatus: "pending" | "success";
  }) =>
    ({
      id: "bookmark",
      createdAt: opts.createdAt,
      modifiedAt: opts.modifiedAt,
      taggingStatus: "success",
      summarizationStatus: "success",
      content: {
        type: BookmarkTypes.LINK,
        url: "https://example.com",
        crawlStatus: opts.crawlStatus,
      },
    }) as unknown as ZBookmark;

  it("polls a freshly created bookmark every second", () => {
    const now = new Date();
    expect(
      getBookmarkRefreshInterval(
        link({ createdAt: now, modifiedAt: now, crawlStatus: "pending" }),
      ),
    ).toBe(1000);
  });

  it("stops polling a bookmark that hasn't changed in a long time", () => {
    const longAgo = new Date(Date.now() - WEEK);
    expect(
      getBookmarkRefreshInterval(
        link({ createdAt: longAgo, modifiedAt: null, crawlStatus: "pending" }),
      ),
    ).toBe(false);
  });

  it("polls an old bookmark that was just modified (e.g. recrawled)", () => {
    expect(
      getBookmarkRefreshInterval(
        link({
          createdAt: new Date(Date.now() - WEEK),
          modifiedAt: new Date(),
          crawlStatus: "pending",
        }),
      ),
    ).toBe(1000);
  });

  it("doesn't poll a bookmark that's done loading", () => {
    const now = new Date();
    expect(
      getBookmarkRefreshInterval(
        link({ createdAt: now, modifiedAt: now, crawlStatus: "success" }),
      ),
    ).toBe(false);
  });
});
