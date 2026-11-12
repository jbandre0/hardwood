// Runs the heavy 40,000-game prediction off the main thread.
import { predict } from "./engine.js";

self.onmessage = (e) => {
  const { id, rowA, rowB, venue, n, seed } = e.data;
  try {
    const res = predict(rowA, rowB, venue, { n, seed, hist: true });
    self.postMessage({ id, res });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
