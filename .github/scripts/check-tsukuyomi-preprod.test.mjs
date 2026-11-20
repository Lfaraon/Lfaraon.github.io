import assert from "node:assert/strict";
import test from "node:test";
import { checkPreproduction, entryAsset } from "./check-tsukuyomi-preprod.mjs";

const asset = "/tsukuyomi-preprod/assets/index-build-1.js";
const html = `<script type="module" crossorigin src="${asset}"></script>`;
const bundle = "console.log('Tsukuyomi');\n";

function mockFetch({ deployedHtml = html, deployedBundle = bundle, source, status } = {}) {
  return async (url) => {
    if (url.endsWith("/tsukuyomi-preprod/")) return new Response(deployedHtml);
    if (url.endsWith(asset)) return new Response(deployedBundle);
    if (url.endsWith("/match-source.json")) return Response.json(source ?? { matches: [{}], snapshotAt: "2026-11-19T14:00:00Z" });
    if (url.endsWith("/live-match-status.json")) {
      return Response.json(status ?? { checkedAt: "2026-11-17T22:15:00Z", matches: {
        a: { checkedAt: "2026-11-19T19:00:00Z" },
        b: { checkedAt: "2026-11-20T01:37:10Z" },
      } });
    }
    return new Response(null, { status: 404 });
  };
}

test("contrôle le build Pages et prend le dernier contrôle individuel du calendrier", async () => {
  const result = await checkPreproduction({ checkedInHtml: html, checkedInBundle: bundle.replace(/\n/g, "\r\n"), fetcher: mockFetch() });
  assert.deepEqual(result, {
    asset: "index-build-1.js",
    matches: 1,
    statusEntries: 2,
    calendarSnapshotAt: "2026-11-19T14:00:00.000Z",
    lastMatchCheckAt: "2026-11-20T01:37:10.000Z",
  });
});

test("refuse un bundle externe, ancien ou différent du fichier versionné", async () => {
  assert.throws(() => entryAsset(`<script src="https://example.test${asset}"></script>`), /un seul bundle/);
  await assert.rejects(checkPreproduction({ checkedInHtml: html, checkedInBundle: bundle, fetcher: mockFetch({ deployedHtml: html.replace("build-1", "build-0") }) }), /diffère du build/);
  await assert.rejects(checkPreproduction({ checkedInHtml: html, checkedInBundle: bundle, fetcher: mockFetch({ deployedBundle: "unrelated" }) }), /empreinte du bundle/);
});

test("signale un calendrier dont le format est incompatible", async () => {
  await assert.rejects(checkPreproduction({ checkedInHtml: html, checkedInBundle: bundle, fetcher: mockFetch({ status: { matches: [] } }) }), /dictionnaire de matchs/);
});
