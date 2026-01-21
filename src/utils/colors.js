// Copyright (C) 2026 THYPRESS

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org>.

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  // yellow: '\x1b[33m', // This color is not properly working for "Warning"
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Checks if the terminal supports colors.
 * Compatible with Bun.js, Node.js, and standard CI environments.
 */
const supportsColor = () => {
  // 1. Check if process exists (guards against browser environments)
  if (typeof process === 'undefined') return false;

  // 2. Explicit overrides (standard for CLI tools)
  // FORCE_COLOR=1 (or any non-zero value) forces color
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  // NO_COLOR=1 disables color (https://no-color.org/)
  if (process.env.NO_COLOR) return false;

  // 3. Check if stdout is a TTY (Terminal)
  // This works in both Node and Bun
  return process.stdout.isTTY;
};

// A tiny helper to apply color only if supported
const paint = (colorCode, text) => supportsColor() ? `${colorCode}${text}${colors.reset}` : text;

// Standardized to 1 space after icon for alignment
export const success = (msg) => `${paint(colors.green, '[done]')} ${msg}`;
export const error = (msg) => `${paint(colors.red, '[fail]')} ${msg}`;
export const warning = (msg) => `${paint(colors.bright, '[warn]')} ${msg}`;
export const info = (msg) => `${paint(colors.blue, '[info]')} ${msg}`;

export const dim = (msg) => paint(colors.dim, msg);
export const bright = (msg) => paint(colors.bright, msg);
