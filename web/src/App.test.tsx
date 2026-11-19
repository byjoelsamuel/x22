import { render, screen } from '@testing-library/react'
import App from './App'
import { useAuth } from './state/auth'

test('shows the login screen when logged out', () => {
  useAuth.setState({ creds: null })
  render(<App />)
  expect(screen.getByText('x22')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
})
