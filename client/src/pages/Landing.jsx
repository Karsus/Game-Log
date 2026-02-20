import React, { useEffect, useState } from 'react'
import { healthCheck } from '../Api/Main'

export default function Landing() {
  const [serverStatus, setServerStatus] = useState(null)

  useEffect(() => {
    healthCheck()
      .then(data => setServerStatus(data.status))
      .catch(() => setServerStatus('error'))
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>🎮 Game Log</h1>
        <p style={styles.subtitle}>Welcome to Game Log</p>
        <div style={styles.statusContainer}>
          <span style={styles.statusLabel}>Server Status:</span>
          <span
            style={{
              ...styles.statusBadge,
              backgroundColor: serverStatus === 'ok' ? '#4caf50' : serverStatus === 'error' ? '#f44336' : '#ff9800',
            }}
          >
            {serverStatus === 'ok' ? '● Connected' : serverStatus === 'error' ? '● Disconnected' : '● Checking...'}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    fontFamily: "'Montserrat', sans-serif",
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(10px)',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  title: {
    fontSize: '3rem',
    fontWeight: '700',
    color: '#ffffff',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: 'rgba(255, 255, 255, 0.7)',
    margin: '0 0 32px 0',
  },
  statusContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  statusLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '0.9rem',
  },
  statusBadge: {
    color: '#ffffff',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '0.85rem',
    fontWeight: '600',
  },
}
