import assert from "node:assert/strict";
import { test } from "node:test";
import { addSlide, createInitialState, duplicateSlide, moveSlide, removeSlide, replacePresentation, updateSlide } from "../public/state.js";

function stateWithSlides() {
  const state = createInitialState();
  replacePresentation(state, { title: "Deck", slides: [{ title: "One", layout: "content", bullets: ["A"] }, { title: "Two", layout: "summary", bullets: ["B"] }] });
  return state;
}

test("presentation state supports add, duplicate, reorder, edit, and delete", () => {
  const state = stateWithSlides();
  assert.equal(addSlide(state), true);
  assert.equal(state.presentation?.slides.length, 3);
  assert.equal(duplicateSlide(state, 0), true);
  assert.equal(state.presentation?.slides.length, 4);
  assert.equal(moveSlide(state, 1, -1), true);
  assert.equal(state.presentation?.slides[0]?.title, "One");
  assert.equal(updateSlide(state, 0, { title: "Updated" }), true);
  assert.equal(state.presentation?.slides[0]?.title, "Updated");
  assert.equal(removeSlide(state, 0), true);
  assert.equal(state.presentation?.slides.length, 3);
  assert.equal(state.dirty, true);
});

test("the last remaining slide cannot be removed", () => {
  const state = createInitialState();
  replacePresentation(state, { title: "Deck", slides: [{ title: "Only", layout: "content", bullets: [] }] });
  assert.equal(removeSlide(state, 0), false);
  assert.equal(state.presentation?.slides.length, 1);
});

