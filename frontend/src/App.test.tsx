import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as alertsApi from './services/alertsApi';
import * as authApi from './services/authApi';
import * as dashboardApi from './services/dashboardApi';

vi.mock('./services/authApi');
vi.mock('./services/dashboardApi');
vi.mock('./services/alertsApi');

const mockedAuthApi = vi.mocked(authApi);
const mockedDashboardApi = vi.mocked(dashboardApi);
const mockedAlertsApi = vi.mocked(alertsApi);

function mockDashboardEndpoints() {
  mockedDashboardApi.getSummary.mockResolvedValue({
    openTasks: 0,
    overdueTasks: 0,
    dueThisWeek: 0,
    completedThisWeek: 0,
  });
  mockedDashboardApi.getStatusBreakdown.mockResolvedValue([]);
  mockedDashboardApi.getAssigneeBreakdown.mockResolvedValue([]);
  mockedDashboardApi.getCompletionsTrend.mockResolvedValue(
    Array.from({ length: 8 }, () => ({ weekStart: '', weekEnd: '', count: 0 })),
  );
  mockedAlertsApi.listAlerts.mockResolvedValue({ data: [], count: 0 });
}

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

  it('shows the authenticated shell (dashboard + sidebar) for a logged-in user', async () => {
    mockedAuthApi.meRequest.mockResolvedValue({
      id: 'u1',
      name: 'Jane Manager',
      email: 'jane@example.com',
      role: 'MANAGER',
    });
    mockDashboardEndpoints();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });
    expect(screen.getByText('Jane Manager')).toBeInTheDocument();
  });

  it('logs in successfully and reaches the authenticated shell', async () => {
    mockedAuthApi.meRequest.mockRejectedValue(new Error('unauthenticated'));
    mockedAuthApi.loginRequest.mockResolvedValue({
      id: 'u2',
      name: 'Sam Member',
      email: 'sam@example.com',
      role: 'MEMBER',
    });
    mockDashboardEndpoints();

    render(<App />);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'sam@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    });
  });

  it('shows an error message when login fails', async () => {
    mockedAuthApi.meRequest.mockRejectedValue(new Error('unauthenticated'));
    mockedAuthApi.loginRequest.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
      },
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
