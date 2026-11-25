import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFirebasePhoneError,
  maskPhoneNumber,
  normalizePhoneNumber,
} from './phone-utils.ts';

test('normalizePhoneNumber formats local and E.164 phone numbers and rejects invalid input', () => {
  const localIndia = normalizePhoneNumber('098765 43210', '+91');
  assert.equal(localIndia.e164, '+919876543210');
  assert.equal(localIndia.maskedPhone, '+91 ••••••3210');

  const explicitUs = normalizePhoneNumber('+1 (415) 555-2671', '+91');
  assert.equal(explicitUs.e164, '+14155552671');
  assert.equal(explicitUs.maskedPhone, '+1 ••••••2671');

  const internationalZeroPrefix = normalizePhoneNumber('0044 7700 900123', '+1');
  assert.equal(internationalZeroPrefix.e164, '+447700900123');

  assert.throws(() => normalizePhoneNumber('   ', '+91'), /enter your mobile/i);
  assert.throws(() => normalizePhoneNumber('1234', '+91'), /valid phone number/i);
  assert.throws(() => normalizePhoneNumber('+0123456789', '+1'), /valid phone number/i);
});

test('maskPhoneNumber obscures middle digits while preserving prefix and last 4 digits', () => {
  assert.equal(maskPhoneNumber('+14155552671'), '+1 ••••••2671');
  assert.equal(maskPhoneNumber('+919876543210'), '+91 ••••••3210');
});

test('formatFirebasePhoneError produces clear guidance for Firebase Phone Auth error codes', () => {
  assert.match(
    formatFirebasePhoneError({ code: 'auth/operation-not-allowed' }),
    /Authentication → Sign-in method and enable Phone/i
  );
  assert.match(
    formatFirebasePhoneError({ code: 'auth/billing-not-enabled' }),
    /Phone numbers for testing/i
  );
  assert.match(
    formatFirebasePhoneError({ code: 'auth/unauthorized-domain' }, 'shift-s-nova1.vercel.app'),
    /"shift-s-nova1\.vercel\.app"/i
  );
  assert.match(
    formatFirebasePhoneError({ code: 'auth/invalid-verification-code' }),
    /6-digit SMS code is incorrect/i
  );
  assert.match(
    formatFirebasePhoneError({ code: 'auth/code-expired' }),
    /expired/i
  );
  assert.match(
    formatFirebasePhoneError({ code: 'auth/too-many-requests' }),
    /Too many SMS attempts/i
  );
});
