import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as authApi from './services/authApi';

vi.mock('./services/authApi');
const mockedAuthApi = vi.mocked(authApi);

describe('App auth flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('redirects an unauthenticated user from "/" to "/login"', async () => {
    mockedAuthApi.meRequest.mockRejectedValue(new Error('unauthenticated'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
  });

  it('shows the authenticated shell for a logged-in user', async () => {
    mockedAuthApi.meRequest.mockResolvedValue({
      id: 'u1',
      name: 'Jane Manager',
      email: 'jane@example.com',
      role: 'MANAGER',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/welcome, jane manager/i)).toBeInTheDocument();
    });
  });

  it('logs in successfully and reaches the authenticated shell', async () => {
    mockedAuthApi.meRequest.mockRejectedValue(new Error('unauthenticated'));
    mockedAuthApi.loginRequest.mockResolvedValue({
      id: 'u2',
      name: 'Sam Member',
      email: 'sam@example.com',
      role: 'MEMBER',
    });

    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'sam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/welcome, sam member/i)).toBeInTheDocument();
    });
  });

  it('shows an error message when login fails', async () => {
    mockedAuthApi.meRequest.mockRejectedValue(new Error('unauthenticated'));
    mockedAuthApi.loginRequest.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } } },
    });

    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());
    await user.type(screen.getByLabelText(/email/i), 'sam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i);
    });
  });
});
