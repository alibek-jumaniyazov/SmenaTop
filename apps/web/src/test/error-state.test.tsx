import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ApiError } from '../api';
import { ErrorState } from '../components';
import '../i18n';

afterEach(cleanup);

describe('Safe customer errors', () => {
  it('does not display internal errors, raw response messages, or unknown codes', () => {
    const secret = 'postgresql://private-host:5432/internal';
    const { rerender } = render(<ErrorState error={new Error(secret)} />);
    expect(screen.queryByText(secret)).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Hozir amalni bajarib bo‘lmadi.');
    rerender(<ErrorState error={new ApiError(500, secret, secret)} />);
    expect(screen.queryByText(secret)).toBeNull();
    expect(screen.getByRole('alert')).not.toHaveTextContent('postgresql');
  });

  it('gives actionable known-code guidance without displaying server text', () => {
    render(
      <ErrorState error={new ApiError(401, 'OTP_INVALID_OR_EXPIRED', 'internal auth details')} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Kod noto‘g‘ri yoki uning muddati tugagan.',
    );
    expect(screen.queryByText('internal auth details')).toBeNull();
  });
});
