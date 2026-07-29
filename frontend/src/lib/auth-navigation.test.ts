import { describe, expect, it } from 'vitest'

import { getSessionBridgeUrl } from './auth-navigation.ts'

describe('getSessionBridgeUrl', () => {
  it('sends the current application URL through the login session bridge', () => {
    expect(getSessionBridgeUrl('https://earlywakeup.dailin.tech/?view=donations')).toBe(
      'https://login.dailin.tech/auth/bridge?next=https%3A%2F%2Fearlywakeup.dailin.tech%2F%3Fview%3Ddonations',
    )
  })
})
