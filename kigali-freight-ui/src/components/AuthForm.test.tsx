import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSocket } from '../context/SocketContext';
import AuthForm from './AuthForm';

vi.mock('../context/SocketContext', () => ({
    useSocket: vi.fn(),
}));

const mockedUseSocket = vi.mocked(useSocket);

describe('AuthForm', () => {
    const login = vi.fn();

    beforeEach(() => {
        login.mockReset();
        mockedUseSocket.mockReturnValue({ login, authError: '' } as unknown as ReturnType<typeof useSocket>);
    });

    it('associates each label with its input via htmlFor/id, so clicking a label focuses the field', () => {
        render(<AuthForm />);
        const usernameInput = screen.getByLabelText('Username');
        const passwordInput = screen.getByLabelText('Password');
        expect(usernameInput).toHaveAttribute('type', 'text');
        expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('submits the entered username/password to login()', async () => {
        render(<AuthForm />);
        await userEvent.type(screen.getByLabelText('Username'), 'dispatcher1');
        await userEvent.type(screen.getByLabelText('Password'), 'hunter2');
        await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

        expect(login).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledWith({ username: 'dispatcher1', password: 'hunter2' });
    });

    it('shows the auth error message from context when present', () => {
        mockedUseSocket.mockReturnValue({ login, authError: 'Invalid username or password.' } as unknown as ReturnType<typeof useSocket>);
        render(<AuthForm />);
        expect(screen.getByText('Invalid username or password.')).toBeInTheDocument();
    });

    it('does not show an error banner when there is none', () => {
        render(<AuthForm />);
        expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    });
});
