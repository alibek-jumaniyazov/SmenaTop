import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationPatchSchema } from './profile.service';

test('company profile PATCH requires version and explicit fields, preserves omission and supports clearing', () => {
  assert.deepEqual(organizationPatchSchema.parse({ version: 2, description: ' About us ' }), {
    version: 2,
    description: 'About us',
  });
  assert.deepEqual(
    organizationPatchSchema.parse({ version: 2, website: null, stir: null, contactPhone: null }),
    {
      version: 2,
      website: null,
      stir: null,
      contactPhone: null,
    },
  );
  for (const body of [
    { version: 1 },
    { name: 'Company' },
    { version: 0, name: 'Company' },
    { version: 1, verificationStatus: 'VERIFIED' },
  ])
    assert.equal(organizationPatchSchema.safeParse(body).success, false);
});

test('company website validation fails safely for malformed URLs and unsafe protocols', () => {
  for (const website of [
    'not a URL',
    'https://',
    'javascript:alert(1)',
    'data:text/html,hello',
    'ftp://example.org',
    'https://user:secret@example.org',
  ])
    assert.equal(
      organizationPatchSchema.safeParse({ version: 1, website }).success,
      false,
      website,
    );
  for (const website of ['https://example.org/careers', 'http://example.org'])
    assert.equal(organizationPatchSchema.safeParse({ version: 1, website }).success, true);
});

test('company identity and contacts obey length, STIR and E164 constraints', () => {
  for (const patch of [
    { name: '  ' },
    { name: 'x'.repeat(151) },
    { contactName: 'x'.repeat(101) },
    { stir: '12345678' },
    { stir: '12345678x' },
    { cityId: 'not-a-city' },
    { contactPhone: '998901234567' },
    { contactPhone: '+0981234567' },
    { description: 'x'.repeat(3001) },
    { website: `https://example.org/${'x'.repeat(500)}` },
  ])
    assert.equal(organizationPatchSchema.safeParse({ version: 1, ...patch }).success, false);
  assert.equal(
    organizationPatchSchema.safeParse({
      version: 1,
      stir: '123456789',
      contactPhone: '+998901234567',
    }).success,
    true,
  );
});
