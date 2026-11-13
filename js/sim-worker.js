// Runs the heavy 40,000-game prediction off the main thread.
import { predict as predict9 } from "./engine.js";
import { predict as predict10 } from "./engine-v10.js";

self.onmessage = (e) => {
  const { id, rowA, rowB, venue, n, seed, engine } = e.data, predict = engine === "v9" ? predict9 : predict10;
  try {
    const res = predict(rowA, rowB, venue, { n, seed, hist: true });
    self.postMessage({ id, res });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
