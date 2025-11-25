import React from 'react'
import { App } from './App'

interface DashboardProps {
  folder: string
  onBack: () => void
}

export const Dashboard: React.FC<DashboardProps> = ({ folder, onBack }) => {
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Back button header */}
      <div style={{
        padding: '0.75rem 1.5rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#667eea',
            background: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateX(-4px)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateX(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <span>←</span> Back to Home
        </button>
        <span style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          textTransform: 'capitalize',
        }}>
          Dashboard: {folder}
        </span>
      </div>

      {/* Dashboard content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <App folder={folder} />
      </div>
    </div>
  )
}

