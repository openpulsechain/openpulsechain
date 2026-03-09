// OpenPulsechain Extension — Background Service Worker
// Handles: periodic alert polling, badge updates, notifications

const SAFETY_API = 'https://safety.openpulsechain.com'
const ALARM_NAME = 'check-alerts'
const CHECK_INTERVAL_MINUTES = 5

// Track last seen alert to avoid duplicate notifications
let lastAlertId = 0

// Setup periodic alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES })
  // Set initial badge
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' })
  chrome.action.setBadgeText({ text: '' })
})

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await checkAlerts()
  }
})

async function checkAlerts() {
  try {
    // Check if notifications are enabled
    const settings = await chrome.storage.sync.get('notifications')
    if (settings.notifications === false) return

    const res = await fetch(`${SAFETY_API}/api/v1/alerts/recent?limit=5`)
    if (!res.ok) return
    const data = await res.json()
    const alerts = data.alerts || []

    if (alerts.length === 0) {
      chrome.action.setBadgeText({ text: '' })
      return
    }

    // Count new alerts since last check
    const newAlerts = alerts.filter((a: { id: number }) => a.id > lastAlertId)
    if (newAlerts.length > 0) {
      lastAlertId = Math.max(...alerts.map((a: { id: number }) => a.id))

      // Update badge
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
      chrome.action.setBadgeText({ text: String(newAlerts.length) })

      // Send notification for critical/high alerts
      const critical = newAlerts.filter(
        (a: { alert_level: string }) => a.alert_level === 'critical' || a.alert_level === 'high'
      )
      if (critical.length > 0) {
        const alert = critical[0]
        chrome.notifications.create(`alert-${alert.id}`, {
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: `Scam Alert: ${alert.token_symbol || 'Unknown Token'}`,
          message: alert.detail || `${alert.alert_type} detected`,
          priority: 2,
        })
      }
    }
  } catch {
    // Silently fail — service worker will retry next alarm
  }
}

// Handle notification clicks — open alerts page
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('alert-')) {
    chrome.tabs.create({ url: 'https://www.openpulsechain.com/alerts' })
  }
  chrome.notifications.clear(notifId)
})

// Clear badge when popup opens
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    chrome.action.setBadgeText({ text: '' })
  }
})

// Message handler for content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_TOKEN_SAFETY') {
    fetch(`${SAFETY_API}/api/v1/token/${message.address}/safety`)
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true // async response
  }

  if (message.type === 'CHECK_DEPLOYER') {
    fetch(`${SAFETY_API}/api/v1/deployer/${message.address}`)
      .then((res) => res.json())
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }
})
