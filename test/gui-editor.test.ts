import assert from "node:assert/strict";
import { test } from "node:test";
import { addSlide, createEditorHistory, deleteSlide, duplicateSlide, moveSlide } from "../public/editor.js";

function deck() {
  return {
    title: "Deck",
    slides: [
      { title: "One", layout: "content", bullets: ["A"], speakerNotes: "Note" },
      { title: "Two", layout: "content", bullets: ["B"] },
      { title: "Three", layout: "content", bullets: ["C"] }
    ]
  };
}

test("slide operations are immutable and support add, duplicate, delete, and move", () => {
  const original = deck();
  const added = addSlide(original);
  assert.equal(added.slides.length, 4);
  assert.equal(added.slides[3].title, "新しいスライド");
  assert.equal(original.slides.length, 3);

  const duplicated = duplicateSlide(original, 0);
  assert.deepEqual(duplicated.slides.map((slide) => slide.title), ["One", "One", "Two", "Three"]);
  duplicated.slides[1].bullets.push("changed");
  assert.deepEqual(original.slides[0].bullets, ["A"]);

  const deleted = deleteSlide(original, 1);
  assert.deepEqual(deleted.slides.map((slide) => slide.title), ["One", "Three"]);
  assert.deepEqual(deleteSlide(original, 0).slides.map((slide) => slide.title), ["Two", "Three"]);

  assert.deepEqual(moveSlide(original, 1, -1).slides.map((slide) => slide.title), ["Two", "One", "Three"]);
  assert.deepEqual(moveSlide(original, 1, 1).slides.map((slide) => slide.title), ["One", "Three", "Two"]);
  assert.deepEqual(moveSlide(original, 0, -1).slides.map((slide) => slide.title), ["One", "Two", "Three"]);
  assert.deepEqual(moveSlide(original, 2, 1).slides.map((slide) => slide.title), ["One", "Two", "Three"]);
});

test("history supports undo and redo and drops redo after a new edit", () => {
  const history = createEditorHistory(deck());
  const changed = addSlide(deck());
  history.commit(changed);
  assert.equal(history.canUndo(), true);
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo().slides.length, 3);
  assert.equal(history.canRedo(), true);
  assert.equal(history.redo().slides.length, 4);
  history.undo();
  history.commit(deleteSlide(deck(), 0));
  assert.equal(history.canRedo(), false);
  assert.equal(history.current().slides.length, 2);
});

test("history keeps at most 50 undo snapshots", () => {
  const history = createEditorHistory(deck());
  for (let index = 0; index < 60; index += 1) {
    history.commit({ ...deck(), title: `Deck ${index}` });
  }
  assert.equal(history.pastLength(), 50);
  for (let index = 0; index < 50; index += 1) history.undo();
  assert.equal(history.canUndo(), false);
  assert.equal(history.current().title, "Deck 9");
});
