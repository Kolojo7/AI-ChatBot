import { render, screen } from '@testing-library/react';
import App from './App';

test('renders welcome message', () => {
  render(<App />);
  const message = screen.getByText(/hello, i am helix/i);
  expect(message).toBeInTheDocument();
});
