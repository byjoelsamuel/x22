import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import App from './App'
import { useAuth } from './state/auth'
import { usePlayer } from './state/player'
import { useSettings } from './state/settings'
import { useUi } from './state/ui'

const creds = { server: 'https://music.lan', user: 'joel', token: 't', salt: 's' }

beforeEach(() => {
  useAuth.setState({ creds: null })
  useUi.setState({ connectOpen: false })
  usePlayer.setState({ queue: [], index: -1, playing: false })
})

test('first run offers the homelab, but it can be skipped', () => {
  useSettings.setState({ onboarded: false })
  render(<App />)
  expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Skip/ }))
  expect(useSettings.getState().onboarded).toBe(true)
  // lands on Home with the EQ — no login wall
  expect(screen.getByText('Equaliser')).toBeTruthy()
})

test('without a homelab the app still works and Library asks to connect', () => {
  useSettings.setState({ onboarded: true })
  render(<App />)
  expect(screen.getByText('Sound mode')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Library' }))
  expect(screen.getByText('Your library lives on your homelab')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Connect homelab' }))
  expect(useUi.getState().connectOpen).toBe(true)
  expect(screen.getByRole('dialog', { name: 'Connect homelab' })).toBeTruthy()
})

test('existing users who already connected skip onboarding', () => {
  useSettings.setState({ onboarded: false })
  useAuth.setState({ creds })
  render(<App />)
  expect(screen.getByText('Equaliser')).toBeTruthy()
})

test('disconnecting the homelab clears its queue', () => {
  useSettings.setState({ onboarded: true })
  useAuth.setState({ creds })
  usePlayer.setState({ queue: [{ id: 's1', title: 'Song' }], index: 0 })
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
  expect(useAuth.getState().creds).toBeNull()
  expect(usePlayer.getState().queue).toEqual([])
  expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
})
