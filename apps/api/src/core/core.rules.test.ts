import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftPatchSchema, shiftSchema } from './shifts.service';
test('PATCH preserves absent fields instead of applying create defaults', () => {
  assert.deepEqual(shiftPatchSchema.parse({ version: 1, headcount: 2 }), {
    version: 1,
    headcount: 2,
  });
  assert.equal(shiftPatchSchema.safeParse({ version: 1, amountMinor: '-1' }).success, false);
});
test('money requires integer minor-unit decimal strings', () => {
  const input = {
    branchId: '3e8447be-51f9-4cf9-b42b-87af4b00d735',
    categoryId: '3e8447be-51f9-4cf9-b42b-87af4b00d735',
    title: 'Test shift',
    description: 'A meaningful shift description',
    startAt: '2030-01-01T22:00:00+05:00',
    endAt: '2030-01-02T06:00:00+05:00',
    headcount: 1,
    payType: 'HOURLY',
  };
  assert.equal(shiftSchema.safeParse({ ...input, amountMinor: '2500000' }).success, true);
  assert.equal(shiftSchema.safeParse({ ...input, amountMinor: 2500000 }).success, false);
  assert.equal(shiftSchema.safeParse({ ...input, amountMinor: '2500000.5' }).success, false);
});
