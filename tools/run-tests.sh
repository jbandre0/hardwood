#!/bin/sh
# run every test suite
cd "$(dirname "$0")/.." && node --test tests/*.test.mjs
