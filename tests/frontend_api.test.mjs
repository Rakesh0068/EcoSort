// Node-based tests for the frontend API client's pure logic.
// Compiles web/src/api.ts with the project's own TypeScript compiler and
// exercises apiBase/assetUrl/friendlyHttpError. Run after the compile step:
//   node --test tests/frontend_api.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiBase, assetUrl, friendlyHttpError } from './.compiled/api.js';

describe('apiBase', () => {
  it('defaults to same-origin (empty)', () => {
    assert.equal(apiBase(), '');
  });
  it('leaves absolute API URLs untouched via assetUrl', () => {
    assert.equal(assetUrl('https://api.example.com/x.jpg'), 'https://api.example.com/x.jpg');
    assert.equal(assetUrl('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
    assert.equal(assetUrl(''), '');
  });
  it('prefixes relative asset paths', () => {
    assert.equal(assetUrl('/api/scans/1/image'), '/api/scans/1/image');
  });
});

describe('friendlyHttpError', () => {
  const cases = [
    [400, 'different photo'], [404, 'could not find'], [409, 'busy'],
    [413, 'too large'], [415, 'not supported'], [422, 'incomplete'],
    [429, 'Too many'], [500, 'our side'], [503, 'unavailable'],
  ];
  for (const [status, snippet] of cases) {
    it(`status ${status} is human-readable`, () => {
      assert.match(friendlyHttpError(status), new RegExp(snippet, 'i'));
    });
  }
  it('prefers server detail when present', () => {
    assert.equal(friendlyHttpError(400, 'image exceeds 12 MB limit'), 'image exceeds 12 MB limit');
  });
  it('never leaks numeric-only cryptic text', () => {
    assert.doesNotMatch(friendlyHttpError(418), /^\d+ [A-Z]/);
  });
});
