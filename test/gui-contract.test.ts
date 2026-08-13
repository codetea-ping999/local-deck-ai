import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { startGuiServer, validateGenerateRequest } from "../src/gui/server.js";

const presentation = {
  title: "GUI contract",
  slides: [{ title: "Review", layout: "content" as const, bullets: ["Keep editing local"] }]
};

test("generate request supports review-first render:false mode", () => {
  const request = validateGenerateRequest({ content: "# Source", model: "qwen3:8b", render: false, theme: { footer: "Review" } });
  assert.equal(request.render, false);
  assert.equal(request.theme?.footer, "Review");
});

test("GUI render returns a downloadable artifact and validation returns quality report", async () => {
  const server = startGuiServer(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const validationResponse = await fetch(`${baseUrl}/api/validate-presentation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentation }) });
    assert.equal(validationResponse.status, 200);
    const validation = await validationResponse.json() as { quality: { valid: boolean } };
    assert.equal(validation.quality.valid, true);

    const renderResponse = await fetch(`${baseUrl}/api/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentation, format: "html", outputPath: "contract.html", theme: { footer: "Contract footer" } }) });
    assert.equal(renderResponse.status, 200);
    const artifact = await renderResponse.json() as { artifactId: string; downloadUrl: string; format: string };
    assert.equal(artifact.format, "html");
    assert.match(artifact.downloadUrl, /^\/api\/artifacts\/[0-9a-f-]{36}$/);

    const downloadResponse = await fetch(`${baseUrl}${artifact.downloadUrl}`);
    assert.equal(downloadResponse.status, 200);
    assert.match(await downloadResponse.text(), /Contract footer/);

    const jsonRenderResponse = await fetch(`${baseUrl}/api/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ presentation, format: "json", outputPath: "contract.json" }) });
    assert.equal(jsonRenderResponse.status, 200);
    const jsonArtifact = await jsonRenderResponse.json() as { downloadUrl: string };
    const jsonDownload = await fetch(`${baseUrl}${jsonArtifact.downloadUrl}`);
    assert.equal(jsonDownload.status, 200);
    assert.deepEqual(JSON.parse(await jsonDownload.text()), presentation);

    const traversalResponse = await fetch(`${baseUrl}/api/artifacts/not-an-id`);
    assert.equal(traversalResponse.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
