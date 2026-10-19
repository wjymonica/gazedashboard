import React from 'react'

const API_BASE: string = (import.meta as any).env?.VITE_BACKEND_URL || ''
const apiUrl = (path: string) => {
  const base = API_BASE ? API_BASE.replace(/\/+$/, '') : ''
  const p = path.startsWith('/') ? path : `/${path}`
  return base + p
}

interface HomeProps {
  onSelectFolder: (folder: string) => void
}

export const Home: React.FC<HomeProps> = ({ onSelectFolder }) => {
  const [folders, setFolders] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState<boolean>(true)

  React.useEffect(() => {
    fetch(apiUrl('/api/folders'), { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then(data => {
        setFolders(data.folders || [])
        setLoading(false)
      })
      .catch(() => {
        setFolders([])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '800px',
        padding: '3rem',
        background: 'rgba(255, 255, 255, 0.95)',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 700,
          color: '#1a202c',
          marginBottom: '0.5rem',
          textAlign: 'center',
        }}>
          Surgical Dashboard
        </h1>
        <p style={{
          fontSize: '1.125rem',
          color: '#718096',
          marginBottom: '2.5rem',
          textAlign: 'center',
        }}>
          Select a data source to view the dashboard
        </p>

        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#718096',
            fontSize: '1rem',
          }}>
            Loading available dashboards...
          </div>
        ) : folders.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#e53e3e',
            fontSize: '1rem',
          }}>
            No data sources found. Please add folders to backend/data/
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem',
          }}>
            {folders.map(folder => (
              <button
                key={folder}
                onClick={() => onSelectFolder(folder)}
                style={{
                  padding: '2rem 1.5rem',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: 'white',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)',
                  textTransform: 'capitalize',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.6)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(102, 126, 234, 0.4)'
                }}
              >
                {folder}
              </button>
            ))}
            <button
              onClick={() => { window.location.href = '/feedback/index.html' }}
              style={{
                gridColumn: '1 / -1',
                padding: '2rem 1.5rem',
                fontSize: '1.25rem',
                fontWeight: 600,
                color: 'white',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 14px rgba(102, 126, 234, 0.4)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(102, 126, 234, 0.6)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(102, 126, 234, 0.4)'
              }}
            >
              Resident A Review
            </button>
          </div>
        )}
      </div>

      <div style={{
        marginTop: '2rem',
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: '0.875rem',
        textAlign: 'center',
      }}>
        Surgical Training Dashboard v1.0
      </div>
    </div>
  )
}

