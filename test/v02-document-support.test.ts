import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { test } from "node:test";
import { DocumentError, chunkDocument, readDocument } from "../src/parser/readDocument.js";
import { generatePresentation, summarizeChunks } from "../src/pipeline/generatePresentation.js";

const fixtureDirectory = join(process.cwd(), "test", "fixtures");

function createPdf(text: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(`BT /F1 18 Tf 72 720 Td (${text}) Tj ET`, "ascii")} >>\nstream\nBT /F1 18 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, "ascii")); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function createDocx(text: string): Buffer {
  const files = [
    ["[Content_Types].xml", "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxml-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>"],
    ["_rels/.rels", "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"],
    ["word/document.xml", `<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`]
  ].map(([name, value]) => ({ name, data: Buffer.from(value, "utf8") }));
  const local: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const file of files) {
    const compressed = deflateRawSync(file.data);
    const name = Buffer.from(file.name, "utf8"); const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 6); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc32(file.data), 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(file.data.length, 22); header.writeUInt16LE(name.length, 26); name.copy(header, 30); local.push(header, compressed);
    const directory = Buffer.alloc(46 + name.length); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10); directory.writeUInt32LE(crc32(file.data), 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(file.data.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42); name.copy(directory, 46); central.push(directory); offset += header.length + compressed.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, directory, end]);
}

test("readDocument extracts PDF and DOCX fixture content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "local-deck-ai-v02-"));
  const pdfPath = join(directory, "sample.PDF"); const docxPath = join(directory, "sample.DOCX");
  await writeFile(pdfPath, createPdf("Local Deck PDF Fixture")); await writeFile(docxPath, createDocx("Local Deck DOCX Fixture"));
  const pdf = await readDocument(pdfPath); const docx = await readDocument(docxPath);
  assert.equal(pdf.kind, "pdf"); assert.match(pdf.content, /Local Deck PDF Fixture/);
  assert.equal(docx.kind, "docx"); assert.match(docx.content, /Local Deck DOCX Fixture/);
});

test("chunkDocument preserves overlap and rejects invalid settings", () => {
  const source = Array.from({ length: 20 }, (_, index) => `line-${index}-${"x".repeat(40)}`).join("\n");
  const chunks = chunkDocument(source, 500, 80);
  assert.ok(chunks.length > 1); assert.ok(chunks.every((chunk) => chunk.text.length > 0));
  assert.ok(chunks.slice(1).every((chunk, index) => chunk.start < chunks[index]!.end));
  assert.throws(() => chunkDocument(source, 499), /maxCharacters/);
  assert.throws(() => chunkDocument(source, 500, 500), /overlap/);
});

test("summarizeChunks aborts with chunk context on empty or failed summaries", async () => {
  const document = { path: "long.md", name: "long.md", kind: "markdown" as const, content: "x".repeat(1_100) };
  await assert.rejects(summarizeChunks({ document, model: "mock", chunkSize: 500, client: { async generate() { return ""; } } }), (error: unknown) => error instanceof Error && error.message.includes("chunk 1/"));
  await assert.rejects(summarizeChunks({ document, model: "mock", chunkSize: 500, client: { async generate() { throw new Error("offline"); } } }), /chunk 1\/.*offline/);
});

test("multi-chunk generation uses summaries before the final prompt", async () => {
  const document = { path: "long.md", name: "long.md", kind: "markdown" as const, content: "x".repeat(1_100) };
  const prompts: string[] = [];
  const deck = await generatePresentation({ document, model: "mock", targetSlideCount: 1, chunkSize: 500, client: { async generate(options) { prompts.push(options.prompt); return prompts.length === 1 || prompts.length === 2 || prompts.length === 3 ? `summary-${prompts.length}` : JSON.stringify({ title: "Deck", slides: [{ title: "One" }] }); } } });
  assert.equal(deck.title, "Deck"); assert.match(prompts.at(-1) ?? "", /summary-1/); assert.match(prompts.at(-1) ?? "", /summary-2/);
});
