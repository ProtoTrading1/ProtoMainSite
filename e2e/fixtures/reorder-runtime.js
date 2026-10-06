// Resolve all renderer imports through Vite together. Direct optimized-deps
// URLs can instantiate different shared internals and invalidate flush tests.
import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
export { React, flushSync, createRoot };
